import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  createWhatsappTemplate,
  createWhatsappMedia,
  createWhatsappWorkspace,
  deleteWhatsappTemplate,
  deleteWhatsappWorkspace,
  estimateWhatsappPricing,
  exchangeWhatsappEmbeddedSignup,
  getWhatsappApiMessage,
  getWhatsappConversationSession,
  getWhatsappOnboardingStatus,
  getWhatsappOverview,
  getWhatsappTemplates,
  getWhatsappWorkspaces,
  importWhatsappPricing,
  listWhatsappPricingRates,
   sendWhatsappApiMessage,
   submitWhatsappTemplate,
   syncWhatsappWorkspaceMeta,
   syncWhatsappTemplate,
   refreshWhatsappTemplate,
  testWhatsappWorkspaceReadiness,
  updateWhatsappTemplate,
  updateWhatsappWorkspace,
} from "@/modules/whatsapp/controller";
import {
  getWhatsappDashboardConnections,
  getWhatsappDashboardStats,
  getWhatsappRecentActivity,
  getWhatsappRecentWebhookEvents,
  whatsappDashboardSchemas,
} from "@/modules/whatsapp/dashboard-controller";
import {
  embeddedSignupExchangeSchema,
  listWhatsappPricingRatesSchema,
  listWhatsappTemplatesSchema,
  listWhatsappWorkspacesSchema,
  createWhatsappMediaSchema,
   sendWhatsappApiMessageSchema,
   submitWhatsappTemplateSchema,
   syncWhatsappTemplateSchema,
  updateWhatsappTemplateSchema,
  updateWhatsappWorkspaceSchema,
  whatsappPricingEstimateSchema,
  whatsappPricingImportSchema,
  whatsappTemplateSchema,
  whatsappWorkspaceSchema,
} from "@/modules/whatsapp/schema";
import { requireAnyModuleAccess, requireAuth, requireModuleAccess, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const whatsappRoutes = new Hono<AppEnv>();
whatsappRoutes.use("*", requireAuth, requireTenant);

whatsappRoutes.get("/whatsapp", requireModuleAccess("whatsapp-crm"), getWhatsappOverview);
whatsappRoutes.get("/whatsapp/dashboard/stats", requireModuleAccess("whatsapp-crm"), getWhatsappDashboardStats);
whatsappRoutes.get("/whatsapp/dashboard/connections", requireAnyModuleAccess(["whatsapp-crm", "whatsapp-integrations", "whatsapp-settings"]), getWhatsappDashboardConnections);
whatsappRoutes.get(
  "/whatsapp/dashboard/recent-events",
  requireModuleAccess("whatsapp-crm"),
  validateQuery(whatsappDashboardSchemas.recentEventsQuerySchema),
  getWhatsappRecentWebhookEvents,
);
whatsappRoutes.get(
  "/whatsapp/dashboard/recent-activity",
  requireModuleAccess("whatsapp-crm"),
  validateQuery(whatsappDashboardSchemas.recentActivityQuerySchema),
  getWhatsappRecentActivity,
);
whatsappRoutes.get("/whatsapp/onboarding/status", requireModuleAccess("whatsapp-integrations"), getWhatsappOnboardingStatus);
whatsappRoutes.post("/whatsapp/onboarding/embedded/exchange", requireModuleAccess("whatsapp-integrations"), requireRole("admin"), validateJson(embeddedSignupExchangeSchema), exchangeWhatsappEmbeddedSignup);
whatsappRoutes.post("/whatsapp/messages", requireModuleAccess("whatsapp-inbox"), requireRole("admin"), validateJson(sendWhatsappApiMessageSchema), sendWhatsappApiMessage);
whatsappRoutes.get("/whatsapp/messages/:messageId", requireModuleAccess("whatsapp-inbox"), getWhatsappApiMessage);
whatsappRoutes.get("/whatsapp/conversations/:conversationId/session", requireModuleAccess("whatsapp-inbox"), getWhatsappConversationSession);
whatsappRoutes.post("/whatsapp/media", requireModuleAccess("whatsapp-inbox"), requireRole("admin"), validateJson(createWhatsappMediaSchema), createWhatsappMedia);
whatsappRoutes.get("/whatsapp/pricing/rates", requireModuleAccess("whatsapp-integrations"), validateQuery(listWhatsappPricingRatesSchema), listWhatsappPricingRates);
whatsappRoutes.post("/whatsapp/pricing/estimate", requireModuleAccess("whatsapp-integrations"), validateJson(whatsappPricingEstimateSchema), estimateWhatsappPricing);
whatsappRoutes.post("/whatsapp/pricing/import-rate-card", requireModuleAccess("whatsapp-integrations"), requireRole("admin"), validateJson(whatsappPricingImportSchema), importWhatsappPricing);
whatsappRoutes.get("/whatsapp-workspaces", requireModuleAccess("whatsapp-integrations"), validateQuery(listWhatsappWorkspacesSchema), getWhatsappWorkspaces);
whatsappRoutes.post("/whatsapp-workspaces", requireModuleAccess("whatsapp-integrations"), requireRole("admin"), validateJson(whatsappWorkspaceSchema), createWhatsappWorkspace);
whatsappRoutes.patch("/whatsapp-workspaces/:workspaceId", requireModuleAccess("whatsapp-integrations"), requireRole("admin"), validateJson(updateWhatsappWorkspaceSchema), updateWhatsappWorkspace);
whatsappRoutes.delete("/whatsapp-workspaces/:workspaceId", requireModuleAccess("whatsapp-integrations"), requireRole("admin"), deleteWhatsappWorkspace);
whatsappRoutes.post("/whatsapp/workspaces/:id/sync-meta", requireAnyModuleAccess(["whatsapp-crm", "whatsapp-integrations"]), requireRole("admin"), syncWhatsappWorkspaceMeta);
whatsappRoutes.post("/whatsapp/workspaces/:id/test-readiness", requireModuleAccess("whatsapp-integrations"), requireRole("admin"), testWhatsappWorkspaceReadiness);
whatsappRoutes.get("/whatsapp-templates", requireAnyModuleAccess(["whatsapp-templates", "whatsapp-campaigns"]), validateQuery(listWhatsappTemplatesSchema), getWhatsappTemplates);
whatsappRoutes.post("/whatsapp-templates", requireModuleAccess("whatsapp-templates"), requireRole("admin"), validateJson(whatsappTemplateSchema), createWhatsappTemplate);
whatsappRoutes.patch("/whatsapp-templates/:templateId", requireModuleAccess("whatsapp-templates"), requireRole("admin"), validateJson(updateWhatsappTemplateSchema), updateWhatsappTemplate);
whatsappRoutes.post("/whatsapp-templates/sync", requireModuleAccess("whatsapp-templates"), requireRole("admin"), validateJson(syncWhatsappTemplateSchema), syncWhatsappTemplate);
whatsappRoutes.post("/whatsapp-templates/:templateId/submit", requireModuleAccess("whatsapp-templates"), requireRole("admin"), validateJson(submitWhatsappTemplateSchema), submitWhatsappTemplate);
whatsappRoutes.post("/whatsapp-templates/:templateId/refresh", requireModuleAccess("whatsapp-templates"), requireRole("admin"), validateJson(submitWhatsappTemplateSchema), refreshWhatsappTemplate);
whatsappRoutes.delete("/whatsapp-templates/:templateId", requireModuleAccess("whatsapp-templates"), requireRole("admin"), deleteWhatsappTemplate);
