import { Hono } from "hono";

import { ok } from "@/lib/api";

export const companyRoutes = new Hono().basePath("/companies");

companyRoutes.get("/", (c) =>
  ok(c, {
    module: "companies",
    capabilities: ["company-profile", "branches", "branding", "lead-sources", "default-pipeline"],
  }),
);
