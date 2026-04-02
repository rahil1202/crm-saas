import { Hono } from "hono";

import { getNotificationOverview } from "@/modules/notifications/controller";

export const notificationRoutes = new Hono().basePath("/notifications");

notificationRoutes.get("/", getNotificationOverview);
