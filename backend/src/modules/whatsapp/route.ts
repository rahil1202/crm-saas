import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  createWhatsappTemplate,
  createWhatsappWorkspace,
  deleteWhatsappTemplate,
  deleteWhatsappWorkspace,
  getWhatsappOverview,
  getWhatsappTemplates,
  getWhatsappWorkspaces,
  syncWhatsappTemplate,
  updateWhatsappTemplate,
  updateWhatsappWorkspace,
} from "@/modules/whatsapp/controller";
import {
  listWhatsappTemplatesSchema,
  listWhatsappWorkspacesSchema,
  syncWhatsappTemplateSchema,
  updateWhatsappTemplateSchema,
  updateWhatsappWorkspaceSchema,
  whatsappTemplateSchema,
  whatsappWorkspaceSchema,
} from "@/modules/whatsapp/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const whatsappRoutes = new Hono<AppEnv>();
whatsappRoutes.use("*", requireAuth, requireTenant);

whatsappRoutes.get("/whatsapp", getWhatsappOverview);
whatsappRoutes.get("/whatsapp-workspaces", validateQuery(listWhatsappWorkspacesSchema), getWhatsappWorkspaces);
whatsappRoutes.post("/whatsapp-workspaces", requireRole("admin"), validateJson(whatsappWorkspaceSchema), createWhatsappWorkspace);
whatsappRoutes.patch("/whatsapp-workspaces/:workspaceId", requireRole("admin"), validateJson(updateWhatsappWorkspaceSchema), updateWhatsappWorkspace);
whatsappRoutes.delete("/whatsapp-workspaces/:workspaceId", requireRole("admin"), deleteWhatsappWorkspace);
whatsappRoutes.get("/whatsapp-templates", validateQuery(listWhatsappTemplatesSchema), getWhatsappTemplates);
whatsappRoutes.post("/whatsapp-templates", requireRole("admin"), validateJson(whatsappTemplateSchema), createWhatsappTemplate);
whatsappRoutes.patch("/whatsapp-templates/:templateId", requireRole("admin"), validateJson(updateWhatsappTemplateSchema), updateWhatsappTemplate);
whatsappRoutes.post("/whatsapp-templates/:templateId/sync", requireRole("admin"), validateJson(syncWhatsappTemplateSchema), syncWhatsappTemplate);
whatsappRoutes.delete("/whatsapp-templates/:templateId", requireRole("admin"), deleteWhatsappTemplate);
