"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, type ReactNode } from "react";
import { ArrowLeft, CheckCircle2, Circle, Settings2 } from "lucide-react";
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
import { ApiError, apiRequest, buildApiUrl } from "@/lib/api";
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

interface WhatsappWorkspace {
  id: string;
  name: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  webhookKey: string | null;
  verifyToken: string | null;
  appSecret: string | null;
  accessToken: string | null;
  isActive: boolean;
  isVerified: boolean;
  activePhoneNumberIds: string[];
  metadata: Record<string, unknown>;
  updatedAt: string;
}

interface WhatsappReadiness {
  status: "ready" | "limited" | "blocked";
  missing: string[];
  checks: {
    active: boolean;
    phoneNumberConfigured: boolean;
    businessAccountConfigured: boolean;
    tokenValid: boolean;
    webhookVerified: boolean;
    phoneConnected: boolean;
    approvedTemplateCount: number;
    pricingLoaded: boolean;
  };
  meta: Record<string, unknown>;
}

interface WhatsappOnboardingStatus {
  status: "ready" | "limited" | "blocked";
  activeWorkspaceId: string | null;
  steps: Array<{ key: string; label: string; done: boolean }>;
  workspaces: Array<{ workspace: WhatsappWorkspace; readiness: WhatsappReadiness }>;
  embeddedSignup: { appId: string | null; configId: string | null; enabled: boolean };
}

interface WhatsappPricingRate {
  id: string;
  market: string;
  countryCode: string | null;
  currency: string;
  category: "marketing" | "utility" | "authentication" | "authentication_international" | "service";
  rate: string;
  tierFrom: number;
  tierTo: number | null;
  effectiveFrom: string;
  sourceVersion: string;
}

interface WhatsappPricingEstimate {
  category: string;
  market: string;
  countryCode: string | null;
  currency: string;
  billableUnits: number;
  unitRate: string;
  estimatedCost: string;
  status: "estimated" | "waived";
  reason: string;
}

interface WhatsappWorkspaceDraft {
  id: string | null;
  name: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookKey: string;
  activePhoneNumberIds: string;
  verifyToken: string;
  appSecret: string;
  accessToken: string;
  isActive: boolean;
  isVerified: boolean;
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

const emptyWhatsappWorkspaceDraft: WhatsappWorkspaceDraft = {
  id: null,
  name: "",
  phoneNumberId: "",
  businessAccountId: "",
  webhookKey: "",
  activePhoneNumberIds: "",
  verifyToken: "",
  appSecret: "",
  accessToken: "",
  isActive: true,
  isVerified: false,
};

function workspaceToDraft(workspace: WhatsappWorkspace): WhatsappWorkspaceDraft {
  return {
    id: workspace.id,
    name: workspace.name,
    phoneNumberId: workspace.phoneNumberId,
    businessAccountId: workspace.businessAccountId ?? "",
    webhookKey: workspace.webhookKey ?? "",
    activePhoneNumberIds: workspace.activePhoneNumberIds?.join(", ") ?? "",
    verifyToken: "",
    appSecret: "",
    accessToken: "",
    isActive: workspace.isActive,
    isVerified: workspace.isVerified,
  };
}

function readinessBadgeVariant(status?: string) {
  if (status === "ready") return "secondary" as const;
  if (status === "blocked") return "destructive" as const;
  return "outline" as const;
}

function formatMoney(value: string | number, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return `${currency} ${value}`;
  }
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 6 }).format(amount);
}

interface FacebookLoginResponse {
  authResponse?: {
    code?: string;
    accessToken?: string;
  };
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
      sdkWindow.FB.init({
        appId,
        cookie: true,
        xfbml: true,
        version: "v23.0",
      });
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

function PanelSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-2xl border border-border/60 bg-white/55 p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function AdvancedSection({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-2xl border border-border/60 bg-white/45 p-4" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <span>
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Settings2 className="size-4 text-muted-foreground" />
            {title}
          </span>
          {description ? <span className="mt-1 block text-sm leading-6 text-muted-foreground">{description}</span> : null}
        </span>
        <span className="rounded-full border border-border/70 px-2 py-1 text-xs font-semibold text-muted-foreground group-open:hidden">Show</span>
        <span className="hidden rounded-full border border-border/70 px-2 py-1 text-xs font-semibold text-muted-foreground group-open:inline">Hide</span>
      </summary>
      <div className="mt-4 grid gap-4">{children}</div>
    </details>
  );
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
  const [whatsappWorkspaces, setWhatsappWorkspaces] = useState<WhatsappWorkspace[]>([]);
  const [whatsappWorkspaceDraft, setWhatsappWorkspaceDraft] = useState<WhatsappWorkspaceDraft>(emptyWhatsappWorkspaceDraft);
  const [savingWhatsappWorkspace, setSavingWhatsappWorkspace] = useState(false);
  const [whatsappOnboarding, setWhatsappOnboarding] = useState<WhatsappOnboardingStatus | null>(null);
  const [embeddedSignupDraft, setEmbeddedSignupDraft] = useState<EmbeddedSignupDraft>(emptyEmbeddedSignupDraft);
  const [pricingRates, setPricingRates] = useState<WhatsappPricingRate[]>([]);
  const [pricingImportJson, setPricingImportJson] = useState("");
  const [pricingEstimate, setPricingEstimate] = useState<WhatsappPricingEstimate | null>(null);
  const [pricingEstimateDraft, setPricingEstimateDraft] = useState({
    to: "",
    market: "India",
    currency: "INR",
    category: "marketing",
    billableUnits: "1000",
  });
  const [workingWhatsappAction, setWorkingWhatsappAction] = useState<string | null>(null);

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

        const [hubPayload, settingsPayload, whatsappWorkspacePayload, whatsappOnboardingPayload, whatsappPricingPayload] = await Promise.all([
          apiRequest<IntegrationHubResponse>("/settings/integration-hub"),
          apiRequest<IntegrationSettings>("/settings/integrations"),
          integrationKey === "whatsapp"
            ? apiRequest<{ items: WhatsappWorkspace[] }>("/whatsapp-workspaces")
            : Promise.resolve({ items: [] as WhatsappWorkspace[] }),
          integrationKey === "whatsapp"
            ? apiRequest<WhatsappOnboardingStatus>("/whatsapp/onboarding/status", { skipCache: true })
            : Promise.resolve(null),
          integrationKey === "whatsapp"
            ? apiRequest<{ items: WhatsappPricingRate[] }>("/whatsapp/pricing/rates")
            : Promise.resolve({ items: [] as WhatsappPricingRate[] }),
        ]);

        if (!disposed) {
          setHub(hubPayload);
          setDraft(settingsPayload.integrations);
          setWhatsappWorkspaces(whatsappWorkspacePayload.items);
          setWhatsappOnboarding(whatsappOnboardingPayload);
          setPricingRates(whatsappPricingPayload.items);
          if (integrationKey === "whatsapp") {
            const preferred =
              whatsappWorkspacePayload.items.find((item) => item.id === settingsPayload.integrations.whatsapp.workspaceId) ??
              whatsappWorkspacePayload.items[0] ??
              null;
            setWhatsappWorkspaceDraft(preferred ? workspaceToDraft(preferred) : emptyWhatsappWorkspaceDraft);
          }
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
  }, [integrationKey]);

  const stepChecks = useMemo(() => {
    if (!draft) {
      return [];
    }

    if (integrationKey === "email") {
      return [
        { label: "Connect Gmail or Outlook", done: Boolean(draft.email.provider ?? draft.emailProvider) },
        { label: "Verify sending address", done: Boolean(draft.email.fromEmail) },
        { label: "Send a test email", done: Boolean(draft.email.provider ?? draft.emailProvider) },
      ];
    }
    if (integrationKey === "whatsapp") {
      return [
        { label: "Select provider", done: Boolean(draft.whatsapp.provider ?? draft.whatsappProvider) },
        {
          label: "Map business IDs",
          done: Boolean(
            whatsappWorkspaces.some((workspace) => workspace.isActive && workspace.phoneNumberId && workspace.businessAccountId) ||
              (draft.whatsapp.phoneNumberId && draft.whatsapp.businessAccountId),
          ),
        },
        {
          label: "Verify webhook",
          done: Boolean(
            whatsappWorkspaces.some((workspace) => workspace.webhookKey && workspace.isVerified) ||
              (draft.whatsapp.webhookUrl && draft.whatsapp.verifyToken && draft.whatsapp.appSecret),
          ),
        },
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
  }, [draft, integrationKey, whatsappWorkspaces]);

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

  const refreshWhatsappWorkspaces = async () => {
    const [payload, onboardingPayload, pricingPayload] = await Promise.all([
      apiRequest<{ items: WhatsappWorkspace[] }>("/whatsapp-workspaces", { skipCache: true }),
      apiRequest<WhatsappOnboardingStatus>("/whatsapp/onboarding/status", { skipCache: true }),
      apiRequest<{ items: WhatsappPricingRate[] }>("/whatsapp/pricing/rates", { skipCache: true }),
    ]);
    setWhatsappWorkspaces(payload.items);
    setWhatsappOnboarding(onboardingPayload);
    setPricingRates(pricingPayload.items);
    return payload.items;
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

  const saveWhatsappWorkspace = async () => {
    if (!draft) {
      return;
    }

    setSavingWhatsappWorkspace(true);
    setError(null);
    try {
      const activePhoneNumberIds = parseList(whatsappWorkspaceDraft.activePhoneNumberIds);
      const payload = {
        name: whatsappWorkspaceDraft.name,
        phoneNumberId: whatsappWorkspaceDraft.phoneNumberId,
        businessAccountId: whatsappWorkspaceDraft.businessAccountId || undefined,
        webhookKey: whatsappWorkspaceDraft.webhookKey || undefined,
        activePhoneNumberIds,
        verifyToken: whatsappWorkspaceDraft.verifyToken || undefined,
        appSecret: whatsappWorkspaceDraft.appSecret || undefined,
        accessToken: whatsappWorkspaceDraft.accessToken || undefined,
        isActive: whatsappWorkspaceDraft.isActive,
        isVerified: whatsappWorkspaceDraft.isVerified,
      };
      const workspace = await apiRequest<WhatsappWorkspace>(
        whatsappWorkspaceDraft.id ? `/whatsapp-workspaces/${whatsappWorkspaceDraft.id}` : "/whatsapp-workspaces",
        {
          method: whatsappWorkspaceDraft.id ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );

      const eventUrl = workspace.webhookKey ? buildApiUrl(`/public/whatsapp/webhook/${workspace.webhookKey}`) : draft.whatsapp.webhookUrl;
      const response = await apiRequest<IntegrationSettings>("/settings/integrations", {
        method: "PATCH",
        body: JSON.stringify({
          integrations: {
            whatsappProvider: draft.whatsapp.provider ?? draft.whatsappProvider ?? "meta",
            whatsapp: {
              ...draft.whatsapp,
              provider: draft.whatsapp.provider ?? draft.whatsappProvider ?? "meta",
              workspaceId: workspace.id,
              phoneNumberId: workspace.phoneNumberId,
              businessAccountId: workspace.businessAccountId,
              webhookKey: workspace.webhookKey,
              activePhoneNumberIds: workspace.activePhoneNumberIds,
              webhookUrl: eventUrl,
              verifyToken: whatsappWorkspaceDraft.verifyToken || draft.whatsapp.verifyToken,
              appSecret: whatsappWorkspaceDraft.appSecret || draft.whatsapp.appSecret,
            },
          },
        }),
      });

      setDraft(response.integrations);
      setWhatsappWorkspaceDraft(workspaceToDraft(workspace));
      await Promise.all([refreshWhatsappWorkspaces(), refreshHub()]);
      toast.success("WhatsApp workspace saved.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to save WhatsApp workspace.");
    } finally {
      setSavingWhatsappWorkspace(false);
    }
  };

  const exchangeEmbeddedSignup = async () => {
    setWorkingWhatsappAction("embedded");
    setError(null);
    try {
      const response = await apiRequest<{ workspace: WhatsappWorkspace; verifyToken: string; webhookUrl: string }>("/whatsapp/onboarding/embedded/exchange", {
        method: "POST",
        body: JSON.stringify({
          ...embeddedSignupDraft,
          code: embeddedSignupDraft.code || undefined,
          accessToken: embeddedSignupDraft.accessToken || undefined,
          businessAccountId: embeddedSignupDraft.businessAccountId,
          phoneNumberId: embeddedSignupDraft.phoneNumberId,
          businessId: embeddedSignupDraft.businessId || undefined,
          name: embeddedSignupDraft.name || undefined,
        }),
      });
      setWhatsappWorkspaceDraft(workspaceToDraft(response.workspace));
      setEmbeddedSignupDraft(emptyEmbeddedSignupDraft);
      await refreshWhatsappWorkspaces();
      toast.success(`WhatsApp number added. Verify token: ${response.verifyToken}`);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to exchange Embedded Signup result.");
    } finally {
      setWorkingWhatsappAction(null);
    }
  };

  const launchEmbeddedSignup = async () => {
    const appId = whatsappOnboarding?.embeddedSignup.appId;
    const configId = whatsappOnboarding?.embeddedSignup.configId;
    if (!appId || !configId) {
      setError("Set WHATSAPP_META_APP_ID and WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID before launching Embedded Signup.");
      return;
    }

    setWorkingWhatsappAction("embedded-launch");
    setError(null);
    try {
      const sdk = await loadFacebookSdk(appId);
      sdk.login(
        (response) => {
          if (response.authResponse?.code || response.authResponse?.accessToken) {
            setEmbeddedSignupDraft((current) => ({
              ...current,
              code: response.authResponse?.code ?? current.code,
              accessToken: response.authResponse?.accessToken ?? current.accessToken,
            }));
            toast.success("Embedded Signup returned auth credentials. Add WABA and phone IDs from session logging, then exchange.");
          } else {
            setError("Embedded Signup did not return auth credentials.");
          }
          setWorkingWhatsappAction(null);
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            setup: {},
          },
        },
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to launch Embedded Signup.");
      setWorkingWhatsappAction(null);
    }
  };

  const syncWorkspaceMeta = async (workspaceId: string) => {
    setWorkingWhatsappAction(`sync:${workspaceId}`);
    setError(null);
    try {
      await apiRequest(`/whatsapp/workspaces/${workspaceId}/sync-meta`, { method: "POST", body: JSON.stringify({}) });
      await refreshWhatsappWorkspaces();
      toast.success("Meta workspace status synced.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to sync Meta workspace status.");
    } finally {
      setWorkingWhatsappAction(null);
    }
  };

  const testWorkspaceReadiness = async (workspaceId: string) => {
    setWorkingWhatsappAction(`test:${workspaceId}`);
    setError(null);
    try {
      const response = await apiRequest<{ readiness: WhatsappReadiness }>(`/whatsapp/workspaces/${workspaceId}/test-readiness`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast[response.readiness.status === "ready" ? "success" : "warning"](
        response.readiness.status === "ready" ? "Workspace is ready." : `Workspace needs attention: ${response.readiness.missing[0] ?? "Review checklist."}`,
      );
      await refreshWhatsappWorkspaces();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to test WhatsApp readiness.");
    } finally {
      setWorkingWhatsappAction(null);
    }
  };

  const importPricingRates = async () => {
    setWorkingWhatsappAction("pricing-import");
    setError(null);
    try {
      const parsed = JSON.parse(pricingImportJson) as unknown;
      const response = await apiRequest<{ imported: number }>("/whatsapp/pricing/import-rate-card", {
        method: "POST",
        body: JSON.stringify(parsed),
      });
      setPricingImportJson("");
      await refreshWhatsappWorkspaces();
      toast.success(`Imported ${response.imported} WhatsApp pricing rows.`);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to import pricing. Paste valid rate-card JSON.");
    } finally {
      setWorkingWhatsappAction(null);
    }
  };

  const estimatePricing = async () => {
    setWorkingWhatsappAction("pricing-estimate");
    setError(null);
    try {
      const response = await apiRequest<WhatsappPricingEstimate>("/whatsapp/pricing/estimate", {
        method: "POST",
        body: JSON.stringify({
          to: pricingEstimateDraft.to || undefined,
          market: pricingEstimateDraft.market || undefined,
          currency: pricingEstimateDraft.currency,
          category: pricingEstimateDraft.category,
          billableUnits: Number(pricingEstimateDraft.billableUnits) || 1,
          serviceWindowOpen: pricingEstimateDraft.category === "service" ? true : undefined,
        }),
      });
      setPricingEstimate(response);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to estimate pricing.");
    } finally {
      setWorkingWhatsappAction(null);
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
    <div className="grid gap-4">
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

      <Card className="border-border/60" size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/dashboard/integrations" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))} aria-label="Back to integrations">
                <ArrowLeft className="size-4" />
              </Link>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <CardTitle className="truncate">{integration.title}</CardTitle>
                <CardDescription>{integration.description}</CardDescription>
              </div>
            </div>
            <Badge variant={channelStatus === "completed" ? "secondary" : "outline"}>
              {channelStatus === "completed" ? "Completed" : "Pending"}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="border-border/60 lg:sticky lg:top-4 lg:self-start" size="sm">
          <CardHeader>
            <CardTitle>Setup checklist</CardTitle>
            <CardDescription>Complete the items in order.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {integration.steps.map((step, index) => (
              <div key={step} className="flex items-center gap-3 rounded-xl border border-border/60 bg-white/50 px-3 py-2.5">
                {stepChecks[index]?.done ? <CheckCircle2 className="size-4 shrink-0 text-primary" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{step}</div>
                  <div className="text-xs text-muted-foreground">{stepChecks[index]?.done ? "Done" : "Needs setup"}</div>
                </div>
              </div>
            ))}
            {getHubChannel(hub, integration.key)?.docs?.slice(0, 2).length ? (
              <div className="mt-2 border-t border-border/60 pt-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Docs</div>
                <div className="grid gap-2">
                  {getHubChannel(hub, integration.key)?.docs?.slice(0, 2).map((doc) => (
                    <a
                      key={doc.url}
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-border/60 bg-white/40 px-3 py-2 text-sm font-medium hover:bg-white/70"
                    >
                      {doc.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Setup</CardTitle>
            <CardDescription>Only the required settings are shown first. Advanced controls stay collapsed below.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {oauthConfigs.length > 0 && draft ? (
              <PanelSection title="Connect account" description="Use OAuth when available. Manual provider fields are still below for fallback setups.">
                <div className="grid gap-2">
                  {oauthConfigs.map((providerConfig) => {
                    const linkedProvider =
                      providerConfig.channel === "email"
                        ? (draft.email.provider ?? draft.emailProvider)
                        : draft.linkedin.provider;
                    const isLinked = linkedProvider === providerConfig.provider;

                    return (
                      <div key={providerConfig.provider} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-white/55 px-3 py-2.5">
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
              </PanelSection>
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
              <div className="grid gap-4">
                <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Connect WhatsApp</div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Guided onboarding covers Meta connection, phone number readiness, webhook verification, templates, test send, and pricing.
                      </p>
                    </div>
                    <Badge variant={readinessBadgeVariant(whatsappOnboarding?.status)}>{whatsappOnboarding?.status ?? "loading"}</Badge>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {(whatsappOnboarding?.steps ?? []).map((step) => (
                      <div key={step.key} className="flex items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2 text-sm">
                        <span>{step.label}</span>
                        <Badge variant={step.done ? "secondary" : "outline"}>{step.done ? "Done" : "Needed"}</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-2xl border border-border/60 bg-background p-4">
                    <div className="text-sm font-semibold">Embedded Signup</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Launch Meta Embedded Signup, then exchange the returned code/access token with WABA and phone IDs from session logging.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant={whatsappOnboarding?.embeddedSignup.enabled ? "secondary" : "outline"}>
                        {whatsappOnboarding?.embeddedSignup.enabled ? "Meta app configured" : "Meta app env missing"}
                      </Badge>
                      {whatsappOnboarding?.embeddedSignup.configId ? <Badge variant="outline">Config {whatsappOnboarding.embeddedSignup.configId}</Badge> : null}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4"
                      onClick={() => void launchEmbeddedSignup()}
                      disabled={!whatsappOnboarding?.embeddedSignup.enabled || workingWhatsappAction === "embedded-launch"}
                    >
                      {workingWhatsappAction === "embedded-launch" ? "Launching Meta..." : "Launch Meta Embedded Signup"}
                    </Button>
                    <FieldGroup className="mt-4">
                      <Field>
                        <FieldLabel>Signup code or auth code</FieldLabel>
                        <Input
                          value={embeddedSignupDraft.code}
                          onChange={(event) => setEmbeddedSignupDraft((current) => ({ ...current, code: event.target.value }))}
                          placeholder="Returned by Meta Embedded Signup"
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Access token</FieldLabel>
                        <Input
                          value={embeddedSignupDraft.accessToken}
                          onChange={(event) => setEmbeddedSignupDraft((current) => ({ ...current, accessToken: event.target.value }))}
                          placeholder="Optional if code exchange is configured"
                        />
                      </Field>
                      <Field>
                        <FieldLabel>WABA ID</FieldLabel>
                        <Input
                          value={embeddedSignupDraft.businessAccountId}
                          onChange={(event) => setEmbeddedSignupDraft((current) => ({ ...current, businessAccountId: event.target.value }))}
                          placeholder="WhatsApp Business Account ID"
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Phone number ID</FieldLabel>
                        <Input
                          value={embeddedSignupDraft.phoneNumberId}
                          onChange={(event) => setEmbeddedSignupDraft((current) => ({ ...current, phoneNumberId: event.target.value }))}
                          placeholder="Meta business phone number ID"
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Business ID</FieldLabel>
                        <Input
                          value={embeddedSignupDraft.businessId}
                          onChange={(event) => setEmbeddedSignupDraft((current) => ({ ...current, businessId: event.target.value }))}
                          placeholder="Optional Meta business portfolio ID"
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Workspace name</FieldLabel>
                        <Input
                          value={embeddedSignupDraft.name}
                          onChange={(event) => setEmbeddedSignupDraft((current) => ({ ...current, name: event.target.value }))}
                          placeholder="Primary WhatsApp number"
                        />
                      </Field>
                    </FieldGroup>
                    <Button
                      type="button"
                      className="mt-4"
                      onClick={() => void exchangeEmbeddedSignup()}
                      disabled={workingWhatsappAction === "embedded" || !embeddedSignupDraft.businessAccountId || !embeddedSignupDraft.phoneNumberId}
                    >
                      {workingWhatsappAction === "embedded" ? "Connecting..." : "Add WhatsApp number"}
                    </Button>
                  </div>

                  <AdvancedSection title="Readiness checks" description="Sync Meta data and test each WhatsApp number when something is blocked.">
                    <div className="text-sm font-semibold">Numbers</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Business verification is visible here, but sending readiness is based on token, phone, webhook, template, and pricing checks.
                    </p>
                    <div className="mt-4 grid gap-3">
                      {(whatsappOnboarding?.workspaces ?? []).map(({ workspace, readiness }) => (
                        <div key={workspace.id} className="rounded-xl border border-border/60 p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{workspace.name}</span>
                            <Badge variant={readinessBadgeVariant(readiness.status)}>{readiness.status}</Badge>
                            <Badge variant="outline">{workspace.phoneNumberId}</Badge>
                          </div>
                          <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                            <span>Business verification: {String(readiness.meta.businessVerificationStatus ?? "unknown")}</span>
                            <span>Phone status: {String(readiness.meta.phoneRegistrationStatus ?? "unknown")}</span>
                            <span>Quality: {String(readiness.meta.qualityRating ?? "unknown")} • Limit: {String(readiness.meta.messagingLimit ?? "unknown")}</span>
                          </div>
                          {readiness.missing.length > 0 ? (
                            <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                              {readiness.missing.map((item) => (
                                <span key={item}>Needs: {item}</span>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void syncWorkspaceMeta(workspace.id)}
                              disabled={workingWhatsappAction === `sync:${workspace.id}`}
                            >
                              {workingWhatsappAction === `sync:${workspace.id}` ? "Syncing..." : "Sync Meta"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void testWorkspaceReadiness(workspace.id)}
                              disabled={workingWhatsappAction === `test:${workspace.id}`}
                            >
                              Test readiness
                            </Button>
                          </div>
                        </div>
                      ))}
                      {whatsappOnboarding && whatsappOnboarding.workspaces.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                          Add a WhatsApp number with Embedded Signup or Manual Setup to start readiness checks.
                        </div>
                      ) : null}
                    </div>
                  </AdvancedSection>
                </div>

                <AdvancedSection title="Message pricing" description="Estimate WhatsApp pass-through costs or import official Meta rate-card data.">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">Message pricing</div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Uses imported Meta pass-through rates. Costs are estimated at queue time and finalized when delivery webhooks arrive.
                      </p>
                    </div>
                    <Badge variant={pricingRates.length > 0 ? "secondary" : "outline"}>{pricingRates.length} rates</Badge>
                  </div>
                  <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                    <div className="grid gap-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field>
                          <FieldLabel>Market</FieldLabel>
                          <Input
                            value={pricingEstimateDraft.market}
                            onChange={(event) => setPricingEstimateDraft((current) => ({ ...current, market: event.target.value }))}
                          />
                        </Field>
                        <Field>
                          <FieldLabel>Currency</FieldLabel>
                          <Input
                            value={pricingEstimateDraft.currency}
                            onChange={(event) => setPricingEstimateDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
                          />
                        </Field>
                        <Field>
                          <FieldLabel>Category</FieldLabel>
                          <NativeSelect
                            value={pricingEstimateDraft.category}
                            onChange={(event) => setPricingEstimateDraft((current) => ({ ...current, category: event.target.value }))}
                            className="h-10 rounded-xl px-3 text-sm"
                          >
                            <option value="marketing">Marketing</option>
                            <option value="utility">Utility</option>
                            <option value="authentication">Authentication</option>
                            <option value="authentication_international">Authentication International</option>
                            <option value="service">Service</option>
                          </NativeSelect>
                        </Field>
                        <Field>
                          <FieldLabel>Delivered messages</FieldLabel>
                          <Input
                            value={pricingEstimateDraft.billableUnits}
                            onChange={(event) => setPricingEstimateDraft((current) => ({ ...current, billableUnits: event.target.value }))}
                          />
                        </Field>
                      </div>
                      <Button type="button" variant="outline" onClick={() => void estimatePricing()} disabled={workingWhatsappAction === "pricing-estimate"}>
                        {workingWhatsappAction === "pricing-estimate" ? "Estimating..." : "Estimate cost"}
                      </Button>
                      {pricingEstimate ? (
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
                          <div className="font-medium">
                            {formatMoney(pricingEstimate.estimatedCost, pricingEstimate.currency)} estimated
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            {pricingEstimate.billableUnits} x {formatMoney(pricingEstimate.unitRate, pricingEstimate.currency)} • {pricingEstimate.category} • {pricingEstimate.reason}
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="grid gap-3">
                      <Field>
                        <FieldLabel>Import official Meta rate-card JSON</FieldLabel>
                        <Textarea
                          value={pricingImportJson}
                          onChange={(event) => setPricingImportJson(event.target.value)}
                          className="min-h-32 font-mono text-xs"
                          placeholder='{"sourceVersion":"meta-2026-01","sourceUrl":"https://developers.facebook.com/docs/whatsapp/pricing#rate-cards","records":[{"market":"India","countryCode":"IN","currency":"INR","category":"marketing","rate":"0.80","effectiveFrom":"2026-01-01T00:00:00.000Z"}]}'
                        />
                        <FieldDescription>Do not scrape live pricing. Import official rate-card data with source version and effective date.</FieldDescription>
                      </Field>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void importPricingRates()}
                        disabled={workingWhatsappAction === "pricing-import" || !pricingImportJson.trim()}
                      >
                        {workingWhatsappAction === "pricing-import" ? "Importing..." : "Import rate card"}
                      </Button>
                    </div>
                  </div>
                  {pricingRates.length > 0 ? (
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      {pricingRates.slice(0, 8).map((rate) => (
                        <div key={rate.id} className="rounded-xl border border-border/60 px-3 py-2 text-sm">
                          <div className="font-medium">
                            {rate.market} • {rate.category.replace("_", " ")}
                          </div>
                          <div className="text-muted-foreground">
                            {formatMoney(rate.rate, rate.currency)} per delivered message • {rate.sourceVersion}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </AdvancedSection>
              </div>
            ) : null}

            {draft && integration.key === "whatsapp" ? (
              <AdvancedSection title="Manual WhatsApp settings" description="Use these fields only when Embedded Signup is not enough.">
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
                  <FieldLabel>Default workspace ID</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.whatsapp.workspaceId)}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, whatsapp: { ...current.whatsapp, workspaceId: event.target.value || null } } : current))
                    }
                    placeholder="Workspace UUID"
                  />
                </Field>
                <Field>
                  <FieldLabel>Webhook key</FieldLabel>
                  <Input
                    value={valueOrEmpty(draft.whatsapp.webhookKey)}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, whatsapp: { ...current.whatsapp, webhookKey: event.target.value || null } } : current))
                    }
                    placeholder="tenant-specific webhook slug"
                  />
                  <FieldDescription>Use the keyed endpoint below for Meta verification and event delivery.</FieldDescription>
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
                    value={valueOrEmpty(
                      draft.whatsapp.webhookUrl ??
                        (draft.whatsapp.webhookKey ? buildApiUrl(`/public/whatsapp/webhook/${draft.whatsapp.webhookKey}`) : draft.webhookUrl),
                    )}
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
                    placeholder={buildApiUrl("/public/whatsapp/webhook/:webhookKey")}
                  />
                </Field>
                <Field>
                  <FieldLabel>Active phone number IDs</FieldLabel>
                  <Textarea
                    value={(draft.whatsapp.activePhoneNumberIds ?? []).join(", ")}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, whatsapp: { ...current.whatsapp, activePhoneNumberIds: parseList(event.target.value) } } : current,
                      )
                    }
                    className="min-h-20"
                    placeholder="Comma or newline separated phone number IDs routed to this workspace"
                  />
                </Field>
              </FieldGroup>

              <div className="grid gap-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
                <div>
                  <div className="text-sm font-semibold">Cloud API workspace</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This writes to the backend workspace used by signature verification, session windows, outbox sends, media uploads, and webhook routing.
                  </p>
                </div>

                {whatsappWorkspaces.length > 0 ? (
                  <div className="grid gap-2">
                    {whatsappWorkspaces.map((workspace) => (
                      <button
                        key={workspace.id}
                        type="button"
                        onClick={() => setWhatsappWorkspaceDraft(workspaceToDraft(workspace))}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-left text-sm transition hover:bg-muted/30",
                          whatsappWorkspaceDraft.id === workspace.id ? "border-primary/40 bg-muted/30" : "border-border/60",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{workspace.name}</span>
                          <Badge variant={workspace.isActive ? "secondary" : "outline"}>{workspace.isActive ? "Active" : "Inactive"}</Badge>
                          <Badge variant={workspace.isVerified ? "secondary" : "outline"}>{workspace.isVerified ? "Verified" : "Unverified"}</Badge>
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          Phone {workspace.phoneNumberId} {workspace.webhookKey ? `• webhook ${workspace.webhookKey}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
                    No WhatsApp Cloud API workspace has been saved yet.
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => setWhatsappWorkspaceDraft(emptyWhatsappWorkspaceDraft)}
                >
                  New workspace
                </Button>

                <FieldGroup>
                  <Field>
                    <FieldLabel>Workspace name</FieldLabel>
                    <Input
                      value={whatsappWorkspaceDraft.name}
                      onChange={(event) => setWhatsappWorkspaceDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Primary WhatsApp number"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Phone number ID</FieldLabel>
                    <Input
                      value={whatsappWorkspaceDraft.phoneNumberId}
                      onChange={(event) => setWhatsappWorkspaceDraft((current) => ({ ...current, phoneNumberId: event.target.value }))}
                      placeholder="Meta phone number ID"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Business account ID</FieldLabel>
                    <Input
                      value={whatsappWorkspaceDraft.businessAccountId}
                      onChange={(event) => setWhatsappWorkspaceDraft((current) => ({ ...current, businessAccountId: event.target.value }))}
                      placeholder="WABA ID"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Webhook key</FieldLabel>
                    <Input
                      value={whatsappWorkspaceDraft.webhookKey}
                      onChange={(event) => setWhatsappWorkspaceDraft((current) => ({ ...current, webhookKey: event.target.value }))}
                      placeholder="company-whatsapp-prod"
                    />
                    <FieldDescription>
                      Event URL:{" "}
                      <span className="break-all font-mono text-xs">
                        {buildApiUrl(`/public/whatsapp/webhook/${whatsappWorkspaceDraft.webhookKey || ":webhookKey"}`)}
                      </span>
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel>Active phone IDs</FieldLabel>
                    <Textarea
                      value={whatsappWorkspaceDraft.activePhoneNumberIds}
                      onChange={(event) => setWhatsappWorkspaceDraft((current) => ({ ...current, activePhoneNumberIds: event.target.value }))}
                      className="min-h-20"
                      placeholder="Usually the primary phone number ID, plus any routed aliases"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Access token</FieldLabel>
                    <Input
                      value={whatsappWorkspaceDraft.accessToken}
                      onChange={(event) => setWhatsappWorkspaceDraft((current) => ({ ...current, accessToken: event.target.value }))}
                      placeholder={whatsappWorkspaceDraft.id ? "Leave blank to keep existing token" : "System user token"}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Verify token</FieldLabel>
                    <Input
                      value={whatsappWorkspaceDraft.verifyToken}
                      onChange={(event) => setWhatsappWorkspaceDraft((current) => ({ ...current, verifyToken: event.target.value }))}
                      placeholder={whatsappWorkspaceDraft.id ? "Leave blank to keep existing token" : "Webhook verify token"}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>App secret</FieldLabel>
                    <Input
                      value={whatsappWorkspaceDraft.appSecret}
                      onChange={(event) => setWhatsappWorkspaceDraft((current) => ({ ...current, appSecret: event.target.value }))}
                      placeholder={whatsappWorkspaceDraft.id ? "Leave blank to keep existing secret" : "Meta app secret"}
                    />
                  </Field>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field className="flex-row items-start gap-3 rounded-xl border border-border/60 bg-background p-3">
                      <Checkbox
                        checked={whatsappWorkspaceDraft.isActive}
                        onCheckedChange={(checked) => setWhatsappWorkspaceDraft((current) => ({ ...current, isActive: checked === true }))}
                      />
                      <div>
                        <FieldLabel>Active workspace</FieldLabel>
                        <FieldDescription>Eligible for send and webhook routing.</FieldDescription>
                      </div>
                    </Field>
                    <Field className="flex-row items-start gap-3 rounded-xl border border-border/60 bg-background p-3">
                      <Checkbox
                        checked={whatsappWorkspaceDraft.isVerified}
                        onCheckedChange={(checked) => setWhatsappWorkspaceDraft((current) => ({ ...current, isVerified: checked === true }))}
                      />
                      <div>
                        <FieldLabel>Webhook verified</FieldLabel>
                        <FieldDescription>Mark after Meta challenge succeeds.</FieldDescription>
                      </div>
                    </Field>
                  </div>
                </FieldGroup>

                <Button
                  type="button"
                  onClick={() => void saveWhatsappWorkspace()}
                  disabled={savingWhatsappWorkspace || !whatsappWorkspaceDraft.name || !whatsappWorkspaceDraft.phoneNumberId}
                >
                  {savingWhatsappWorkspace ? "Saving workspace..." : whatsappWorkspaceDraft.id ? "Update workspace" : "Create workspace"}
                </Button>
              </div>
              </AdvancedSection>
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
