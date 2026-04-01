import { Hono } from "hono";

import { ok } from "@/lib/api";

export const templateRoutes = new Hono().basePath("/templates");

templateRoutes.get("/", (c) =>
  ok(c, {
    module: "templates",
    capabilities: ["email-templates", "whatsapp-templates", "sms-templates", "task-templates", "pipeline-templates"],
  }),
);
