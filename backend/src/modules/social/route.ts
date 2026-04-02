import { Hono } from "hono";

import { getSocialOverview } from "@/modules/social/controller";

export const socialRoutes = new Hono().basePath("/social");

socialRoutes.get("/", getSocialOverview);
