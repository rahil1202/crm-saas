import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
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
whatsappCampaignRoutes.get("/whatsapp/campaigns", validateQuery(listCampaignsSchema), listCampaigns);
whatsappCampaignRoutes.get("/whatsapp/campaigns/:campaignId", getCampaign);
whatsappCampaignRoutes.post("/whatsapp/campaigns", requireRole("admin"), validateJson(createCampaignSchema), createCampaignController);
whatsappCampaignRoutes.patch("/whatsapp/campaigns/:campaignId", requireRole("admin"), validateJson(updateCampaignSchema), updateCampaignController);
whatsappCampaignRoutes.delete("/whatsapp/campaigns/:campaignId", requireRole("admin"), deleteCampaignController);

// Audience
whatsappCampaignRoutes.get("/whatsapp/campaigns/:campaignId/audience", listAudienceController);
whatsappCampaignRoutes.post("/whatsapp/campaigns/:campaignId/audience", requireRole("admin"), validateJson(addAudienceSchema), addAudienceController);
whatsappCampaignRoutes.post("/whatsapp/campaigns/:campaignId/audience/segment", requireRole("admin"), validateJson(addAudienceFromSegmentSchema), addAudienceFromSegmentController);

// Lifecycle
whatsappCampaignRoutes.post("/whatsapp/campaigns/:campaignId/start", requireRole("admin"), startCampaignController);
whatsappCampaignRoutes.post("/whatsapp/campaigns/:campaignId/pause", requireRole("admin"), pauseCampaignController);
whatsappCampaignRoutes.post("/whatsapp/campaigns/:campaignId/cancel", requireRole("admin"), cancelCampaignController);
whatsappCampaignRoutes.post("/whatsapp/campaigns/:campaignId/duplicate", requireRole("admin"), duplicateCampaignController);

// Analytics
whatsappCampaignRoutes.get("/whatsapp/campaigns/:campaignId/analytics", getCampaignAnalyticsController);
whatsappCampaignRoutes.get("/whatsapp/campaigns/:campaignId/logs", getCampaignLogs);
whatsappCampaignRoutes.get("/whatsapp/analytics", validateQuery(analyticsQuerySchema), getGlobalAnalyticsController);

// Template test send
whatsappCampaignRoutes.post("/whatsapp/templates/test-send", requireRole("admin"), validateJson(testSendSchema), testTemplateSend);
