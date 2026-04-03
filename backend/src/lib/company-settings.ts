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
  integrations: {
    slackWebhookUrl: string | null;
    whatsappProvider: string | null;
    emailProvider: string | null;
    webhookUrl: string | null;
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
};

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
    integrations: settings?.integrations ?? defaultIntegrations,
  };
}
