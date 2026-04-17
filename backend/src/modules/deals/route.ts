import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  bulkUpdateDeals,
  createDeal,
  createDealTimeline,
  deleteDeal,
  getDealHistory,
  getDealForecast,
  getDealsBoard,
  getDealTimeline,
  listDeals,
  updateDeal,
} from "@/modules/deals/controller";
import {
  boardDealsSchema,
  bulkUpdateDealsSchema,
  createDealSchema,
  createDealTimelineSchema,
  dealForecastQuerySchema,
  dealTimelineQuerySchema,
  listDealsSchema,
  updateDealSchema,
} from "@/modules/deals/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const dealRoutes = new Hono<AppEnv>().basePath("/deals");
dealRoutes.use("*", requireAuth, requireTenant, requireModuleAccess("deals"));

dealRoutes.get("/", validateQuery(listDealsSchema), listDeals);
dealRoutes.get("/board", validateQuery(boardDealsSchema), getDealsBoard);
dealRoutes.get("/forecast", validateQuery(dealForecastQuerySchema), getDealForecast);
dealRoutes.get("/:dealId/history", getDealHistory);
dealRoutes.post("/", validateJson(createDealSchema), createDeal);
dealRoutes.post("/bulk-update", validateJson(bulkUpdateDealsSchema), bulkUpdateDeals);
dealRoutes.patch("/:dealId", validateJson(updateDealSchema), updateDeal);
dealRoutes.get("/:dealId/timeline", validateQuery(dealTimelineQuerySchema), getDealTimeline);
dealRoutes.post("/:dealId/timeline", validateJson(createDealTimelineSchema), createDealTimeline);
dealRoutes.delete("/:dealId", deleteDeal);
