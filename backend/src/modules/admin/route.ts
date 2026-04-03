import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { getAdminSummary, listAdminCompanies } from "@/modules/admin/controller";
import { listAdminCompaniesSchema } from "@/modules/admin/schema";
import { requireAuth, requireSuperAdmin } from "@/middleware/auth";
import { validateQuery } from "@/middleware/common";

export const adminRoutes = new Hono<AppEnv>().basePath("/admin");

adminRoutes.use("*", requireAuth, requireSuperAdmin);
adminRoutes.get("/summary", getAdminSummary);
adminRoutes.get("/companies", validateQuery(listAdminCompaniesSchema), listAdminCompanies);
