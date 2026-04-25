import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { getDashboardInsights, getReportOverview, getReportSummary } from "@/modules/reports/controller";
import { reportDashboardQuerySchema, reportSummaryQuerySchema } from "@/modules/reports/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateQuery } from "@/middleware/common";

export const reportRoutes = new Hono<AppEnv>().basePath("/reports");
reportRoutes.use("*", requireAuth, requireTenant, requireModuleAccess("reports"));

reportRoutes.get("/", getReportOverview);
reportRoutes.get("/dashboard", validateQuery(reportDashboardQuerySchema), getDashboardInsights);
reportRoutes.get("/summary", validateQuery(reportSummaryQuerySchema), getReportSummary);
