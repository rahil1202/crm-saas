import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { createCampaign, createEmailAccount, deleteCampaign, getCampaignOverview, launchCampaign, listCampaigns, listDeliveryLog, listEmailAccounts, sendTestEmail, updateCampaign } from "@/modules/campaigns/controller";
import { campaignSchema, emailAccountSchema, listCampaignsSchema, listDeliveryLogSchema, testEmailSchema, updateCampaignSchema } from "@/modules/campaigns/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";
import { enforceBodyLimit, rateLimit } from "@/middleware/security";
import { bodyLimits, routePolicies } from "@/lib/security";

export const campaignRoutes = new Hono<AppEnv>().basePath("/campaigns");
campaignRoutes.use("*", requireAuth, requireTenant);

campaignRoutes.get("/", getCampaignOverview);
campaignRoutes.get("/list", validateQuery(listCampaignsSchema), listCampaigns);
campaignRoutes.get("/email-accounts", listEmailAccounts);
campaignRoutes.get("/delivery-log", validateQuery(listDeliveryLogSchema), listDeliveryLog);
campaignRoutes.post("/email-accounts", requireRole("admin"), rateLimit(routePolicies.adminSensitive), enforceBodyLimit(bodyLimits.tenantDefault), validateJson(emailAccountSchema), createEmailAccount);
campaignRoutes.post("/test-email", requireRole("admin"), rateLimit(routePolicies.sendMessage), enforceBodyLimit(bodyLimits.tenantDefault), validateJson(testEmailSchema), sendTestEmail);
campaignRoutes.post("/", requireRole("admin"), rateLimit(routePolicies.adminSensitive), enforceBodyLimit(bodyLimits.tenantDefault), validateJson(campaignSchema), createCampaign);
campaignRoutes.post("/:campaignId/launch", requireRole("admin"), rateLimit(routePolicies.adminSensitive), launchCampaign);
campaignRoutes.patch("/:campaignId", requireRole("admin"), rateLimit(routePolicies.adminSensitive), enforceBodyLimit(bodyLimits.tenantDefault), validateJson(updateCampaignSchema), updateCampaign);
campaignRoutes.delete("/:campaignId", requireRole("admin"), deleteCampaign);
