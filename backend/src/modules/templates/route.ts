import { Hono } from "hono";

import { getTemplateOverview } from "@/modules/templates/controller";

export const templateRoutes = new Hono().basePath("/templates");

templateRoutes.get("/", getTemplateOverview);
