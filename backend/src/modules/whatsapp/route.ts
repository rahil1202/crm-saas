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
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const whatsappRoutes = new Hono<AppEnv>();
whatsappRoutes.use("*", requireAuth, requireTenant);

whatsappRoutes.get("/whatsapp", getWhatsappOverview);
whatsappRoutes.get("/whatsapp/dashboard/stats", getWhatsappDashboardStats);
whatsappRoutes.get("/whatsapp/dashboard/connections", getWhatsappDashboardConnections);
whatsappRoutes.get(
  "/whatsapp/dashboard/recent-events",
  validateQuery(whatsappDashboardSchemas.recentEventsQuerySchema),
  getWhatsappRecentWebhookEvents,
);
whatsappRoutes.get(
  "/whatsapp/dashboard/recent-activity",
  validateQuery(whatsappDashboardSchemas.recentActivityQuerySchema),
  getWhatsappRecentActivity,
);
whatsappRoutes.get("/whatsapp/onboarding/status", getWhatsappOnboardingStatus);
whatsappRoutes.post("/whatsapp/onboarding/embedded/exchange", requireRole("admin"), validateJson(embeddedSignupExchangeSchema), exchangeWhatsappEmbeddedSignup);
whatsappRoutes.post("/whatsapp/messages", requireRole("admin"), validateJson(sendWhatsappApiMessageSchema), sendWhatsappApiMessage);
whatsappRoutes.get("/whatsapp/messages/:messageId", getWhatsappApiMessage);
whatsappRoutes.get("/whatsapp/conversations/:conversationId/session", getWhatsappConversationSession);
whatsappRoutes.post("/whatsapp/media", requireRole("admin"), validateJson(createWhatsappMediaSchema), createWhatsappMedia);
whatsappRoutes.get("/whatsapp/pricing/rates", validateQuery(listWhatsappPricingRatesSchema), listWhatsappPricingRates);
whatsappRoutes.post("/whatsapp/pricing/estimate", validateJson(whatsappPricingEstimateSchema), estimateWhatsappPricing);
whatsappRoutes.post("/whatsapp/pricing/import-rate-card", requireRole("admin"), validateJson(whatsappPricingImportSchema), importWhatsappPricing);
whatsappRoutes.get("/whatsapp-workspaces", validateQuery(listWhatsappWorkspacesSchema), getWhatsappWorkspaces);
whatsappRoutes.post("/whatsapp-workspaces", requireRole("admin"), validateJson(whatsappWorkspaceSchema), createWhatsappWorkspace);
whatsappRoutes.patch("/whatsapp-workspaces/:workspaceId", requireRole("admin"), validateJson(updateWhatsappWorkspaceSchema), updateWhatsappWorkspace);
whatsappRoutes.delete("/whatsapp-workspaces/:workspaceId", requireRole("admin"), deleteWhatsappWorkspace);
whatsappRoutes.post("/whatsapp/workspaces/:id/sync-meta", requireRole("admin"), syncWhatsappWorkspaceMeta);
whatsappRoutes.post("/whatsapp/workspaces/:id/test-readiness", requireRole("admin"), testWhatsappWorkspaceReadiness);
whatsappRoutes.get("/whatsapp-templates", validateQuery(listWhatsappTemplatesSchema), getWhatsappTemplates);
whatsappRoutes.post("/whatsapp-templates", requireRole("admin"), validateJson(whatsappTemplateSchema), createWhatsappTemplate);
whatsappRoutes.patch("/whatsapp-templates/:templateId", requireRole("admin"), validateJson(updateWhatsappTemplateSchema), updateWhatsappTemplate);
whatsappRoutes.post("/whatsapp-templates/sync", requireRole("admin"), validateJson(syncWhatsappTemplateSchema), syncWhatsappTemplate);
whatsappRoutes.post("/whatsapp-templates/:templateId/submit", requireRole("admin"), validateJson(submitWhatsappTemplateSchema), submitWhatsappTemplate);
whatsappRoutes.post("/whatsapp-templates/:templateId/refresh", requireRole("admin"), validateJson(submitWhatsappTemplateSchema), refreshWhatsappTemplate);
whatsappRoutes.delete("/whatsapp-templates/:templateId", requireRole("admin"), deleteWhatsappTemplate);
