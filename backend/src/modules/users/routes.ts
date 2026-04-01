import { Hono } from "hono";

import { ok } from "@/lib/api";

export const userRoutes = new Hono().basePath("/users");

userRoutes.get("/", (c) =>
  ok(c, {
    module: "users",
    capabilities: ["invite-users", "roles", "permissions", "deactivate-users", "activity-tracking"],
  }),
);
