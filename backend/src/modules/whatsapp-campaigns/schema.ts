import { z } from "zod";

export const campaignParamSchema = z.object({ campaignId: z.string().uuid() });

export const listCampaignsSchema = z.object({
  status: z.enum(["draft", "scheduled", "sending", "paused", "completed", "canceled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListCampaignsQuery = z.infer<typeof listCampaignsSchema>;

export const createCampaignSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1000).optional(),
  audienceType: z.enum(["manual", "segment", "all_contacts"]).default("manual"),
  audienceFilter: z.record(z.string(), z.unknown()).default({}),
  templateName: z.string().trim().max(180).optional(),
  templateLanguage: z.string().trim().max(16).default("en"),
  templateVariables: z.record(z.string(), z.unknown()).default({}),
  scheduleType: z.enum(["immediate", "scheduled", "recurring"]).default("immediate"),
  scheduledAt: z.string().datetime().optional(),
  recurringCron: z.string().trim().max(120).optional(),
  recurringUntil: z.string().datetime().optional(),
  throttleMps: z.number().int().min(1).max(1000).default(30),
  retryMaxAttempts: z.number().int().min(0).max(10).default(3),
  retryBackoffSeconds: z.number().int().min(10).max(3600).default(60),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = createCampaignSchema.partial();
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const addAudienceSchema = z.object({
  contacts: z
    .array(
      z.object({
        phoneE164: z.string().trim().min(5).max(32),
        contactName: z.string().trim().max(180).optional(),
        variables: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(5000),
});
export type AddAudienceInput = z.infer<typeof addAudienceSchema>;

export const addAudienceFromSegmentSchema = z.object({
  engagementStatus: z.enum(["hot", "warm", "cold", "dormant"]).optional(),
  optInStatus: z.enum(["opted_in", "opted_out", "unknown"]).optional(),
  tagId: z.string().uuid().optional(),
});
export type AddAudienceFromSegmentInput = z.infer<typeof addAudienceFromSegmentSchema>;

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const testSendSchema = z.object({
  templateName: z.string().trim().min(1).max(180),
  language: z.string().trim().max(16).default("en"),
  to: z.string().trim().min(5).max(32),
  variables: z.record(z.string(), z.unknown()).default({}),
});
export type TestSendInput = z.infer<typeof testSendSchema>;
