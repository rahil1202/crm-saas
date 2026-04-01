import { Hono } from "hono";

import { ok } from "@/lib/api";

export const partnerRoutes = new Hono().basePath("/partners");

partnerRoutes.get("/", (c) =>
  ok(c, {
    module: "partners",
    capabilities: ["partner-companies", "partner-users", "assign-leads", "assign-deals", "performance", "access-control"],
  }),
);
