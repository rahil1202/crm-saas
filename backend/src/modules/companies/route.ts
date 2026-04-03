import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { createStore, getCompaniesOverview, getCurrentCompany, getCurrentCompanyPlan, updateCompanyPlan, updateCurrentCompany, updateStore } from "@/modules/companies/controller";
import { createStoreSchema, updateCompanyPlanSchema, updateCompanySchema, updateStoreSchema } from "@/modules/companies/schema";
import { requireAuth, requireRole, requireSuperAdmin, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";

export const companyRoutes = new Hono<AppEnv>().basePath("/companies");

companyRoutes.get("/", getCompaniesOverview);
companyRoutes.get("/current", requireAuth, requireTenant, getCurrentCompany);
companyRoutes.get("/current/plan", requireAuth, requireTenant, getCurrentCompanyPlan);
companyRoutes.patch("/current", requireAuth, requireTenant, requireRole("admin"), validateJson(updateCompanySchema), updateCurrentCompany);
companyRoutes.post("/stores", requireAuth, requireTenant, requireRole("admin"), validateJson(createStoreSchema), createStore);
companyRoutes.patch("/stores/:storeId", requireAuth, requireTenant, requireRole("admin"), validateJson(updateStoreSchema), updateStore);
companyRoutes.patch("/:companyId/plan", requireAuth, requireSuperAdmin, validateJson(updateCompanyPlanSchema), updateCompanyPlan);
