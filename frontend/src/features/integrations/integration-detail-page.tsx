"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  clearPendingIntegrationOauthContext,
  savePendingIntegrationOauthContext,
  type IntegrationOauthProvider,
} from "@/lib/integration-oauth";
import {
  getHubChannel,
  getIntegrationStatus,
  integrationsCatalog,
  oauthProviders,
  parseList,
  valueOrEmpty,
  type IntegrationHubResponse,
  type IntegrationKey,
  type IntegrationSettings,
} from "@/features/integrations/config";

function getPatchPayload(key: IntegrationKey, draft: IntegrationSettings["integrations"]) {
  if (key === "email") {
    return {
      emailProvider: draft.email.provider ?? draft.emailProvider,
      webhookUrl: draft.email.webhookUrl ?? draft.webhookUrl,
      email: draft.email,
    };
  }
  if (key === "whatsapp") {
    return {
      whatsappProvider: draft.whatsapp.provider ?? draft.whatsappProvider,
      webhookUrl: draft.whatsapp.webhookUrl ?? draft.webhookUrl,
      whatsapp: draft.whatsapp,
    };
  }
  if (key === "linkedin") {
    return {
      linkedin: draft.linkedin,
    };
  }
  if (key === "documents") {
    return {
      documents: draft.documents,
    };
  }
  return {
    slackWebhookUrl: draft.slackWebhookUrl,
    webhookUrl: draft.genericWebhooks.inboundUrl ?? draft.webhookUrl,
    genericWebhooks: draft.genericWebhooks,
  };
}

export function IntegrationDetailPage({ integrationKey }: { integrationKey: IntegrationKey }) {
  const integration = integrationsCatalog.find((item) => item.key === integrationKey)!;
  const [hub, setHub] = useState<IntegrationHubResponse | null>(null);
  const [draft, setDraft] = useState<IntegrationSettings["integrations"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<IntegrationOauthProvider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<IntegrationOauthProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [oauthResult, setOauthResult] = useState<{ ok: boolean; provider: string | null } | null>(null);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        if (typeof window !== "undefined") {
          const paramsFromUrl = new URLSearchParams(window.location.search);
          if (paramsFromUrl.get("oauth") === "success") {
            setOauthResult({ ok: true, provider: paramsFromUrl.get("provider") });
          }
        }

        const [hubPayload, settingsPayload] = await Promise.all([
          apiRequest<IntegrationHubResponse>("/settings/integration-hub"),
          apiRequest<IntegrationSettings>("/settings/integrations"),
        ]);

        if (!disposed) {
          setHub(hubPayload);
          setDraft(settingsPayload.integrations);
        }
      } catch (caughtError) {
        if (!disposed) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load integration details.");
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, []);

  const stepChecks = useMemo(() => {
    if (!draft) {
      return [];
    }

    if (integrationKey === "email") {
      return [
        { label: "Connect provider", done: Boolean(draft.email.provider ?? draft.emailProvider) },
        { label: "Set sender details", done: Boolean(draft.email.fromEmail && draft.email.domain) },
        { label: "Add event webhook", done: Boolean(draft.email.webhookUrl ?? draft.webhookUrl) },
      ];
    }
    if (integrationKey === "whatsapp") {
      return [
        { label: "Select provider", done: Boolean(draft.whatsapp.provider ?? draft.whatsappProvider) },
        { label: "Map business IDs", done: Boolean(draft.whatsapp.phoneNumberId && draft.whatsapp.businessAccountId) },
        { label: "Verify webhook", done: Boolean(draft.whatsapp.webhookUrl && draft.whatsapp.verifyToken && draft.whatsapp.appSecret) },
      ];
    }
    if (integrationKey === "linkedin") {
      return [
        { label: "Connect OAuth", done: Boolean(draft.linkedin.provider) },
        { label: "Set organization URN", done: Boolean(draft.linkedin.organizationUrn) },
        { label: "Add lead endpoint", done: Boolean(draft.linkedin.webhookUrl) },
      ];
    }
    if (integrationKey === "documents") {
      return [
        { label: "Set intake email", done: Boolean(draft.documents.intakeEmail) },
        { label: "Set storage folder", done: Boolean(draft.documents.storageFolder) },
        { label: "Enable auto-attach", done: draft.documents.autoAttachToRecords === true },
      ];
    }
    return [
      { label: "Set inbound URL", done: Boolean(draft.genericWebhooks.inboundUrl) },
      { label: "Set outbound or Slack URL", done: Boolean(draft.genericWebhooks.outboundUrl || draft.slackWebhookUrl) },
      { label: "Set signing hint", done: Boolean(draft.genericWebhooks.signingSecretHint) },
    ];
  }, [draft, integrationKey]);

  const channelStatus = useMemo(() => {
    if (stepChecks.length > 0 && stepChecks.every((step) => step.done)) {
      return "completed" as const;
    }
    return getIntegrationStatus(integrationKey, hub, draft);
  }, [draft, hub, integrationKey, stepChecks]);

  const refreshHub = async () => {
    const nextHub = await apiRequest<IntegrationHubResponse>("/settings/integration-hub");
    setHub(nextHub);
  };

  const saveIntegration = async () => {
    if (!draft) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = getPatchPayload(integrationKey, draft);
      const response = await apiRequest<IntegrationSettings>("/settings/integrations", {
        method: "PATCH",
        body: JSON.stringify({
          integrations: payload,
        }),
      });
      setDraft(response.integrations);
      await refreshHub();
      toast.success("Integration saved.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to save integration.");
    } finally {
      setSaving(false);
    }
  };

  const startOauth = async (providerConfig: (typeof oauthProviders)[number]) => {
    setOauthLoading(providerConfig.provider);
    setError(null);
    clearPendingIntegrationOauthContext();
    savePendingIntegrationOauthContext({
      provider: providerConfig.provider,
      channel: providerConfig.channel,
      returnPath: `/dashboard/integrations/${integrationKey}`,
      scopes: providerConfig.scopes,
    });

    const { supabase } = await import("@/lib/supabase");

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: providerConfig.provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: providerConfig.scopes.join(" "),
        queryParams: providerConfig.queryParams,
      },
    });

    if (oauthError) {
      clearPendingIntegrationOauthContext();
      setOauthLoading(null);
      setError(oauthError.message);
    }
  };

  const disconnectOauth = async (providerConfig: (typeof oauthProviders)[number]) => {
    setDisconnectingProvider(providerConfig.provider);
    setError(null);
    try {
      await apiRequest("/settings/integrations/oauth/disconnect", {
        method: "POST",
        body: JSON.stringify({
          channel: providerConfig.channel,
          provider: providerConfig.provider,
        }),
      });

      const settingsPayload = await apiRequest<IntegrationSettings>("/settings/integrations");
      setDraft(settingsPayload.integrations);
      await refreshHub();
      toast.success(`${providerConfig.title} disconnected.`);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to disconnect provider.");
    } finally {
      setDisconnectingProvider(null);
    }
  };

  const Icon = integration.icon;
  const oauthConfigs =
    integration.key === "email"
      ? oauthProviders.filter((provider) => provider.channel === "email")
      : integration.key === "linkedin"
        ? oauthProviders.filter((provider) => provider.channel === "linkedin")
        : [];

  return (
    <div className="grid gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Save failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {oauthResult?.ok ? (
        <Alert>
          <AlertTitle>OAuth connected</AlertTitle>
          <AlertDescription>{oauthResult.provider ?? "Provider"} was linked successfully.</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-border/60">
        <CardHeader>
          <div className="mb-2">
            <Link href="/dashboard/integrations" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <Icon className="size-5" />
              </span>
              <div>
                <CardTitle>{integration.title}</CardTitle>
                <CardDescription>{integration.description}</CardDescription>
              </div>
            </div>
            <Badge variant={channelStatus === "completed" ? "secondary" : "outline"}>
              {channelStatus === "completed" ? "Completed" : "Pending"}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Step by step</CardTitle>
            <CardDescription>Complete each step to finish setup.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {integration.steps.map((step, index) => (
              <div key={step} className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-7 items-center justify-center rounded-lg bg-sky-100 text-xs font-semibold text-sky-700">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium">{step}</span>
                </div>
                <Badge variant={stepChecks[index]?.done ? "secondary" : "outline"}>
                  {stepChecks[index]?.done ? "Done" : "Pending"}
                </Badge>
              </div>
            ))}
            {getHubChannel(hub, integration.key)?.docs?.slice(0, 2).map((doc) => (
              <a key={doc.url} href={doc.url} target="_blank" rel="noreferrer" className="rounded-xl border border-border/60 px-4 py-3 text-sm font-medium hover:bg-muted/20">
                {doc.label}
              </a>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Live setup</CardTitle>
            <CardDescription>Update details and save.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {oauthConfigs.length > 0 && draft ? (
              <div className="grid gap-2">
                {oauthConfigs.map((providerConfig) => {
                  const linkedProvider =
                    providerConfig.channel === "email"
                      ? (draft.email.provider ?? draft.emailProvider)
                      : draft.linkedin.provider;
                  const isLinked = linkedProvider === providerConfig.provider;

                  return (
                    <div key={providerConfig.provider} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 px-3 py-2.5">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {providerConfig.title}
                        <Badge variant={isLinked ? "secondary" : "outline"}>{isLinked ? "Linked" : "Not linked"}</Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" disabled={oauthLoading === providerConfig.provider} onClick={() => void startOauth(providerConfig)}>
                          {oauthLoading === providerConfig.provider ? "Redirecting..." : isLinked ? "Reconnect" : "Connect"}
                        </Button>
                        {isLinked ? (
                          <Button type="button" size="sm" variant="ghost" disabled={disconnectingProvider === providerConfig.provider} onClick={() => void disconnectOauth(providerConfig)}>
                            {disconnectingProvider === providerConfig.provider ? "Disconnecting..." : "Disconnect"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {!draft ? <p className="text-sm text-muted-foreground">Loading form...</p> : null}

            {draft && integration.key === "email" ? (
              <FieldGroup>
                <Field>
                  <FieldLabel>Provider</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.email.provider ?? draft.emailProvider)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              emailProvider: event.target.value || null,
                              email: { ...current.email, provider: event.target.value || null },
                            }
                          : current,
                      )
                    }
                    placeholder="google / azure / resend"
                  />
                </Field>
                <Field>
                  <FieldLabel>From email</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.email.fromEmail)}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, email: { ...current.email, fromEmail: event.target.value || null } } : current))
                    }
                    placeholder="crm@yourdomain.com"
                  />
                </Field>
                <Field>
                  <FieldLabel>Reply-to email</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.email.replyToEmail)}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, email: { ...current.email, replyToEmail: event.target.value || null } } : current))
                    }
                    placeholder="ops@yourdomain.com"
                  />
                </Field>
                <Field>
                  <FieldLabel>Domain</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.email.domain)}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, email: { ...current.email, domain: event.target.value || null } } : current))
                    }
                    placeholder="yourdomain.com"
                  />
                </Field>
                <Field>
                  <FieldLabel>Event webhook URL</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.email.webhookUrl ?? draft.webhookUrl)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              webhookUrl: event.target.value || null,
                              email: { ...current.email, webhookUrl: event.target.value || null },
                            }
                          : current,
                      )
                    }
                    placeholder="https://api.example.com/email/events"
                  />
                </Field>
              </FieldGroup>
            ) : null}

            {draft && integration.key === "whatsapp" ? (
              <FieldGroup>
                <Field>
                  <FieldLabel>Provider</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.whatsapp.provider ?? draft.whatsappProvider)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              whatsappProvider: event.target.value || null,
                              whatsapp: { ...current.whatsapp, provider: event.target.value || null },
                            }
                          : current,
                      )
                    }
                    placeholder="meta / twilio / 360dialog"
                  />
                </Field>
                <Field>
                  <FieldLabel>Onboarding method</FieldLabel>
                  <NativeSelect
                    value={draft.whatsapp.onboardingMethod}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              whatsapp: {
                                ...current.whatsapp,
                                onboardingMethod: event.target.value as IntegrationSettings["integrations"]["whatsapp"]["onboardingMethod"],
                              },
                            }
                          : current,
                      )
                    }
                    className="h-10 rounded-xl px-3 text-sm"
                  >
                    <option value="cloud_api">Cloud API</option>
                    <option value="embedded_signup">Embedded signup</option>
                    <option value="manual_token">Manual token</option>
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Workspace ID</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.whatsapp.workspaceId)}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, whatsapp: { ...current.whatsapp, workspaceId: event.target.value || null } } : current))
                    }
                    placeholder="Workspace UUID"
                  />
                </Field>
                <Field>
                  <FieldLabel>Phone number ID</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.whatsapp.phoneNumberId)}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, whatsapp: { ...current.whatsapp, phoneNumberId: event.target.value || null } } : current))
                    }
                    placeholder="Meta phone number ID"
                  />
                </Field>
                <Field>
                  <FieldLabel>Business account ID</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.whatsapp.businessAccountId)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, whatsapp: { ...current.whatsapp, businessAccountId: event.target.value || null } } : current,
                      )
                    }
                    placeholder="WABA ID"
                  />
                </Field>
                <Field>
                  <FieldLabel>Verify token</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.whatsapp.verifyToken)}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, whatsapp: { ...current.whatsapp, verifyToken: event.target.value || null } } : current))
                    }
                    placeholder="Webhook verify token"
                  />
                </Field>
                <Field>
                  <FieldLabel>App secret</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.whatsapp.appSecret)}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, whatsapp: { ...current.whatsapp, appSecret: event.target.value || null } } : current))
                    }
                    placeholder="Meta app secret"
                  />
                </Field>
                <Field>
                  <FieldLabel>Webhook URL</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.whatsapp.webhookUrl ?? draft.webhookUrl)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              webhookUrl: event.target.value || null,
                              whatsapp: { ...current.whatsapp, webhookUrl: event.target.value || null },
                            }
                          : current,
                      )
                    }
                    placeholder="https://api.example.com/whatsapp/webhook"
                  />
                </Field>
              </FieldGroup>
            ) : null}

            {draft && integration.key === "linkedin" ? (
              <FieldGroup>
                <Field>
                  <FieldLabel>Provider</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.linkedin.provider)}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, linkedin: { ...current.linkedin, provider: event.target.value || null } } : current))
                    }
                    placeholder="linkedin_oidc"
                  />
                </Field>
                <Field>
                  <FieldLabel>Sync mode</FieldLabel>
                  <NativeSelect
                    value={draft.linkedin.syncMode}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              linkedin: {
                                ...current.linkedin,
                                syncMode: event.target.value as IntegrationSettings["integrations"]["linkedin"]["syncMode"],
                              },
                            }
                          : current,
                      )
                    }
                    className="h-10 rounded-xl px-3 text-sm"
                  >
                    <option value="oauth_pull">OAuth + pull</option>
                    <option value="oauth_push">OAuth + push</option>
                    <option value="hybrid">Hybrid</option>
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Organization URN</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.linkedin.organizationUrn)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, linkedin: { ...current.linkedin, organizationUrn: event.target.value || null } } : current,
                      )
                    }
                    placeholder="urn:li:organization:123456"
                  />
                </Field>
                <Field>
                  <FieldLabel>Lead endpoint</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.linkedin.webhookUrl)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, linkedin: { ...current.linkedin, webhookUrl: event.target.value || null } } : current,
                      )
                    }
                    placeholder="https://api.example.com/linkedin/leads"
                  />
                </Field>
                <Field>
                  <FieldLabel>Scopes</FieldLabel>
                  <Textarea
                    value={draft.linkedin.scopes.join(", ")}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, linkedin: { ...current.linkedin, scopes: parseList(event.target.value) } } : current,
                      )
                    }
                    className="min-h-20"
                    placeholder="Comma or newline separated scopes"
                  />
                </Field>
              </FieldGroup>
            ) : null}

            {draft && integration.key === "documents" ? (
              <FieldGroup>
                <Field>
                  <FieldLabel>Intake email</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.documents.intakeEmail)}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, documents: { ...current.documents, intakeEmail: event.target.value || null } } : current))
                    }
                    placeholder="files@yourdomain.com"
                  />
                </Field>
                <Field>
                  <FieldLabel>Storage folder</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.documents.storageFolder)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, documents: { ...current.documents, storageFolder: event.target.value || null } } : current,
                      )
                    }
                    placeholder="crm/incoming"
                  />
                </Field>
                <Field className="flex-row items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                  <Checkbox
                    checked={draft.documents.autoAttachToRecords}
                    onCheckedChange={(checked) =>
                      setDraft((current) =>
                        current ? { ...current, documents: { ...current.documents, autoAttachToRecords: checked === true } } : current,
                      )
                    }
                  />
                  <div>
                    <FieldLabel>Auto-attach to records</FieldLabel>
                    <FieldDescription>Attach incoming files to matched leads/customers/deals.</FieldDescription>
                  </div>
                </Field>
              </FieldGroup>
            ) : null}

            {draft && integration.key === "webhooks" ? (
              <FieldGroup>
                <Field>
                  <FieldLabel>Inbound URL</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.genericWebhooks.inboundUrl ?? draft.webhookUrl)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              webhookUrl: event.target.value || null,
                              genericWebhooks: { ...current.genericWebhooks, inboundUrl: event.target.value || null },
                            }
                          : current,
                      )
                    }
                    placeholder="https://api.example.com/hooks/inbound"
                  />
                </Field>
                <Field>
                  <FieldLabel>Outbound URL</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.genericWebhooks.outboundUrl)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, genericWebhooks: { ...current.genericWebhooks, outboundUrl: event.target.value || null } } : current,
                      )
                    }
                    placeholder="https://api.example.com/hooks/outbound"
                  />
                </Field>
                <Field>
                  <FieldLabel>Slack webhook URL</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.slackWebhookUrl)}
                    onChange={(event) => setDraft((current) => (current ? { ...current, slackWebhookUrl: event.target.value || null } : current))}
                    placeholder="https://hooks.slack.com/services/..."
                  />
                </Field>
                <Field>
                  <FieldLabel>Signing secret hint</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.genericWebhooks.signingSecretHint)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, genericWebhooks: { ...current.genericWebhooks, signingSecretHint: event.target.value || null } }
                          : current,
                      )
                    }
                    placeholder="How signatures are generated"
                  />
                </Field>
              </FieldGroup>
            ) : null}

            <div className="flex items-center gap-2 pt-2">
              <Button type="button" onClick={() => void saveIntegration()} disabled={loading || !draft || saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void refreshHub()} disabled={loading || saving}>
                Refresh status
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
