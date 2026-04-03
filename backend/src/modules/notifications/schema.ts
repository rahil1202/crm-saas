import { z } from "zod";

export const listNotificationsSchema = z.object({
  type: z.enum(["lead", "deal", "task", "campaign"]).optional(),
  unreadOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const notificationParamSchema = z.object({ notificationId: z.string().uuid() });

export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>;
