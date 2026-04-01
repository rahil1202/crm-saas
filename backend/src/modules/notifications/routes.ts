import { Hono } from "hono";

import { ok } from "@/lib/api";

export const notificationRoutes = new Hono().basePath("/notifications");

notificationRoutes.get("/", (c) =>
  ok(c, {
    module: "notifications",
    capabilities: ["lead-alerts", "task-alerts", "deal-alerts", "campaign-alerts"],
  }),
);
