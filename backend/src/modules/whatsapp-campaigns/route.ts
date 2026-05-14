import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { requireAuth, requireModuleAccess, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";
import {
  addAudienceController,
  addAudienceFromSegmentController,
  cancelCampaignController,
  createCampaignController,
  deleteCampaignController,
  duplicateCampaignController,
  getCampaign,
  getCampaignAnalyticsController,
  getCampaignLogs,
  getGlobalAnalyticsController,
  listAudienceController,
  listCampaigns,
  pauseCampaignController,
  startCampaignController,
  testTemplateSend,
  updateCampaignController,
} from "@/modules/whatsapp-campaigns/controller";
import {
  addAudienceFromSegmentSchema,
  addAudienceSchema,
  analyticsQuerySchema,
  createCampaignSchema,
  listCampaignsSchema,
  testSendSchema,
  updateCampaignSchema,
} from "@/modules/whatsapp-campaigns/schema";

export const whatsappCampaignRoutes = new Hono<AppEnv>();
whatsappCampaignRoutes.use("*", requireAuth, requireTenant);

// Campaigns CRUD
whatsappCampaignRoutes.get("/whatsapp/campaigns", requireModuleAccess("whatsapp-campaigns"), validateQuery(listCampaignsSchema), listCampaigns);
whatsappCampaignRoutes.get("/whatsapp/campaigns/:campaignId", requireModuleAccess("whatsapp-campaigns"), getCampaign);
whatsappCampaignRoutes.post("/whatsapp/campaigns", requireModuleAccess("whatsapp-campaigns"), requireRole("admin"), validateJson(createCampaignSchema), createCampaignController);
whatsappCampaignRoutes.patch("/whatsapp/campaigns/:campaignId", requireModuleAccess("whatsapp-campaigns"), requireRole("admin"), validateJson(updateCampaignSchema), updateCampaignController);
whatsappCampaignRoutes.delete("/whatsapp/campaigns/:campaignId", requireModuleAccess("whatsapp-campaigns"), requireRole("admin"), deleteCampaignController);

// Audience
whatsappCampaignRoutes.get("/whatsapp/campaigns/:campaignId/audience", requireModuleAccess("whatsapp-campaigns"), listAudienceController);
whatsappCampaignRoutes.post("/whatsapp/campaigns/:campaignId/audience", requireModuleAccess("whatsapp-campaigns"), requireRole("admin"), validateJson(addAudienceSchema), addAudienceController);
whatsappCampaignRoutes.post("/whatsapp/campaigns/:campaignId/audience/segment", requireModuleAccess("whatsapp-campaigns"), requireRole("admin"), validateJson(addAudienceFromSegmentSchema), addAudienceFromSegmentController);

// Lifecycle
whatsappCampaignRoutes.post("/whatsapp/campaigns/:campaignId/start", requireModuleAccess("whatsapp-campaigns"), requireRole("admin"), startCampaignController);
whatsappCampaignRoutes.post("/whatsapp/campaigns/:campaignId/pause", requireModuleAccess("whatsapp-campaigns"), requireRole("admin"), pauseCampaignController);
whatsappCampaignRoutes.post("/whatsapp/campaigns/:campaignId/cancel", requireModuleAccess("whatsapp-campaigns"), requireRole("admin"), cancelCampaignController);
whatsappCampaignRoutes.post("/whatsapp/campaigns/:campaignId/duplicate", requireModuleAccess("whatsapp-campaigns"), requireRole("admin"), duplicateCampaignController);

// Analytics
whatsappCampaignRoutes.get("/whatsapp/campaigns/:campaignId/analytics", requireModuleAccess("whatsapp-campaigns"), getCampaignAnalyticsController);
whatsappCampaignRoutes.get("/whatsapp/campaigns/:campaignId/logs", requireModuleAccess("whatsapp-campaigns"), getCampaignLogs);
whatsappCampaignRoutes.get("/whatsapp/analytics", requireModuleAccess("whatsapp-analytics"), validateQuery(analyticsQuerySchema), getGlobalAnalyticsController);

// Template test send
whatsappCampaignRoutes.post("/whatsapp/templates/test-send", requireModuleAccess("whatsapp-templates"), requireRole("admin"), validateJson(testSendSchema), testTemplateSend);
