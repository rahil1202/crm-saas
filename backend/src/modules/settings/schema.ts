import { z } from "zod";

export const pipelineStageSchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
});

export const dealPipelineSchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
  stages: z.array(pipelineStageSchema).min(1).max(20),
});

export const leadSourceSchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
});

export const businessHourSchema = z.object({
  day: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
  enabled: z.boolean(),
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
});

export const brandingSchema = z.object({
  companyLabel: z.string().trim().max(120).default(""),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  logoUrl: z.string().url().nullable().optional(),
});

export const customFieldSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  entity: z.enum(["lead", "customer", "deal"]),
  type: z.enum(["text", "number", "date", "select"]),
  options: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
  required: z.boolean().default(false),
});

export const tagSchema = z.object({
  key: z.string().trim().min(1).max(50),
  label: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

export const notificationRulesSchema = z.object({
  emailAlerts: z.boolean(),
  taskReminders: z.boolean(),
  overdueDigest: z.boolean(),
  dealStageAlerts: z.boolean(),
  campaignAlerts: z.boolean(),
});

export const integrationsSchema = z.object({
  slackWebhookUrl: z.string().url().nullable().optional(),
  whatsappProvider: z.string().trim().max(80).nullable().optional(),
  emailProvider: z.string().trim().max(80).nullable().optional(),
  webhookUrl: z.string().url().nullable().optional(),
});

export const updatePipelineSettingsSchema = z.object({
  defaultDealPipeline: z.string().trim().min(1).max(100),
  dealPipelines: z.array(dealPipelineSchema).min(1).max(10),
});

export const updateLeadSourcesSchema = z.object({
  leadSources: z.array(leadSourceSchema).min(1).max(20),
});

export const updateCompanyPreferencesSchema = z.object({
  businessHours: z.array(businessHourSchema).length(7),
  branding: brandingSchema,
});

export const updateCustomFieldsSchema = z.object({
  customFields: z.array(customFieldSchema).max(40),
});

export const updateTagsSchema = z.object({
  tags: z.array(tagSchema).max(50),
});

export const updateNotificationRulesSchema = z.object({
  notificationRules: notificationRulesSchema,
});

export const updateIntegrationsSchema = z.object({
  integrations: integrationsSchema,
});

export type UpdatePipelineSettingsInput = z.infer<typeof updatePipelineSettingsSchema>;
export type UpdateLeadSourcesInput = z.infer<typeof updateLeadSourcesSchema>;
export type UpdateCompanyPreferencesInput = z.infer<typeof updateCompanyPreferencesSchema>;
export type UpdateCustomFieldsInput = z.infer<typeof updateCustomFieldsSchema>;
export type UpdateTagsInput = z.infer<typeof updateTagsSchema>;
export type UpdateNotificationRulesInput = z.infer<typeof updateNotificationRulesSchema>;
export type UpdateIntegrationsInput = z.infer<typeof updateIntegrationsSchema>;
