import { Hono } from "hono";

import { ok } from "@/lib/api";

export const campaignRoutes = new Hono().basePath("/campaigns");

campaignRoutes.get("/", (c) =>
  ok(c, {
    module: "campaigns",
    capabilities: ["create-campaign", "audience-selection", "email-campaigns", "scheduling", "analytics"],
  }),
);
