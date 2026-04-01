import { Hono } from "hono";

import { ok } from "@/lib/api";

export const dealRoutes = new Hono().basePath("/deals");

dealRoutes.get("/", (c) =>
  ok(c, {
    module: "deals",
    capabilities: ["pipeline-board", "multiple-pipelines", "forecast", "won-lost-tracking", "lost-reasons"],
  }),
);
