import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  deleteNotification,
  getNotificationOverview,
  listNotifications,
  markAllNotificationsRead,
  markAllNotificationsReadLegacy,
  markNotificationRead,
  previewNotifications,
  streamNotificationEvents,
  updateNotificationState,
} from "@/modules/notifications/controller";
import {
  listNotificationsSchema,
  previewNotificationsSchema,
  updateNotificationStateSchema,
} from "@/modules/notifications/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const notificationRoutes = new Hono<AppEnv>().basePath("/notifications");
notificationRoutes.use("*", requireAuth, requireTenant, requireModuleAccess("notifications"));

notificationRoutes.get("/overview", getNotificationOverview);
notificationRoutes.get("/", validateQuery(listNotificationsSchema), listNotifications);
notificationRoutes.get("/list", validateQuery(listNotificationsSchema), listNotifications);
notificationRoutes.get("/preview", validateQuery(previewNotificationsSchema), previewNotifications);
notificationRoutes.get("/stream", streamNotificationEvents);
notificationRoutes.patch("/read-all", markAllNotificationsRead);
notificationRoutes.post("/mark-all-read", markAllNotificationsReadLegacy);
notificationRoutes.patch("/:notificationId", validateJson(updateNotificationStateSchema), updateNotificationState);
notificationRoutes.post("/:notificationId/read", markNotificationRead);
notificationRoutes.delete("/:notificationId", deleteNotification);
