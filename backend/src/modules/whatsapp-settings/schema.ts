import { z } from "zod";

const businessHourSlotSchema = z.object({
  day: z.number().int().min(0).max(6),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

export const updateSettingsSchema = z.object({
  defaultWorkspaceId: z.string().uuid().nullable().optional(),
  autoReplyEnabled: z.boolean().optional(),
  autoReplyBody: z.string().trim().max(4000).nullable().optional(),
  autoReplyOutsideHours: z.boolean().optional(),
  businessHours: z
    .object({
      timezone: z.string().trim().max(80).default("UTC"),
      schedule: z.array(businessHourSlotSchema).max(14).default([]),
    })
    .optional(),
  assignmentStrategy: z.enum(["manual", "round_robin", "least_busy"]).optional(),
  assignmentUserIds: z.array(z.string().uuid()).max(50).optional(),
  maxConcurrentPerAgent: z.number().int().min(1).max(200).optional(),
  unassignedTimeoutMinutes: z.number().int().min(0).max(10080).optional(),
  webhookHealthAlertEnabled: z.boolean().optional(),
  webhookHealthAlertThreshold: z.number().int().min(1).max(100).optional(),
  realtimeTransport: z.enum(["sse", "polling", "websocket"]).optional(),
  defaultPriority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  autoArchiveAfterHours: z.number().int().min(0).max(8760).optional(),
  optInRequiredForCampaigns: z.boolean().optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
