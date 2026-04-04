import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { companySettings } from "@/db/schema";

export interface PipelineStageSetting {
  key: string;
  label: string;
}

export interface DealPipelineSetting {
  key: string;
  label: string;
  stages: PipelineStageSetting[];
}

export interface LeadSourceSetting {
  key: string;
  label: string;
}

export interface BusinessHourSetting {
  day: string;
  enabled: boolean;
  open: string;
  close: string;
}

export interface BrandingSetting {
  companyLabel: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
}

export interface CompanySettingsPayload {
  defaultDealPipeline: string;
  dealPipelines: DealPipelineSetting[];
  leadSources: LeadSourceSetting[];
  businessHours: BusinessHourSetting[];
  branding: BrandingSetting;
  customFields: Array<{
    key: string;
    label: string;
    entity: "lead" | "customer" | "deal";
    type: "text" | "number" | "date" | "select";
    options?: string[];
    required: boolean;
  }>;
  tags: Array<{ key: string; label: string; color: string }>;
  notificationRules: {
    emailAlerts: boolean;
    taskReminders: boolean;
    overdueDigest: boolean;
    dealStageAlerts: boolean;
    campaignAlerts: boolean;
  };
  integrations: IntegrationSettingsPayload;
}

export interface IntegrationSettingsPayload {
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
    fromName: string | null;
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
    features: {
      leadSync: boolean;
      orgPosting: boolean;
    };
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
}

const defaultDealPipelines: DealPipelineSetting[] = [
  {
    key: "default",
    label: "Default Pipeline",
    stages: [
      { key: "new", label: "New" },
      { key: "qualified", label: "Qualified" },
      { key: "proposal", label: "Proposal" },
      { key: "negotiation", label: "Negotiation" },
      { key: "won", label: "Won" },
    ],
  },
];

const defaultLeadSources: LeadSourceSetting[] = [
  { key: "website", label: "Website" },
  { key: "referral", label: "Referral" },
  { key: "walk_in", label: "Walk In" },
  { key: "campaign", label: "Campaign" },
];

const defaultBusinessHours: BusinessHourSetting[] = [
  { day: "monday", enabled: true, open: "09:00", close: "18:00" },
  { day: "tuesday", enabled: true, open: "09:00", close: "18:00" },
  { day: "wednesday", enabled: true, open: "09:00", close: "18:00" },
  { day: "thursday", enabled: true, open: "09:00", close: "18:00" },
  { day: "friday", enabled: true, open: "09:00", close: "18:00" },
  { day: "saturday", enabled: false, open: "10:00", close: "14:00" },
  { day: "sunday", enabled: false, open: "00:00", close: "00:00" },
];

const defaultBranding: BrandingSetting = {
  companyLabel: "",
  primaryColor: "#102031",
  accentColor: "#d97706",
  logoUrl: null,
};

const defaultCustomFields: CompanySettingsPayload["customFields"] = [];
const defaultTags: CompanySettingsPayload["tags"] = [];
const defaultNotificationRules: CompanySettingsPayload["notificationRules"] = {
  emailAlerts: true,
  taskReminders: true,
  overdueDigest: true,
  dealStageAlerts: true,
  campaignAlerts: true,
};
const defaultIntegrations: CompanySettingsPayload["integrations"] = {
  slackWebhookUrl: null,
  whatsappProvider: null,
  emailProvider: null,
  webhookUrl: null,
  workspaceMode: "guided",
  email: {
    provider: null,
    deliveryMethod: "api",
    oauthScopes: [],
    fromEmail: null,
    fromName: null,
    replyToEmail: null,
    domain: null,
    webhookUrl: null,
    smtpHost: null,
    smtpPort: null,
    notes: null,
  },
  whatsapp: {
    provider: null,
    onboardingMethod: "cloud_api",
    workspaceId: null,
    phoneNumberId: null,
    businessAccountId: null,
    verifyToken: null,
    appSecret: null,
    webhookUrl: null,
    notes: null,
  },
  linkedin: {
    provider: null,
    syncMode: "oauth_pull",
    organizationUrn: null,
    adAccountUrns: [],
    webhookUrl: null,
    scopes: [],
    features: {
      leadSync: true,
      orgPosting: false,
    },
    notes: null,
  },
  documents: {
    intakeEmail: null,
    autoAttachToRecords: true,
    storageFolder: null,
    notes: null,
  },
  genericWebhooks: {
    inboundUrl: null,
    outboundUrl: null,
    signingSecretHint: null,
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeIntegrationSettings(value: unknown): IntegrationSettingsPayload {
  const source = asRecord(value);
  const email = asRecord(source.email);
  const whatsapp = asRecord(source.whatsapp);
  const linkedin = asRecord(source.linkedin);
  const linkedinFeatures = asRecord(linkedin.features);
  const documents = asRecord(source.documents);
  const genericWebhooks = asRecord(source.genericWebhooks);

  const emailProvider = asNullableString(source.emailProvider) ?? asNullableString(email.provider);
  const whatsappProvider = asNullableString(source.whatsappProvider) ?? asNullableString(whatsapp.provider);
  const webhookUrl = asNullableString(source.webhookUrl);

  return {
    slackWebhookUrl: asNullableString(source.slackWebhookUrl),
    whatsappProvider,
    emailProvider,
    webhookUrl,
    workspaceMode: source.workspaceMode === "legacy" ? "legacy" : "guided",
    email: {
      provider: emailProvider,
      deliveryMethod: email.deliveryMethod === "smtp" || email.deliveryMethod === "hybrid" ? email.deliveryMethod : "api",
      oauthScopes: asStringArray(email.oauthScopes),
      fromEmail: asNullableString(email.fromEmail),
      fromName: asNullableString(email.fromName),
      replyToEmail: asNullableString(email.replyToEmail),
      domain: asNullableString(email.domain),
      webhookUrl: asNullableString(email.webhookUrl) ?? webhookUrl,
      smtpHost: asNullableString(email.smtpHost),
      smtpPort: asNullableNumber(email.smtpPort),
      notes: asNullableString(email.notes),
    },
    whatsapp: {
      provider: whatsappProvider,
      onboardingMethod:
        whatsapp.onboardingMethod === "embedded_signup" || whatsapp.onboardingMethod === "manual_token"
          ? whatsapp.onboardingMethod
          : "cloud_api",
      workspaceId: asNullableString(whatsapp.workspaceId),
      phoneNumberId: asNullableString(whatsapp.phoneNumberId),
      businessAccountId: asNullableString(whatsapp.businessAccountId),
      verifyToken: asNullableString(whatsapp.verifyToken),
      appSecret: asNullableString(whatsapp.appSecret),
      webhookUrl: asNullableString(whatsapp.webhookUrl) ?? webhookUrl,
      notes: asNullableString(whatsapp.notes),
    },
    linkedin: {
      provider: asNullableString(linkedin.provider),
      syncMode:
        linkedin.syncMode === "oauth_push" || linkedin.syncMode === "hybrid"
          ? linkedin.syncMode
          : "oauth_pull",
      organizationUrn: asNullableString(linkedin.organizationUrn),
      adAccountUrns: asStringArray(linkedin.adAccountUrns),
      webhookUrl: asNullableString(linkedin.webhookUrl),
      scopes: asStringArray(linkedin.scopes),
      features: {
        leadSync: asBoolean(linkedinFeatures.leadSync, true),
        orgPosting: asBoolean(linkedinFeatures.orgPosting, false),
      },
      notes: asNullableString(linkedin.notes),
    },
    documents: {
      intakeEmail: asNullableString(documents.intakeEmail),
      autoAttachToRecords: asBoolean(documents.autoAttachToRecords, true),
      storageFolder: asNullableString(documents.storageFolder),
      notes: asNullableString(documents.notes),
    },
    genericWebhooks: {
      inboundUrl: asNullableString(genericWebhooks.inboundUrl),
      outboundUrl: asNullableString(genericWebhooks.outboundUrl),
      signingSecretHint: asNullableString(genericWebhooks.signingSecretHint),
    },
  };
}

export function mergeIntegrationSettings(currentValue: unknown, patchValue: unknown): IntegrationSettingsPayload {
  const current = normalizeIntegrationSettings(currentValue);
  const patch = asRecord(patchValue);

  return normalizeIntegrationSettings({
    ...current,
    ...patch,
    email: {
      ...current.email,
      ...asRecord(patch.email),
    },
    whatsapp: {
      ...current.whatsapp,
      ...asRecord(patch.whatsapp),
    },
    linkedin: {
      ...current.linkedin,
      ...asRecord(patch.linkedin),
      features: {
        ...current.linkedin.features,
        ...asRecord(asRecord(patch.linkedin).features),
      },
    },
    documents: {
      ...current.documents,
      ...asRecord(patch.documents),
    },
    genericWebhooks: {
      ...current.genericWebhooks,
      ...asRecord(patch.genericWebhooks),
    },
  });
}

export function getDefaultCompanySettings(): CompanySettingsPayload {
  return {
    defaultDealPipeline: "default",
    dealPipelines: defaultDealPipelines,
    leadSources: defaultLeadSources,
    businessHours: defaultBusinessHours,
    branding: defaultBranding,
    customFields: defaultCustomFields,
    tags: defaultTags,
    notificationRules: defaultNotificationRules,
    integrations: defaultIntegrations,
  };
}

export async function ensureCompanySettings(companyId: string) {
  const defaults = getDefaultCompanySettings();

  const [settings] = await db
    .insert(companySettings)
    .values({
      companyId,
      defaultDealPipeline: defaults.defaultDealPipeline,
      dealPipelines: defaults.dealPipelines,
      leadSources: defaults.leadSources,
      businessHours: defaults.businessHours,
      branding: defaults.branding,
      customFields: defaults.customFields,
      tags: defaults.tags,
      notificationRules: defaults.notificationRules,
      integrations: defaults.integrations,
    })
    .onConflictDoNothing()
    .returning();

  if (settings) {
    return settings;
  }

  const [existing] = await db.select().from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1);

  return existing;
}

export async function getCompanySettings(companyId: string): Promise<CompanySettingsPayload> {
  const settings = await ensureCompanySettings(companyId);

  return {
    defaultDealPipeline: settings?.defaultDealPipeline ?? "default",
    dealPipelines: settings?.dealPipelines?.length ? settings.dealPipelines : defaultDealPipelines,
    leadSources: settings?.leadSources?.length ? settings.leadSources : defaultLeadSources,
    businessHours: settings?.businessHours?.length ? settings.businessHours : defaultBusinessHours,
    branding: settings?.branding ?? defaultBranding,
    customFields: settings?.customFields ?? defaultCustomFields,
    tags: settings?.tags ?? defaultTags,
    notificationRules: settings?.notificationRules ?? defaultNotificationRules,
    integrations: normalizeIntegrationSettings(settings?.integrations ?? defaultIntegrations),
  };
}
