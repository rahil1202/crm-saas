"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowUpRight, Mail, MessageSquareText, BookOpenText, FileText, Globe, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { clearPendingIntegrationOauthContext, savePendingIntegrationOauthContext, type IntegrationOauthProvider } from "@/lib/integration-oauth";
import { supabase } from "@/lib/supabase";

type ReadinessStatus = "ready" | "in_progress" | "needs_setup";

interface IntegrationSettings {
  integrations: {
    slackWebhookUrl: string | null;
    whatsappProvider: string | null;
    emailProvider: string | null;
    webhookUrl: string | null;
    workspaceMode: "guided" | "legacy";
    email: {
      provider: string | null;
      deliveryMethod: "api" | "smtp" | "hybrid";
      oauthScopes: string[];
      fromEmail: string | null;
      replyToEmail: string | null;
      domain: string | null;
      webhookUrl: string | null;
      smtpHost: string | null;
      smtpPort: number | null;
      notes: string | null;
    };
    whatsapp: {
      provider: string | null;
      onboardingMethod: "cloud_api" | "embedded_signup" | "manual_token";
      workspaceId: string | null;
      phoneNumberId: string | null;
      businessAccountId: string | null;
      verifyToken: string | null;
      appSecret: string | null;
      webhookUrl: string | null;
      notes: string | null;
    };
    linkedin: {
      provider: string | null;
      syncMode: "oauth_pull" | "oauth_push" | "hybrid";
      organizationUrn: string | null;
      adAccountUrns: string[];
      webhookUrl: string | null;
      scopes: string[];
      features: { leadSync: boolean; orgPosting: boolean };
      notes: string | null;
    };
    documents: {
      intakeEmail: string | null;
      autoAttachToRecords: boolean;
      storageFolder: string | null;
      notes: string | null;
    };
    genericWebhooks: {
      inboundUrl: string | null;
      outboundUrl: string | null;
      signingSecretHint: string | null;
    };
  };
}

const oauthProviders: Array<{
  title: string;
  provider: IntegrationOauthProvider;
  channel: "email" | "linkedin";
  scopes: string[];
  queryParams?: Record<string, string>;
}> = [
  {
    title: "Connect Google Workspace mail",
    provider: "google",
    channel: "email",
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
    queryParams: {
      access_type: "offline",
      prompt: "consent",
    },
  },
  {
    title: "Connect Microsoft 365 mail",
    provider: "azure",
    channel: "email",
    scopes: ["openid", "email", "profile", "offline_access", "User.Read", "Mail.Send", "Mail.Read"],
  },
  {
    title: "Connect LinkedIn",
    provider: "linkedin_oidc",
    channel: "linkedin",
    scopes: ["openid", "profile", "email", "r_organization_admin", "r_organization_social", "w_organization_social"],
  },
];

interface IntegrationHubResponse {
  checkedAt: string;
  overview: {
    attentionRequired: number;
    readyChannels: number;
    connectedAssets: number;
    trackedDocuments: number;
  };
  channels: Array<{
    key: string;
    title: string;
    description: string;
    docs: Array<{ label: string; url: string; source: string }>;
    recommendedFlow: string[];
    readiness: {
      score: number;
      status: ReadinessStatus;
      items: Array<{ key: string; label: string; ready: boolean; detail: string }>;
    };
    records: Record<string, number>;
  }>;
}

const valueOrEmpty = (value: string | null | undefined) => value ?? "";
const numberOrEmpty = (value: number | null | undefined) => (typeof value === "number" ? String(value) : "");
const parseList = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

function statusBadge(status: ReadinessStatus) {
  return <Badge variant={status === "ready" ? "secondary" : status === "in_progress" ? "outline" : "destructive"}>{status.replace("_", " ")}</Badge>;
}

function channelIcon(key: string) {
  if (key === "email") return <Mail className="size-4" />;
  if (key === "whatsapp") return <MessageSquareText className="size-4" />;
  if (key === "linkedin") return <BookOpenText className="size-4" />;
  if (key === "documents") return <FileText className="size-4" />;
  return <Globe className="size-4" />;
}

export default function IntegrationsPage() {
  const [hub, setHub] = useState<IntegrationHubResponse | null>(null);
  const [draft, setDraft] = useState<IntegrationSettings["integrations"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<IntegrationOauthProvider | null>(null);
  const [disconnectingProvider, setDisconnectingProvider] = useState<IntegrationOauthProvider | null>(null);
  const [oauthResult, setOauthResult] = useState<{ ok: boolean; provider: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search);
          if (params.get("oauth") === "success") {
            setOauthResult({
              ok: true,
              provider: params.get("provider"),
            });
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
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load integration workspace.");
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

  const refreshHub = async () => {
    const nextHub = await apiRequest<IntegrationHubResponse>("/settings/integration-hub");
    setHub(nextHub);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;

    setSaving(true);
    setError(null);
    try {
      const response = await apiRequest<IntegrationSettings>("/settings/integrations", {
        method: "PATCH",
        body: JSON.stringify({ integrations: draft }),
      });

      setDraft(response.integrations);
      await refreshHub();
      toast.success("Integration workspace updated.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to save integration workspace.");
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
      returnPath: "/dashboard/integrations",
      scopes: providerConfig.scopes,
    });

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

  return (
    <>
      <div className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Integration workspace error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {oauthResult?.ok ? (
          <Alert>
            <AlertTitle>OAuth link completed</AlertTitle>
            <AlertDescription>{oauthResult.provider ?? "Provider"} was linked to the current workspace and its scopes were stored in integration configuration.</AlertDescription>
          </Alert>
        ) : null}

        <Card className="border-border/60 bg-[radial-gradient(circle_at_top_left,_rgba(16,32,49,0.08),_transparent_55%),linear-gradient(135deg,_rgba(15,23,42,0.98),_rgba(30,41,59,0.92))] text-slate-50">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-white/20 text-slate-50">Docs checked {hub?.checkedAt ?? "loading"}</Badge>
              <Badge variant="outline" className="border-white/20 text-slate-50">Scalable setup flow</Badge>
            </div>
            <CardTitle className="text-3xl">Integration Hub</CardTitle>
            <CardDescription className="text-slate-200">
              The old flow split provider setup between Settings and Social. This view keeps policy, readiness, and operator guidance together before teams move into inbox or campaign execution.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-sm text-slate-300">Ready channels</div><div className="mt-2 text-3xl font-semibold">{hub?.overview.readyChannels ?? 0}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-sm text-slate-300">Needs attention</div><div className="mt-2 text-3xl font-semibold">{hub?.overview.attentionRequired ?? 0}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-sm text-slate-300">Connected assets</div><div className="mt-2 text-3xl font-semibold">{hub?.overview.connectedAssets ?? 0}</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="text-sm text-slate-300">Tracked docs</div><div className="mt-2 text-3xl font-semibold">{hub?.overview.trackedDocuments ?? 0}</div></div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle>OAuth connectors</CardTitle>
              <CardDescription>Supabase OAuth is used where the provider supports it. Email can be linked through Google or Microsoft; LinkedIn can be linked for organization-facing workflows. WhatsApp and raw SMTP stay manual because they are not Supabase OAuth identity providers.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {oauthProviders.map((providerConfig) => (
                <div key={providerConfig.provider} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                  {(() => {
                    const isLinked =
                      providerConfig.channel === "email"
                        ? (draft?.email.provider ?? draft?.emailProvider) === providerConfig.provider
                        : draft?.linkedin.provider === providerConfig.provider;
                    return (
                      <>
                  <div className="grid gap-1">
                    <div className="flex items-center gap-2 font-medium">
                      {providerConfig.title}
                      <Badge variant={isLinked ? "secondary" : "outline"}>{isLinked ? "Linked" : "Not linked"}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">{providerConfig.scopes.join(", ")}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" disabled={oauthLoading === providerConfig.provider} onClick={() => void startOauth(providerConfig)}>
                      {oauthLoading === providerConfig.provider ? "Redirecting..." : isLinked ? "Refresh link" : "Connect"}
                    </Button>
                    {isLinked ? (
                      <Button type="button" variant="ghost" disabled={disconnectingProvider === providerConfig.provider} onClick={() => void disconnectOauth(providerConfig)}>
                        {disconnectingProvider === providerConfig.provider ? "Disconnecting..." : "Disconnect"}
                      </Button>
                    ) : null}
                  </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle>Manual-only integrations</CardTitle>
              <CardDescription>These stay outside Supabase OAuth and must be configured directly against the provider.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">WhatsApp Cloud API requires Meta app credentials, verify token, app secret, and phone number/workspace mapping. It is not a Supabase OAuth login provider.</div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">SMTP/MTA providers are transport layers, not identity providers. Use SMTP host/port or provider APIs after linking the sender identity.</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle>Working flow</CardTitle>
              <CardDescription>Setup should move in one direction instead of bouncing across modules.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">1. Choose the provider and access model here.</div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">2. Connect the operational asset next: email account, WhatsApp workspace, LinkedIn org, or intake endpoint.</div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">3. Turn on webhooks before trusting analytics, routing, or automation.</div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">4. Move to Social, Campaigns, or Documents only after readiness is green.</div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle>Operational modules</CardTitle>
              <CardDescription>Use these after setup is defined here.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Link href="/dashboard/social" className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm font-medium">Social runtime <ArrowUpRight className="size-4" /></Link>
              <Link href="/dashboard/campaigns" className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm font-medium">Campaign operations <ArrowUpRight className="size-4" /></Link>
              <Link href="/dashboard/documents" className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm font-medium">Document library <ArrowUpRight className="size-4" /></Link>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-5">
          {(hub?.channels ?? []).map((channel) => (
            <Card key={channel.key} className="border-border/60">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium">{channelIcon(channel.key)} {channel.title}</div>
                  {statusBadge(channel.readiness.status)}
                </div>
                <CardDescription>{channel.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Readiness</div>
                  <div className="mt-2 text-2xl font-semibold">{channel.readiness.score}%</div>
                </div>
                {Object.entries(channel.records).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-4 py-3 text-sm">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <form onSubmit={save} className="grid gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Channel configuration</h2>
              <p className="text-sm text-muted-foreground">Save policy once here, then use the specialist screens for day-to-day work.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => void refreshHub()} disabled={loading || saving}>
                <RefreshCw className="size-4" />
                Refresh readiness
              </Button>
              <Button type="submit" disabled={loading || saving || !draft}>
                {saving ? "Saving..." : "Save integration workspace"}
              </Button>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Email + MTA</CardTitle>
                <CardDescription>Pick one primary delivery path and keep fallback SMTP details explicit.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field><FieldLabel>Provider</FieldLabel><Input value={valueOrEmpty(draft?.email.provider ?? draft?.emailProvider)} onChange={(event) => setDraft((current) => current ? ({ ...current, emailProvider: event.target.value || null, email: { ...current.email, provider: event.target.value || null } }) : current)} placeholder="resend / smtp / sendgrid" /></Field>
                  <Field><FieldLabel>Delivery method</FieldLabel><select value={draft?.email.deliveryMethod ?? "api"} onChange={(event) => setDraft((current) => current ? ({ ...current, email: { ...current.email, deliveryMethod: event.target.value as IntegrationSettings["integrations"]["email"]["deliveryMethod"] } }) : current)} className="h-10 rounded-xl border border-input bg-transparent px-3 text-sm"><option value="api">API</option><option value="smtp">SMTP</option><option value="hybrid">Hybrid</option></select><FieldDescription>API-first is cleaner for analytics. SMTP fits relay-only MTAs.</FieldDescription></Field>
                  <Field><FieldLabel>OAuth scopes</FieldLabel><Textarea value={draft?.email.oauthScopes.join(", ") ?? ""} onChange={(event) => setDraft((current) => current ? ({ ...current, email: { ...current.email, oauthScopes: parseList(event.target.value) } }) : current)} className="min-h-20" placeholder="Scopes granted through Google or Microsoft OAuth" /></Field>
                  <Field><FieldLabel>From email</FieldLabel><Input value={valueOrEmpty(draft?.email.fromEmail)} onChange={(event) => setDraft((current) => current ? ({ ...current, email: { ...current.email, fromEmail: event.target.value || null } }) : current)} placeholder="crm@yourdomain.com" /></Field>
                  <Field><FieldLabel>Reply-to email</FieldLabel><Input value={valueOrEmpty(draft?.email.replyToEmail)} onChange={(event) => setDraft((current) => current ? ({ ...current, email: { ...current.email, replyToEmail: event.target.value || null } }) : current)} placeholder="ops@yourdomain.com" /></Field>
                  <Field><FieldLabel>Sender domain</FieldLabel><Input value={valueOrEmpty(draft?.email.domain)} onChange={(event) => setDraft((current) => current ? ({ ...current, email: { ...current.email, domain: event.target.value || null } }) : current)} placeholder="yourdomain.com" /></Field>
                  <Field><FieldLabel>Tracking webhook URL</FieldLabel><Input value={valueOrEmpty(draft?.email.webhookUrl ?? draft?.webhookUrl)} onChange={(event) => setDraft((current) => current ? ({ ...current, webhookUrl: event.target.value || null, email: { ...current.email, webhookUrl: event.target.value || null } }) : current)} placeholder="https://api.example.com/email/events" /></Field>
                  <Field><FieldLabel>SMTP host</FieldLabel><Input value={valueOrEmpty(draft?.email.smtpHost)} onChange={(event) => setDraft((current) => current ? ({ ...current, email: { ...current.email, smtpHost: event.target.value || null } }) : current)} placeholder="smtp.resend.com" /></Field>
                  <Field><FieldLabel>SMTP port</FieldLabel><Input value={numberOrEmpty(draft?.email.smtpPort)} onChange={(event) => setDraft((current) => current ? ({ ...current, email: { ...current.email, smtpPort: event.target.value ? Number(event.target.value) : null } }) : current)} placeholder="587" /></Field>
                  <Field><FieldLabel>Notes</FieldLabel><Textarea value={valueOrEmpty(draft?.email.notes)} onChange={(event) => setDraft((current) => current ? ({ ...current, email: { ...current.email, notes: event.target.value || null } }) : current)} className="min-h-24" placeholder="Provider-specific caveats or rollout notes." /></Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>WhatsApp</CardTitle>
                <CardDescription>Keep workspace, runtime, and inbox identifiers in one place.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field><FieldLabel>Provider</FieldLabel><Input value={valueOrEmpty(draft?.whatsapp.provider ?? draft?.whatsappProvider)} onChange={(event) => setDraft((current) => current ? ({ ...current, whatsappProvider: event.target.value || null, whatsapp: { ...current.whatsapp, provider: event.target.value || null } }) : current)} placeholder="meta / twilio / 360dialog" /></Field>
                  <Field><FieldLabel>Onboarding method</FieldLabel><select value={draft?.whatsapp.onboardingMethod ?? "cloud_api"} onChange={(event) => setDraft((current) => current ? ({ ...current, whatsapp: { ...current.whatsapp, onboardingMethod: event.target.value as IntegrationSettings["integrations"]["whatsapp"]["onboardingMethod"] } }) : current)} className="h-10 rounded-xl border border-input bg-transparent px-3 text-sm"><option value="cloud_api">Cloud API</option><option value="embedded_signup">Embedded signup</option><option value="manual_token">Manual token</option></select></Field>
                  <Field><FieldLabel>Workspace ID</FieldLabel><Input value={valueOrEmpty(draft?.whatsapp.workspaceId)} onChange={(event) => setDraft((current) => current ? ({ ...current, whatsapp: { ...current.whatsapp, workspaceId: event.target.value || null } }) : current)} placeholder="Existing workspace UUID" /></Field>
                  <Field><FieldLabel>Phone number ID</FieldLabel><Input value={valueOrEmpty(draft?.whatsapp.phoneNumberId)} onChange={(event) => setDraft((current) => current ? ({ ...current, whatsapp: { ...current.whatsapp, phoneNumberId: event.target.value || null } }) : current)} placeholder="Meta phone number ID" /></Field>
                  <Field><FieldLabel>Business account ID</FieldLabel><Input value={valueOrEmpty(draft?.whatsapp.businessAccountId)} onChange={(event) => setDraft((current) => current ? ({ ...current, whatsapp: { ...current.whatsapp, businessAccountId: event.target.value || null } }) : current)} placeholder="WhatsApp business account ID" /></Field>
                  <Field><FieldLabel>Verify token</FieldLabel><Input value={valueOrEmpty(draft?.whatsapp.verifyToken)} onChange={(event) => setDraft((current) => current ? ({ ...current, whatsapp: { ...current.whatsapp, verifyToken: event.target.value || null } }) : current)} placeholder="Webhook verify token" /></Field>
                  <Field><FieldLabel>App secret</FieldLabel><Input value={valueOrEmpty(draft?.whatsapp.appSecret)} onChange={(event) => setDraft((current) => current ? ({ ...current, whatsapp: { ...current.whatsapp, appSecret: event.target.value || null } }) : current)} placeholder="Meta app secret" /></Field>
                  <Field><FieldLabel>Webhook URL</FieldLabel><Input value={valueOrEmpty(draft?.whatsapp.webhookUrl ?? draft?.webhookUrl)} onChange={(event) => setDraft((current) => current ? ({ ...current, webhookUrl: event.target.value || null, whatsapp: { ...current.whatsapp, webhookUrl: event.target.value || null } }) : current)} placeholder="https://api.example.com/whatsapp/webhook" /></Field>
                  <Field><FieldLabel>Notes</FieldLabel><Textarea value={valueOrEmpty(draft?.whatsapp.notes)} onChange={(event) => setDraft((current) => current ? ({ ...current, whatsapp: { ...current.whatsapp, notes: event.target.value || null } }) : current)} className="min-h-24" placeholder="Workspace rollout notes." /></Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </div>
        </form>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle>LinkedIn</CardTitle>
              <CardDescription>Plan LinkedIn as a governed integration with approval gates, not a quick token field.</CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertTitle>Access constraint</AlertTitle>
                <AlertDescription>Lead Sync and organization APIs usually require approved product access, mapped organization URNs, scopes, and review. Capture that here before coding OAuth.</AlertDescription>
              </Alert>
              <FieldGroup className="mt-6">
                <Field><FieldLabel>Integration goal</FieldLabel><Input value={valueOrEmpty(draft?.linkedin.provider)} onChange={(event) => setDraft((current) => current ? ({ ...current, linkedin: { ...current.linkedin, provider: event.target.value || null } }) : current)} placeholder="lead_sync / organization_posting" /></Field>
                <Field><FieldLabel>Sync mode</FieldLabel><select value={draft?.linkedin.syncMode ?? "oauth_pull"} onChange={(event) => setDraft((current) => current ? ({ ...current, linkedin: { ...current.linkedin, syncMode: event.target.value as IntegrationSettings["integrations"]["linkedin"]["syncMode"] } }) : current)} className="h-10 rounded-xl border border-input bg-transparent px-3 text-sm"><option value="oauth_pull">OAuth + polling</option><option value="oauth_push">OAuth + push</option><option value="hybrid">Hybrid</option></select></Field>
                <Field><FieldLabel>Organization URN</FieldLabel><Input value={valueOrEmpty(draft?.linkedin.organizationUrn)} onChange={(event) => setDraft((current) => current ? ({ ...current, linkedin: { ...current.linkedin, organizationUrn: event.target.value || null } }) : current)} placeholder="urn:li:organization:123456" /></Field>
                <Field><FieldLabel>Ad account URNs</FieldLabel><Textarea value={draft?.linkedin.adAccountUrns.join("\n") ?? ""} onChange={(event) => setDraft((current) => current ? ({ ...current, linkedin: { ...current.linkedin, adAccountUrns: parseList(event.target.value) } }) : current)} className="min-h-24" placeholder="One URN per line" /></Field>
                <Field><FieldLabel>Scopes</FieldLabel><Textarea value={draft?.linkedin.scopes.join(", ") ?? ""} onChange={(event) => setDraft((current) => current ? ({ ...current, linkedin: { ...current.linkedin, scopes: parseList(event.target.value) } }) : current)} className="min-h-24" placeholder="Comma or newline separated scopes" /></Field>
                <Field><FieldLabel>Lead endpoint</FieldLabel><Input value={valueOrEmpty(draft?.linkedin.webhookUrl)} onChange={(event) => setDraft((current) => current ? ({ ...current, linkedin: { ...current.linkedin, webhookUrl: event.target.value || null } }) : current)} placeholder="https://api.example.com/linkedin/leads" /></Field>
                <Field className="flex-row items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-4"><Checkbox checked={draft?.linkedin.features.leadSync ?? true} onCheckedChange={(checked) => setDraft((current) => current ? ({ ...current, linkedin: { ...current.linkedin, features: { ...current.linkedin.features, leadSync: checked === true } } }) : current)} /><div><FieldLabel>Enable Lead Sync planning</FieldLabel><FieldDescription>Track the fields needed for LinkedIn lead ingestion and mapping.</FieldDescription></div></Field>
                <Field className="flex-row items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-4"><Checkbox checked={draft?.linkedin.features.orgPosting ?? false} onCheckedChange={(checked) => setDraft((current) => current ? ({ ...current, linkedin: { ...current.linkedin, features: { ...current.linkedin.features, orgPosting: checked === true } } }) : current)} /><div><FieldLabel>Enable organization posting planning</FieldLabel><FieldDescription>Keep posting requirements visible even if lead sync ships first.</FieldDescription></div></Field>
                <Field><FieldLabel>Notes</FieldLabel><Textarea value={valueOrEmpty(draft?.linkedin.notes)} onChange={(event) => setDraft((current) => current ? ({ ...current, linkedin: { ...current.linkedin, notes: event.target.value || null } }) : current)} className="min-h-24" placeholder="Approval status, contacts, or scope caveats." /></Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle>Documents + shared webhooks</CardTitle>
              <CardDescription>Document intake and generic endpoints should be governed together.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field><FieldLabel>Document intake email</FieldLabel><Input value={valueOrEmpty(draft?.documents.intakeEmail)} onChange={(event) => setDraft((current) => current ? ({ ...current, documents: { ...current.documents, intakeEmail: event.target.value || null } }) : current)} placeholder="files@yourdomain.com" /></Field>
                <Field><FieldLabel>Storage folder</FieldLabel><Input value={valueOrEmpty(draft?.documents.storageFolder)} onChange={(event) => setDraft((current) => current ? ({ ...current, documents: { ...current.documents, storageFolder: event.target.value || null } }) : current)} placeholder="crm/incoming" /></Field>
                <Field className="flex-row items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-4"><Checkbox checked={draft?.documents.autoAttachToRecords ?? true} onCheckedChange={(checked) => setDraft((current) => current ? ({ ...current, documents: { ...current.documents, autoAttachToRecords: checked === true } }) : current)} /><div><FieldLabel>Auto-attach matched records</FieldLabel><FieldDescription>When enabled, intake tries to attach files to matching leads, customers, or deals.</FieldDescription></div></Field>
                <Field><FieldLabel>Inbound webhook URL</FieldLabel><Input value={valueOrEmpty(draft?.genericWebhooks.inboundUrl ?? draft?.webhookUrl)} onChange={(event) => setDraft((current) => current ? ({ ...current, webhookUrl: event.target.value || null, genericWebhooks: { ...current.genericWebhooks, inboundUrl: event.target.value || null } }) : current)} placeholder="https://api.example.com/hooks/inbound" /></Field>
                <Field><FieldLabel>Outbound webhook URL</FieldLabel><Input value={valueOrEmpty(draft?.genericWebhooks.outboundUrl)} onChange={(event) => setDraft((current) => current ? ({ ...current, genericWebhooks: { ...current.genericWebhooks, outboundUrl: event.target.value || null } }) : current)} placeholder="https://api.example.com/hooks/outbound" /></Field>
                <Field><FieldLabel>Slack webhook URL</FieldLabel><Input value={valueOrEmpty(draft?.slackWebhookUrl)} onChange={(event) => setDraft((current) => current ? ({ ...current, slackWebhookUrl: event.target.value || null }) : current)} placeholder="https://hooks.slack.com/services/..." /></Field>
                <Field><FieldLabel>Signing secret hint</FieldLabel><Input value={valueOrEmpty(draft?.genericWebhooks.signingSecretHint)} onChange={(event) => setDraft((current) => current ? ({ ...current, genericWebhooks: { ...current.genericWebhooks, signingSecretHint: event.target.value || null } }) : current)} placeholder="Describe how signatures are generated or verified." /></Field>
                <Field><FieldLabel>Notes</FieldLabel><Textarea value={valueOrEmpty(draft?.documents.notes)} onChange={(event) => setDraft((current) => current ? ({ ...current, documents: { ...current.documents, notes: event.target.value || null } }) : current)} className="min-h-24" placeholder="Document routing or intake caveats." /></Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          {(hub?.channels ?? []).map((channel) => (
            <Card key={`detail-${channel.key}`} className="border-border/60">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">{channelIcon(channel.key)}<CardTitle>{channel.title}</CardTitle></div>
                  {statusBadge(channel.readiness.status)}
                </div>
                <CardDescription>{channel.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {channel.readiness.items.map((item) => (
                  <div key={item.key} className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                    <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{item.label}</span><Badge variant={item.ready ? "secondary" : "outline"}>{item.ready ? "Ready" : "Missing"}</Badge></div>
                    <div className="mt-2 text-sm text-muted-foreground">{item.detail}</div>
                  </div>
                ))}
                {channel.recommendedFlow.map((step) => (
                  <div key={step} className="rounded-xl border border-border/60 bg-background px-4 py-3 text-sm text-muted-foreground">{step}</div>
                ))}
                {channel.docs.map((doc) => (
                  <a key={doc.url} href={doc.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-4 py-3 text-sm font-medium">
                    <span>{doc.label} <span className="text-muted-foreground">({doc.source})</span></span>
                    <ArrowUpRight className="size-4" />
                  </a>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Loading integrations workspace...</p> : null}
      </div>
    </>
  );
}

