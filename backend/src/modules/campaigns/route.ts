import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { createCampaign, deleteCampaign, getCampaignOverview, listCampaigns, updateCampaign } from "@/modules/campaigns/controller";
import { campaignSchema, listCampaignsSchema, updateCampaignSchema } from "@/modules/campaigns/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const campaignRoutes = new Hono<AppEnv>().basePath("/campaigns");
campaignRoutes.use("*", requireAuth, requireTenant);

campaignRoutes.get("/", getCampaignOverview);
campaignRoutes.get("/list", validateQuery(listCampaignsSchema), listCampaigns);
campaignRoutes.post("/", requireRole("admin"), validateJson(campaignSchema), createCampaign);
campaignRoutes.patch("/:campaignId", requireRole("admin"), validateJson(updateCampaignSchema), updateCampaign);
campaignRoutes.delete("/:campaignId", requireRole("admin"), deleteCampaign);
