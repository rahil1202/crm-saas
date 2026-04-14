import type { ComponentType, SVGProps } from "react";

import type { IntegrationOauthProvider } from "@/lib/integration-oauth";
import {
  GoogleDriveIcon,
  GoogleMailIcon,
  LinkedInIcon,
  WebhookIcon,
  WhatsAppIcon,
} from "@/components/ui/integration-icons";

export type ReadinessStatus = "ready" | "in_progress" | "needs_setup";
export type IntegrationStatus = "completed" | "pending";
export type IntegrationKey = "email" | "whatsapp" | "linkedin" | "documents" | "webhooks";

export interface IntegrationSettings {
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

export interface IntegrationHubResponse {
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

export const integrationsCatalog: Array<{
  key: IntegrationKey;
  title: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  steps: string[];
}> = [
  {
    key: "email",
    title: "Email",
    description: "Sender identity, OAuth, and event webhook.",
    icon: GoogleMailIcon,
    steps: ["Connect provider", "Set sender details", "Add event webhook"],
  },
  {
    key: "whatsapp",
    title: "WhatsApp",
    description: "Cloud API setup and webhook verification.",
    icon: WhatsAppIcon,
    steps: ["Select provider", "Map business IDs", "Verify webhook"],
  },
  {
    key: "linkedin",
    title: "LinkedIn",
    description: "OAuth link and lead sync setup.",
    icon: LinkedInIcon,
    steps: ["Connect OAuth", "Set organization URN", "Add lead endpoint"],
  },
  {
    key: "documents",
    title: "Documents",
    description: "Intake email and record auto-attach.",
    icon: GoogleDriveIcon,
    steps: ["Set intake email", "Set storage folder", "Enable auto-attach"],
  },
  {
    key: "webhooks",
    title: "Webhooks",
    description: "Inbound, outbound, and signing settings.",
    icon: WebhookIcon,
    steps: ["Set inbound URL", "Set outbound/Slack URL", "Set signing hint"],
  },
];

export const oauthProviders: Array<{
  title: string;
  provider: IntegrationOauthProvider;
  channel: "email" | "linkedin";
  scopes: string[];
  queryParams?: Record<string, string>;
}> = [
  {
    title: "Google Workspace",
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
    title: "Microsoft 365",
    provider: "azure",
    channel: "email",
    scopes: ["openid", "email", "profile", "offline_access", "User.Read", "Mail.Send", "Mail.Read"],
  },
  {
    title: "LinkedIn",
    provider: "linkedin_oidc",
    channel: "linkedin",
    scopes: ["openid", "profile", "email", "r_organization_admin", "r_organization_social", "w_organization_social"],
  },
];

const channelAliases: Record<IntegrationKey, string[]> = {
  email: ["email"],
  whatsapp: ["whatsapp"],
  linkedin: ["linkedin"],
  documents: ["documents"],
  webhooks: ["webhooks", "generic_webhooks", "genericWebhooks"],
};

export function getHubChannel(hub: IntegrationHubResponse | null, key: IntegrationKey) {
  const aliases = channelAliases[key];
  return (hub?.channels ?? []).find((channel) => aliases.includes(channel.key));
}

export function getIntegrationStatus(
  key: IntegrationKey,
  hub: IntegrationHubResponse | null,
  settings: IntegrationSettings["integrations"] | null,
): IntegrationStatus {
  const channel = getHubChannel(hub, key);
  if (channel?.readiness.status === "ready") {
    return "completed";
  }

  if (!settings) {
    return "pending";
  }

  if (key === "email") {
    return settings.email.provider || settings.emailProvider ? "completed" : "pending";
  }
  if (key === "whatsapp") {
    return settings.whatsapp.provider || settings.whatsappProvider ? "completed" : "pending";
  }
  if (key === "linkedin") {
    return settings.linkedin.provider ? "completed" : "pending";
  }
  if (key === "documents") {
    return settings.documents.intakeEmail || settings.documents.storageFolder ? "completed" : "pending";
  }
  return settings.genericWebhooks.inboundUrl || settings.genericWebhooks.outboundUrl || settings.slackWebhookUrl ? "completed" : "pending";
}

export function valueOrEmpty(value: string | null | undefined) {
  return value ?? "";
}

export function parseList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
