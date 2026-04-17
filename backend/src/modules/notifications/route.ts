import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { getNotificationOverview, listNotifications, markAllNotificationsRead, markNotificationRead } from "@/modules/notifications/controller";
import { listNotificationsSchema } from "@/modules/notifications/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateQuery } from "@/middleware/common";

export const notificationRoutes = new Hono<AppEnv>().basePath("/notifications");
notificationRoutes.use("*", requireAuth, requireTenant, requireModuleAccess("notifications"));

notificationRoutes.get("/", getNotificationOverview);
notificationRoutes.get("/list", validateQuery(listNotificationsSchema), listNotifications);
notificationRoutes.post("/mark-all-read", markAllNotificationsRead);
notificationRoutes.post("/:notificationId/read", markNotificationRead);
