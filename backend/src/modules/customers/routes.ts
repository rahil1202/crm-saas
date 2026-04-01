import { Hono } from "hono";

import { ok } from "@/lib/api";

export const customerRoutes = new Hono().basePath("/customers");

customerRoutes.get("/", (c) =>
  ok(c, {
    module: "customers",
    capabilities: ["profile", "history", "notes", "attachments", "tags", "custom-fields"],
  }),
);
