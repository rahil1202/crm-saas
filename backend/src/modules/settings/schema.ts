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
  workspaceMode: z.enum(["guided", "legacy"]).optional(),
  email: z
    .object({
      provider: z.string().trim().max(80).nullable().optional(),
      deliveryMethod: z.enum(["api", "smtp", "hybrid"]).optional(),
      oauthScopes: z.array(z.string().trim().min(1).max(255)).max(20).optional(),
      fromEmail: z.string().email().nullable().optional(),
      fromName: z.string().trim().max(180).nullable().optional(),
      replyToEmail: z.string().email().nullable().optional(),
      domain: z.string().trim().max(180).nullable().optional(),
      webhookUrl: z.string().url().nullable().optional(),
      smtpHost: z.string().trim().max(180).nullable().optional(),
      smtpPort: z.coerce.number().int().min(1).max(65535).nullable().optional(),
      notes: z.string().trim().max(4000).nullable().optional(),
    })
    .optional(),
  whatsapp: z
    .object({
      provider: z.string().trim().max(80).nullable().optional(),
      onboardingMethod: z.enum(["cloud_api", "embedded_signup", "manual_token"]).optional(),
      workspaceId: z.string().uuid().nullable().optional(),
      phoneNumberId: z.string().trim().max(120).nullable().optional(),
      businessAccountId: z.string().trim().max(120).nullable().optional(),
      verifyToken: z.string().trim().max(240).nullable().optional(),
      appSecret: z.string().trim().max(240).nullable().optional(),
      webhookUrl: z.string().url().nullable().optional(),
      notes: z.string().trim().max(4000).nullable().optional(),
    })
    .optional(),
  linkedin: z
    .object({
      provider: z.string().trim().max(80).nullable().optional(),
      syncMode: z.enum(["oauth_pull", "oauth_push", "hybrid"]).optional(),
      organizationUrn: z.string().trim().max(255).nullable().optional(),
      adAccountUrns: z.array(z.string().trim().min(1).max(255)).max(50).optional(),
      webhookUrl: z.string().url().nullable().optional(),
      scopes: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
      features: z
        .object({
          leadSync: z.boolean().optional(),
          orgPosting: z.boolean().optional(),
        })
        .optional(),
      notes: z.string().trim().max(4000).nullable().optional(),
    })
    .optional(),
  documents: z
    .object({
      intakeEmail: z.string().email().nullable().optional(),
      autoAttachToRecords: z.boolean().optional(),
      storageFolder: z.string().trim().max(255).nullable().optional(),
      notes: z.string().trim().max(4000).nullable().optional(),
    })
    .optional(),
  genericWebhooks: z
    .object({
      inboundUrl: z.string().url().nullable().optional(),
      outboundUrl: z.string().url().nullable().optional(),
      signingSecretHint: z.string().trim().max(240).nullable().optional(),
    })
    .optional(),
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

export const linkIntegrationOauthSchema = z.object({
  channel: z.enum(["email", "linkedin"]),
  provider: z.enum(["google", "azure", "linkedin_oidc"]),
  scopes: z.array(z.string().trim().min(1).max(255)).max(20),
  providerAccessToken: z.string().min(1),
  providerRefreshToken: z.string().min(1).nullable().optional(),
  account: z.object({
    email: z.string().email().nullable().optional(),
    name: z.string().trim().max(180).nullable().optional(),
    handle: z.string().trim().max(180).nullable().optional(),
    providerUserId: z.string().trim().max(255).nullable().optional(),
  }),
});

export const disconnectIntegrationOauthSchema = z.object({
  channel: z.enum(["email", "linkedin"]),
  provider: z.enum(["google", "azure", "linkedin_oidc"]),
});

export type UpdatePipelineSettingsInput = z.infer<typeof updatePipelineSettingsSchema>;
export type UpdateLeadSourcesInput = z.infer<typeof updateLeadSourcesSchema>;
export type UpdateCompanyPreferencesInput = z.infer<typeof updateCompanyPreferencesSchema>;
export type UpdateCustomFieldsInput = z.infer<typeof updateCustomFieldsSchema>;
export type UpdateTagsInput = z.infer<typeof updateTagsSchema>;
export type UpdateNotificationRulesInput = z.infer<typeof updateNotificationRulesSchema>;
export type UpdateIntegrationsInput = z.infer<typeof updateIntegrationsSchema>;
export type LinkIntegrationOauthInput = z.infer<typeof linkIntegrationOauthSchema>;
export type DisconnectIntegrationOauthInput = z.infer<typeof disconnectIntegrationOauthSchema>;
