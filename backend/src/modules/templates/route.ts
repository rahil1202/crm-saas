import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { createTemplate, deleteTemplate, getTemplateOverview, listTemplates, permanentlyDeleteTemplate, restoreTemplate, updateTemplate } from "@/modules/templates/controller";
import { listTemplatesSchema, templateSchema, updateTemplateSchema } from "@/modules/templates/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const templateRoutes = new Hono<AppEnv>().basePath("/templates");
templateRoutes.use("*", requireAuth, requireTenant, requireModuleAccess("templates"));

templateRoutes.get("/", getTemplateOverview);
templateRoutes.get("/list", validateQuery(listTemplatesSchema), listTemplates);
templateRoutes.post("/", validateJson(templateSchema), createTemplate);
templateRoutes.patch("/:templateId", validateJson(updateTemplateSchema), updateTemplate);
templateRoutes.delete("/:templateId", deleteTemplate);
templateRoutes.post("/:templateId/restore", restoreTemplate);
templateRoutes.delete("/:templateId/permanent", permanentlyDeleteTemplate);
