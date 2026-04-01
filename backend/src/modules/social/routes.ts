import { Hono } from "hono";

import { ok } from "@/lib/api";

export const socialRoutes = new Hono().basePath("/social");

socialRoutes.get("/", (c) =>
  ok(c, {
    module: "social",
    capabilities: ["connect-accounts", "capture-social-leads", "social-inbox", "assign-social-leads"],
  }),
);
