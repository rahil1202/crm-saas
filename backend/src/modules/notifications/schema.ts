import { z } from "zod";

const notificationStatusSchema = z.enum(["all", "read", "unread"]);

export const listNotificationsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  type: z.enum(["lead", "deal", "task", "campaign"]).optional(),
  status: notificationStatusSchema.default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
});

export const previewNotificationsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(3),
});

export const updateNotificationStateSchema = z.object({
  read: z.boolean(),
});

export const notificationParamSchema = z.object({ notificationId: z.string().uuid() });

export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>;
export type PreviewNotificationsQuery = z.infer<typeof previewNotificationsSchema>;
export type UpdateNotificationStateInput = z.infer<typeof updateNotificationStateSchema>;
