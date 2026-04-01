import { Hono } from "hono";

import { ok } from "@/lib/api";

export const settingRoutes = new Hono().basePath("/settings");

settingRoutes.get("/", (c) =>
  ok(c, {
    module: "settings",
    capabilities: ["pipeline-settings", "custom-fields", "tags", "notification-rules", "integrations"],
  }),
);
