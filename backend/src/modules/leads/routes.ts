import { Hono } from "hono";

import { ok } from "@/lib/api";

export const leadRoutes = new Hono().basePath("/leads");

leadRoutes.get("/", (c) =>
  ok(c, {
    module: "leads",
    capabilities: [
      "lead-list",
      "kanban",
      "lead-import",
      "assignment",
      "partner-assignment",
      "lead-scoring",
      "convert-to-deal",
    ],
  }),
);
