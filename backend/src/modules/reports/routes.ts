import { Hono } from "hono";

import { ok } from "@/lib/api";

export const reportRoutes = new Hono().basePath("/reports");

reportRoutes.get("/", (c) =>
  ok(c, {
    module: "reports",
    capabilities: ["lead-reports", "deal-reports", "revenue-forecast", "partner-performance", "campaign-performance"],
  }),
);
