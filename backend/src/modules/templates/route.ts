import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { createTemplate, deleteTemplate, getTemplateOverview, listTemplates, updateTemplate } from "@/modules/templates/controller";
import { listTemplatesSchema, templateSchema, updateTemplateSchema } from "@/modules/templates/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const templateRoutes = new Hono<AppEnv>().basePath("/templates");
templateRoutes.use("*", requireAuth, requireTenant);

templateRoutes.get("/", getTemplateOverview);
templateRoutes.get("/list", validateQuery(listTemplatesSchema), listTemplates);
templateRoutes.post("/", requireRole("admin"), validateJson(templateSchema), createTemplate);
templateRoutes.patch("/:templateId", requireRole("admin"), validateJson(updateTemplateSchema), updateTemplate);
templateRoutes.delete("/:templateId", requireRole("admin"), deleteTemplate);
