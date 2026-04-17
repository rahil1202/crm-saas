import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  createCompanyCustomRole,
  deleteCompanyCustomRole,
  listCompanyCustomRoles,
  updateCompanyCustomRole,
} from "@/modules/company-roles/controller";
import { createCustomRoleSchema, updateCustomRoleSchema } from "@/modules/company-roles/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";

export const companyRoleRoutes = new Hono<AppEnv>().basePath("/companies/current/roles");

companyRoleRoutes.get("/", requireAuth, requireTenant, requireModuleAccess("teams"), listCompanyCustomRoles);
companyRoleRoutes.post("/", requireAuth, requireTenant, requireModuleAccess("teams"), validateJson(createCustomRoleSchema), createCompanyCustomRole);
companyRoleRoutes.patch("/:roleId", requireAuth, requireTenant, requireModuleAccess("teams"), validateJson(updateCustomRoleSchema), updateCompanyCustomRole);
companyRoleRoutes.delete("/:roleId", requireAuth, requireTenant, requireModuleAccess("teams"), deleteCompanyCustomRole);
