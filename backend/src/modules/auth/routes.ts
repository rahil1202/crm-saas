import { Hono } from "hono";

import { ok } from "@/lib/api";

export const authRoutes = new Hono().basePath("/auth");

authRoutes.get("/status", (c) =>
  ok(c, {
    module: "auth",
    capabilities: ["signup", "login", "password-reset", "invite-acceptance"],
  }),
);
