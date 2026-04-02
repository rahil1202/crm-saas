import { z } from "zod";

export const campaignStatusSchema = z.enum(["draft", "scheduled", "active", "completed", "paused"]);

export const listCampaignsSchema = z.object({
  q: z.string().trim().optional(),
  status: campaignStatusSchema.optional(),
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

export type CampaignStatus = z.infer<typeof campaignStatusSchema>;
export type ListCampaignsQuery = z.infer<typeof listCampaignsSchema>;
export type CreateCampaignInput = z.infer<typeof campaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
