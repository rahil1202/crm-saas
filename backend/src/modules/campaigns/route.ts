import { Hono } from "hono";

import { getCampaignOverview } from "@/modules/campaigns/controller";

export const campaignRoutes = new Hono().basePath("/campaigns");

campaignRoutes.get("/", getCampaignOverview);
