import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  createPartner,
  createPartnerUser,
  deletePartner,
  deletePartnerUser,
  getPartnerDetail,
  getMyPartnerDashboard,
  leaveMyPartnerCompany,
  listPartners,
  listMyPartnerCompanies,
  listPartnerUsers,
  updatePartner,
  updatePartnerUser,
} from "@/modules/partners/controller";
import {
  leavePartnerCompanySchema,
  listPartnersSchema,
  listPartnerUsersSchema,
  partnerSchema,
  partnerUserSchema,
  updatePartnerSchema,
  updatePartnerUserSchema,
} from "@/modules/partners/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const partnerRoutes = new Hono<AppEnv>().basePath("/partners");

partnerRoutes.get("/me/companies", requireAuth, listMyPartnerCompanies);
partnerRoutes.get("/me/dashboard", requireAuth, requireTenant, getMyPartnerDashboard);
partnerRoutes.delete("/me/companies/:companyId", requireAuth, validateJson(leavePartnerCompanySchema), leaveMyPartnerCompany);

partnerRoutes.get("/", requireAuth, requireTenant, requireModuleAccess("partners"), validateQuery(listPartnersSchema), listPartners);
partnerRoutes.get("/users", requireAuth, requireTenant, requireModuleAccess("partners"), validateQuery(listPartnerUsersSchema), listPartnerUsers);
partnerRoutes.get("/:partnerId", requireAuth, requireTenant, requireModuleAccess("partners"), getPartnerDetail);
partnerRoutes.post("/", requireAuth, requireTenant, requireModuleAccess("partners"), validateJson(partnerSchema), createPartner);
partnerRoutes.post("/users", requireAuth, requireTenant, requireModuleAccess("partners"), validateJson(partnerUserSchema), createPartnerUser);
partnerRoutes.patch("/:partnerId", requireAuth, requireTenant, requireModuleAccess("partners"), validateJson(updatePartnerSchema), updatePartner);
partnerRoutes.patch("/users/:partnerUserId", requireAuth, requireTenant, requireModuleAccess("partners"), validateJson(updatePartnerUserSchema), updatePartnerUser);
partnerRoutes.delete("/:partnerId", requireAuth, requireTenant, requireModuleAccess("partners"), deletePartner);
partnerRoutes.delete("/users/:partnerUserId", requireAuth, requireTenant, requireModuleAccess("partners"), deletePartnerUser);
