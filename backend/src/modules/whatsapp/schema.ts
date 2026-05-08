import { z } from "zod";

export const listWhatsappWorkspacesSchema = z.object({
  q: z.string().trim().optional(),
});

export const whatsappWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(180),
  phoneNumberId: z.string().trim().min(1).max(120),
  businessAccountId: z.string().trim().max(120).optional(),
  webhookKey: z.string().trim().min(8).max(120).optional(),
  accessToken: z.string().trim().optional(),
  verifyToken: z.string().trim().optional(),
  verifyTokenHash: z.string().trim().max(128).optional(),
  appSecret: z.string().trim().optional(),
  isActive: z.boolean().default(true),
  isVerified: z.boolean().default(false),
  activePhoneNumberIds: z.array(z.string().trim().min(1).max(120)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const updateWhatsappWorkspaceSchema = whatsappWorkspaceSchema.partial();
export const whatsappWorkspaceParamSchema = z.object({ workspaceId: z.string().uuid() });
export const whatsappWorkspaceIdParamSchema = z.object({ id: z.string().uuid() });

export const listWhatsappTemplatesSchema = z.object({
  q: z.string().trim().optional(),
  workspaceId: z.string().uuid().optional(),
  status: z.enum(["draft", "approved", "rejected", "paused"]).optional(),
});

export const whatsappTemplateSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(180),
  category: z.string().trim().max(80).optional(),
  language: z.string().trim().min(1).max(16).default("en"),
  status: z.enum(["draft", "rejected", "paused"]).default("draft"),
  body: z.string().trim().min(1).max(4000),
  variables: z.array(z.object({ key: z.string().trim().min(1).max(120), fallback: z.string().trim().max(240).optional() })).default([]),
  components: z.array(z.record(z.string(), z.unknown())).default([]),
  providerTemplateId: z.string().trim().max(180).optional(),
});
export const updateWhatsappTemplateSchema = whatsappTemplateSchema.partial();

export const syncWhatsappTemplateSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  fullSync: z.boolean().default(false),
});

export const submitWhatsappTemplateSchema = z.object({
  workspaceId: z.string().uuid().optional(),
});

export const whatsappTemplateParamSchema = z.object({ templateId: z.string().uuid() });

const whatsappMessageTemplateSchema = z.object({
  name: z.string().trim().min(1).max(180),
  language: z.string().trim().min(1).max(16).default("en"),
  components: z.array(z.record(z.string(), z.unknown())).default([]),
});

const whatsappMediaSchema = z.object({
  mediaAssetId: z.string().uuid().optional(),
  mediaType: z.enum(["image", "document", "video", "audio"]),
  link: z.string().url().optional(),
  caption: z.string().trim().max(500).optional(),
});

export const sendWhatsappApiMessageSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  to: z.string().trim().min(1).max(180),
  contactName: z.string().trim().max(180).optional(),
  crmRef: z
    .object({
      leadId: z.string().uuid().optional(),
      customerId: z.string().uuid().optional(),
      conversationId: z.string().uuid().optional(),
    })
    .default({}),
  mode: z.enum(["auto", "freeform", "template"]).default("auto"),
  text: z.string().trim().max(4000).optional(),
  template: whatsappMessageTemplateSchema.optional(),
  media: whatsappMediaSchema.optional(),
  interactive: z.record(z.string(), z.unknown()).optional(),
  contextMessageId: z.string().trim().max(180).optional(),
  idempotencyKey: z.string().trim().max(180).optional(),
  priority: z.number().int().min(0).max(1000).default(100),
  sendAt: z.string().datetime().optional(),
  variables: z.record(z.string(), z.unknown()).default({}),
});

export const whatsappMessageParamSchema = z.object({ messageId: z.string().uuid() });
export const whatsappConversationParamSchema = z.object({ conversationId: z.string().uuid() });

export const createWhatsappMediaSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  mediaType: z.enum(["image", "document", "video", "audio"]),
  sourceUrl: z.string().url().optional(),
  providerMediaId: z.string().trim().max(180).optional(),
  caption: z.string().trim().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const embeddedSignupExchangeSchema = z.object({
  code: z.string().trim().optional(),
  accessToken: z.string().trim().optional(),
  businessAccountId: z.string().trim().max(120).optional(),
  phoneNumberId: z.string().trim().max(120).optional(),
  businessId: z.string().trim().max(120).optional(),
  name: z.string().trim().max(180).optional(),
  webhookKey: z.string().trim().min(8).max(120).optional(),
  verifyToken: z.string().trim().optional(),
  appSecret: z.string().trim().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const listWhatsappPricingRatesSchema = z.object({
  market: z.string().trim().max(120).optional(),
  currency: z.string().trim().length(3).optional(),
  category: z.enum(["marketing", "utility", "authentication", "authentication_international", "service"]).optional(),
});

export const whatsappPricingEstimateSchema = z.object({
  to: z.string().trim().max(180).optional(),
  market: z.string().trim().max(120).optional(),
  countryCode: z.string().trim().max(8).optional(),
  currency: z.string().trim().length(3).default("USD"),
  category: z.enum(["marketing", "utility", "authentication", "authentication_international", "service"]),
  billableUnits: z.number().int().min(1).max(1_000_000).default(1),
  serviceWindowOpen: z.boolean().optional(),
});

export const whatsappPricingImportSchema = z.object({
  sourceVersion: z.string().trim().min(1).max(180),
  sourceUrl: z.string().url().optional(),
  records: z
    .array(
      z.object({
        market: z.string().trim().min(1).max(120),
        countryCode: z.string().trim().max(8).optional(),
        currency: z.string().trim().length(3),
        category: z.enum(["marketing", "utility", "authentication", "authentication_international", "service"]),
        rate: z.union([z.string().trim().regex(/^\d+(\.\d+)?$/), z.number().nonnegative()]),
        tierFrom: z.number().int().min(1).optional(),
        tierTo: z.number().int().min(1).nullable().optional(),
        effectiveFrom: z.string().datetime(),
        effectiveTo: z.string().datetime().nullable().optional(),
        metadata: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(10_000),
});

export type CreateWhatsappWorkspaceInput = z.infer<typeof whatsappWorkspaceSchema>;
export type UpdateWhatsappWorkspaceInput = z.infer<typeof updateWhatsappWorkspaceSchema>;
export type ListWhatsappWorkspacesQuery = z.infer<typeof listWhatsappWorkspacesSchema>;
export type CreateWhatsappTemplateInput = z.infer<typeof whatsappTemplateSchema>;
export type UpdateWhatsappTemplateInput = z.infer<typeof updateWhatsappTemplateSchema>;
export type SyncWhatsappTemplateInput = z.infer<typeof syncWhatsappTemplateSchema>;
export type SubmitWhatsappTemplateInput = z.infer<typeof submitWhatsappTemplateSchema>;
export type ListWhatsappTemplatesQuery = z.infer<typeof listWhatsappTemplatesSchema>;
export type SendWhatsappApiMessageInput = z.infer<typeof sendWhatsappApiMessageSchema>;
export type CreateWhatsappMediaInput = z.infer<typeof createWhatsappMediaSchema>;
export type EmbeddedSignupExchangeInput = z.infer<typeof embeddedSignupExchangeSchema>;
export type ListWhatsappPricingRatesQuery = z.infer<typeof listWhatsappPricingRatesSchema>;
export type WhatsappPricingEstimateInput = z.infer<typeof whatsappPricingEstimateSchema>;
export type WhatsappPricingImportInput = z.infer<typeof whatsappPricingImportSchema>;
