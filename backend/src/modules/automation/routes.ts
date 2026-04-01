import { Hono } from "hono";

import { ok } from "@/lib/api";

export const automationRoutes = new Hono().basePath("/automation");

automationRoutes.get("/", (c) =>
  ok(c, {
    module: "automation",
    capabilities: ["builder", "trigger-conditions", "actions", "multi-step-workflows", "automation-logs"],
  }),
);
