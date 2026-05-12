"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Circle, Copy, Plug, Shield, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageSection } from "@/components/ui/page-patterns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, apiRequest, buildApiUrl } from "@/lib/api";
import { WhatsappConnectionCard } from "@/features/whatsapp-crm/components/connection-card";
import { connectionStatusTone } from "@/features/whatsapp-crm/format";
import type {
  WhatsappConnectionSummary,
  WhatsappOnboardingStatus,
  WhatsappWorkspace,
} from "@/features/whatsapp-crm/types";

interface FacebookLoginResponse {
  authResponse?: { code?: string; accessToken?: string };
  status?: string;
}

interface FacebookSdk {
  init(config: Record<string, unknown>): void;
  login(callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>): void;
}

function getFacebookSdkWindow() {
  return window as typeof window & { FB?: FacebookSdk; fbAsyncInit?: () => void };
}

function loadFacebookSdk(appId: string) {
  return new Promise<FacebookSdk>((resolve, reject) => {
    const sdkWindow = getFacebookSdkWindow();
    if (sdkWindow.FB) {
      resolve(sdkWindow.FB);
      return;
    }

    sdkWindow.fbAsyncInit = () => {
      if (!sdkWindow.FB) {
        reject(new Error("Facebook SDK did not initialize."));
        return;
      }
      sdkWindow.FB.init({ appId, cookie: true, xfbml: true, version: "v23.0" });
      resolve(sdkWindow.FB);
    };

    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.onerror = () => reject(new Error("Unable to load Facebook SDK."));
      document.body.appendChild(script);
    }
  });
}

interface EmbeddedSignupDraft {
  code: string;
  accessToken: string;
  businessAccountId: string;
  phoneNumberId: string;
  businessId: string;
  name: string;
}

const emptyEmbeddedSignupDraft: EmbeddedSignupDraft = {
  code: "",
  accessToken: "",
  businessAccountId: "",
  phoneNumberId: "",
  businessId: "",
  name: "",
};

export function WhatsappCrmIntegrationsPage() {
  const [connections, setConnections] = useState<WhatsappConnectionSummary[]>([]);
  const [onboarding, setOnboarding] = useState<WhatsappOnboardingStatus | null>(null);
  const [draft, setDraft] = useState<EmbeddedSignupDraft>(emptyEmbeddedSignupDraft);
  const [working, setWorking] = useState<string | null>(null);
  const [lastVerifyToken, setLastVerifyToken] = useState<string | null>(null);
  const [lastWebhookUrl, setLastWebhookUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [connectionsPayload, onboardingPayload] = await Promise.all([
        apiRequest<{ items: WhatsappConnectionSummary[] }>("/whatsapp/dashboard/connections", { skipCache: true }),
        apiRequest<WhatsappOnboardingStatus>("/whatsapp/onboarding/status", { skipCache: true }),
      ]);
      setConnections(connectionsPayload.items);
      setOnboarding(onboardingPayload);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load WhatsApp integrations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const launchEmbeddedSignup = async () => {
    const appId = onboarding?.embeddedSignup.appId;
    const configId = onboarding?.embeddedSignup.configId;
    if (!appId || !configId) {
      toast.error("Set WHATSAPP_META_APP_ID and WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID in backend env before launching Embedded Signup.");
      return;
    }

    setWorking("launch");
    try {
      const sdk = await loadFacebookSdk(appId);
      sdk.login(
        (response) => {
          if (response.authResponse?.code || response.authResponse?.accessToken) {
            setDraft((current) => ({
              ...current,
              code: response.authResponse?.code ?? current.code,
              accessToken: response.authResponse?.accessToken ?? current.accessToken,
            }));
            toast.success("Embedded Signup returned credentials. Fill in the WABA and phone number IDs from session logging and exchange.");
          } else {
            toast.warning("Embedded Signup did not return credentials.");
          }
          setWorking(null);
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { setup: {} },
        },
      );
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to launch Embedded Signup.");
      setWorking(null);
    }
  };

  const exchangeEmbeddedSignup = async () => {
    if (!draft.phoneNumberId || !draft.businessAccountId) {
      toast.error("Phone Number ID and WABA ID are required.");
      return;
    }
    setWorking("exchange");
    try {
      const response = await apiRequest<{ workspace: WhatsappWorkspace; verifyToken: string; webhookUrl: string }>(
        "/whatsapp/onboarding/embedded/exchange",
        {
          method: "POST",
          body: JSON.stringify({
            code: draft.code || undefined,
            accessToken: draft.accessToken || undefined,
            businessAccountId: draft.businessAccountId,
            phoneNumberId: draft.phoneNumberId,
            businessId: draft.businessId || undefined,
            name: draft.name || undefined,
          }),
        },
      );
      setLastVerifyToken(response.verifyToken);
      setLastWebhookUrl(response.webhookUrl);
      setDraft(emptyEmbeddedSignupDraft);
      await refresh();
      toast.success("WhatsApp account connected. Configure the Meta webhook using the values below.");
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to exchange Embedded Signup credentials.");
    } finally {
      setWorking(null);
    }
  };

  const syncConnection = async (connection: WhatsappConnectionSummary) => {
    setWorking(`sync:${connection.id}`);
    try {
      await apiRequest(`/whatsapp/workspaces/${connection.id}/sync-meta`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refresh();
      toast.success(`Synced Meta status for ${connection.name}.`);
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to sync Meta status.");
    } finally {
      setWorking(null);
    }
  };

  const disconnectConnection = async (connection: WhatsappConnectionSummary) => {
    if (typeof window !== "undefined" && !window.confirm(`Disconnect ${connection.name}? This removes the workspace and its webhook binding.`)) {
      return;
    }
    setWorking(`disconnect:${connection.id}`);
    try {
      await apiRequest(`/whatsapp-workspaces/${connection.id}`, { method: "DELETE" });
      await refresh();
      toast.success("WhatsApp account disconnected.");
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to disconnect WhatsApp account.");
    } finally {
      setWorking(null);
    }
  };

  const reactivateConnection = async (connection: WhatsappConnectionSummary) => {
    setWorking(`reconnect:${connection.id}`);
    try {
      await apiRequest(`/whatsapp-workspaces/${connection.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: true }),
      });
      await refresh();
      toast.success(`Reactivated ${connection.name}. Run Sync with Meta to refresh status.`);
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to reactivate.");
    } finally {
      setWorking(null);
    }
  };

  if (loading && connections.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border/80 bg-white/45 px-4 py-3 text-sm text-muted-foreground">Loading integrations…</div>;
  }

  const signupEnabled = onboarding?.embeddedSignup.enabled ?? false;
  const steps = onboarding?.steps ?? [];

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-emerald-200/70 bg-emerald-50/40">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-white text-emerald-700">
              <Plug className="size-5" />
            </span>
            <div>
              <CardTitle>WhatsApp Cloud API — official Meta integration</CardTitle>
              <CardDescription>
                Connect WhatsApp Business Accounts through Meta Embedded Signup. No Baileys, no QR codes, no unofficial
                APIs — only the official Graph API.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="border-border/60 lg:sticky lg:top-4 lg:self-start" size="sm">
          <CardHeader>
            <CardTitle>Setup checklist</CardTitle>
            <CardDescription>Complete items as you move through the flow.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {steps.length === 0 ? (
              <div className="text-sm text-muted-foreground">Connect an account to populate the checklist.</div>
            ) : null}
            {steps.map((step) => (
              <div key={step.key} className="flex items-center gap-3 rounded-xl border border-border/60 bg-white/60 px-3 py-2.5">
                {step.done ? <CheckCircle2 className="size-4 shrink-0 text-primary" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{step.label}</div>
                  <div className="text-xs text-muted-foreground">{step.done ? "Done" : "Needs setup"}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Tabs defaultValue="embedded">
            <TabsList>
              <TabsTrigger value="embedded">Embedded Signup</TabsTrigger>
              <TabsTrigger value="webhook">Webhook setup</TabsTrigger>
            </TabsList>

            <TabsContent value="embedded" className="mt-3">
              <Card className="border-border/70 bg-card/95">
                <CardHeader>
                  <CardTitle>Add a WhatsApp account</CardTitle>
                  <CardDescription>
                    Launch Meta Embedded Signup, collect the WABA and phone number IDs, then exchange them for an encrypted access
                    token stored against this workspace.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button onClick={launchEmbeddedSignup} disabled={!signupEnabled || working === "launch"}>
                      {working === "launch" ? "Launching…" : "Launch Embedded Signup"}
                    </Button>
                    {!signupEnabled ? (
                      <span className="inline-flex items-center gap-2 text-xs text-amber-700">
                        <AlertCircle className="size-3.5" />
                        Set WHATSAPP_META_APP_ID and WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID in backend env.
                      </span>
                    ) : null}
                  </div>

                  <FieldGroup>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="wa-name">Friendly name</FieldLabel>
                        <Input
                          id="wa-name"
                          value={draft.name}
                          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Sales WhatsApp"
                        />
                        <FieldDescription>Used to identify this connection in the CRM.</FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="wa-phone">Phone Number ID</FieldLabel>
                        <Input
                          id="wa-phone"
                          value={draft.phoneNumberId}
                          onChange={(event) => setDraft((current) => ({ ...current, phoneNumberId: event.target.value }))}
                          placeholder="From Meta session logging"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="wa-waba">WhatsApp Business Account ID</FieldLabel>
                        <Input
                          id="wa-waba"
                          value={draft.businessAccountId}
                          onChange={(event) => setDraft((current) => ({ ...current, businessAccountId: event.target.value }))}
                          placeholder="From Meta session logging"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="wa-business">Meta Business ID (optional)</FieldLabel>
                        <Input
                          id="wa-business"
                          value={draft.businessId}
                          onChange={(event) => setDraft((current) => ({ ...current, businessId: event.target.value }))}
                          placeholder="Business Manager ID"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="wa-code">Auth code (from Embedded Signup)</FieldLabel>
                        <Input
                          id="wa-code"
                          value={draft.code}
                          onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value }))}
                          placeholder="AQD…"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="wa-token">Access token (optional)</FieldLabel>
                        <Input
                          id="wa-token"
                          value={draft.accessToken}
                          onChange={(event) => setDraft((current) => ({ ...current, accessToken: event.target.value }))}
                          placeholder="Overrides code exchange if present"
                        />
                      </Field>
                    </div>
                  </FieldGroup>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={exchangeEmbeddedSignup} disabled={working === "exchange"}>
                      <Sparkles className="mr-2 size-4" />
                      {working === "exchange" ? "Connecting…" : "Exchange and connect"}
                    </Button>
                    <Button variant="ghost" onClick={() => setDraft(emptyEmbeddedSignupDraft)} disabled={working === "exchange"}>
                      Reset
                    </Button>
                  </div>

                  {lastVerifyToken && lastWebhookUrl ? (
                    <Alert>
                      <AlertTitle>New webhook credentials</AlertTitle>
                      <AlertDescription className="grid gap-2">
                        <WebhookValueRow label="Callback URL" value={lastWebhookUrl} />
                        <WebhookValueRow label="Verify token" value={lastVerifyToken} sensitive />
                        <div className="text-xs text-muted-foreground">
                          Paste these into the Meta App → WhatsApp → Configuration → Webhook to finish setup.
                        </div>
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="webhook" className="mt-3">
              <Card className="border-border/70 bg-card/95">
                <CardHeader>
                  <CardTitle>Webhook configuration</CardTitle>
                  <CardDescription>
                    Each connection exposes a keyed webhook route. The backend verifies the challenge and signature using
                    the per-workspace verify token and app secret stored encrypted at rest.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {connections.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/70 bg-white/50 p-4 text-sm text-muted-foreground">
                      Connect a WhatsApp account first. The webhook URL is generated automatically per workspace.
                    </div>
                  ) : null}
                  {connections.map((connection) => {
                    const url = connection.webhookKey
                      ? buildApiUrl(`/public/whatsapp/webhook/${connection.webhookKey}`)
                      : buildApiUrl("/public/whatsapp/webhook");
                    const tone = connectionStatusTone(connection.status);
                    return (
                      <div key={connection.id} className="rounded-xl border border-border/60 bg-white/70 px-3 py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{connection.name}</span>
                            <Badge variant={tone.variant}>{tone.label}</Badge>
                            {connection.isVerified ? (
                              <Badge variant="outline">
                                <Shield className="mr-1 size-3" /> Verified
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">{connection.phoneNumberId}</div>
                        </div>
                        <WebhookValueRow label="Callback URL" value={url} />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <PageSection title="Connected WhatsApp accounts" description="Sync Meta status, reactivate, or disconnect accounts.">
            {connections.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-white/50 p-4 text-sm text-muted-foreground">
                No WhatsApp accounts connected yet. Use Embedded Signup above to add one.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {connections.map((connection) => (
                  <WhatsappConnectionCard
                    key={connection.id}
                    connection={connection}
                    onSync={syncConnection}
                    onDisconnect={disconnectConnection}
                    onReconnect={reactivateConnection}
                    syncing={working === `sync:${connection.id}`}
                    disconnecting={working === `disconnect:${connection.id}`}
                  />
                ))}
              </div>
            )}
          </PageSection>
        </div>
      </div>
    </div>
  );
}

function WebhookValueRow({ label, value, sensitive }: { label: string; value: string; sensitive?: boolean }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Unable to copy.");
    }
  };

  return (
    <div className="grid gap-1">
      <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-white px-2 py-1">
        <code className={sensitive ? "truncate font-mono text-xs tracking-widest" : "truncate font-mono text-xs"}>
          {sensitive ? value.replace(/./g, "•").slice(0, 32) : value}
        </code>
        <Button type="button" variant="ghost" size="icon-sm" onClick={copy} aria-label={`Copy ${label}`}>
          <Copy className="size-3.5" />
        </Button>
        {sensitive ? <Trash2 className="size-3.5 text-muted-foreground" aria-hidden /> : null}
      </div>
    </div>
  );
}
