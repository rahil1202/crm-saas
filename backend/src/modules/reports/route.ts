import { Hono } from "hono";

import { getReportOverview } from "@/modules/reports/controller";

export const reportRoutes = new Hono().basePath("/reports");

reportRoutes.get("/", getReportOverview);
