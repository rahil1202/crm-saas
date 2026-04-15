import { z } from "zod";

export const campaignStatusSchema = z.enum(["draft", "scheduled", "active", "completed", "paused"]);

export const listCampaignsSchema = z.object({
  q: z.string().trim().optional(),
  status: campaignStatusSchema.optional(),
  createdBy: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const campaignSchema = z.object({
  name: z.string().trim().min(2).max(180),
  channel: z.string().trim().min(2).max(40).default("email"),
  status: campaignStatusSchema.default("draft"),
  customerIds: z.array(z.string().uuid()).max(200).default([]),
  audienceDescription: z.string().trim().max(240).optional(),
  scheduledAt: z.string().datetime().optional(),
  launchedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  sentCount: z.number().int().min(0).default(0),
  deliveredCount: z.number().int().min(0).default(0),
  openedCount: z.number().int().min(0).default(0),
  clickedCount: z.number().int().min(0).default(0),
  notes: z.string().trim().max(4000).optional(),
});

export const updateCampaignSchema = campaignSchema.partial();
export const campaignParamSchema = z.object({ campaignId: z.string().uuid() });
export const emailAccountSchema = z.object({
  label: z.string().trim().min(1).max(180),
  provider: z.string().trim().min(1).max(80).default("resend"),
  fromName: z.string().trim().max(180).optional(),
  fromEmail: z.string().trim().email(),
  isDefault: z.boolean().default(false),
  credentials: z.record(z.string(), z.unknown()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export const listEmailAccountsSchema = z.object({});
export const listDeliveryLogSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const emailReplyWebhookSchema = z.object({
  trackingToken: z.string().trim().optional(),
  providerMessageId: z.string().trim().optional(),
  fromEmail: z.string().trim().email(),
  body: z.string().trim().min(1).max(10000),
});
export const testEmailSchema = z.object({
  recipientEmail: z.string().trim().email(),
  recipientName: z.string().trim().max(180).optional(),
  subject: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(10000),
});

export type CampaignStatus = z.infer<typeof campaignStatusSchema>;
export type ListCampaignsQuery = z.infer<typeof listCampaignsSchema>;
export type CreateCampaignInput = z.infer<typeof campaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type CreateEmailAccountInput = z.infer<typeof emailAccountSchema>;
export type EmailReplyWebhookInput = z.infer<typeof emailReplyWebhookSchema>;
export type TestEmailInput = z.infer<typeof testEmailSchema>;
export type ListDeliveryLogQuery = z.infer<typeof listDeliveryLogSchema>;
