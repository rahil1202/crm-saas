import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  createDeal,
  createDealTimeline,
  deleteDeal,
  getDealForecast,
  getDealsBoard,
  getDealTimeline,
  listDeals,
  updateDeal,
} from "@/modules/deals/controller";
import {
  boardDealsSchema,
  createDealSchema,
  createDealTimelineSchema,
  dealForecastQuerySchema,
  dealTimelineQuerySchema,
  listDealsSchema,
  updateDealSchema,
} from "@/modules/deals/schema";
import { requireAuth, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const dealRoutes = new Hono<AppEnv>().basePath("/deals");
dealRoutes.use("*", requireAuth, requireTenant);

dealRoutes.get("/", validateQuery(listDealsSchema), listDeals);
dealRoutes.get("/board", validateQuery(boardDealsSchema), getDealsBoard);
dealRoutes.get("/forecast", validateQuery(dealForecastQuerySchema), getDealForecast);
dealRoutes.post("/", validateJson(createDealSchema), createDeal);
dealRoutes.patch("/:dealId", validateJson(updateDealSchema), updateDeal);
dealRoutes.get("/:dealId/timeline", validateQuery(dealTimelineQuerySchema), getDealTimeline);
dealRoutes.post("/:dealId/timeline", validateJson(createDealTimelineSchema), createDealTimeline);
dealRoutes.delete("/:dealId", deleteDeal);
