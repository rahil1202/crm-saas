import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { createCampaign, createEmailAccount, deleteCampaign, getCampaignOverview, launchCampaign, listCampaigns, listDeliveryLog, listEmailAccounts, sendTestEmail, updateCampaign } from "@/modules/campaigns/controller";
import { campaignSchema, emailAccountSchema, listCampaignsSchema, listDeliveryLogSchema, testEmailSchema, updateCampaignSchema } from "@/modules/campaigns/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const campaignRoutes = new Hono<AppEnv>().basePath("/campaigns");
campaignRoutes.use("*", requireAuth, requireTenant);

campaignRoutes.get("/", getCampaignOverview);
campaignRoutes.get("/list", validateQuery(listCampaignsSchema), listCampaigns);
campaignRoutes.get("/email-accounts", listEmailAccounts);
campaignRoutes.get("/delivery-log", validateQuery(listDeliveryLogSchema), listDeliveryLog);
campaignRoutes.post("/email-accounts", requireRole("admin"), validateJson(emailAccountSchema), createEmailAccount);
campaignRoutes.post("/test-email", requireRole("admin"), validateJson(testEmailSchema), sendTestEmail);
campaignRoutes.post("/", requireRole("admin"), validateJson(campaignSchema), createCampaign);
campaignRoutes.post("/:campaignId/launch", requireRole("admin"), launchCampaign);
campaignRoutes.patch("/:campaignId", requireRole("admin"), validateJson(updateCampaignSchema), updateCampaign);
campaignRoutes.delete("/:campaignId", requireRole("admin"), deleteCampaign);
