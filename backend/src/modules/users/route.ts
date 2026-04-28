import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  deleteMembership,
  getCurrentCompanyUsers,
  getMembershipActivity,
  getMembershipAssignedLeads,
  getMembershipDetail,
  getUsersOverview,
  updateMembership,
} from "@/modules/users/controller";
import { membershipActivityQuerySchema, membershipAssignedLeadsQuerySchema, updateMembershipSchema } from "@/modules/users/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const userRoutes = new Hono<AppEnv>().basePath("/users");

userRoutes.get("/", getUsersOverview);
userRoutes.get("/current-company", requireAuth, requireTenant, requireModuleAccess("teams"), getCurrentCompanyUsers);
userRoutes.get("/memberships/:membershipId", requireAuth, requireTenant, requireModuleAccess("teams"), getMembershipDetail);
userRoutes.get(
  "/memberships/:membershipId/activity",
  requireAuth,
  requireTenant,
  requireModuleAccess("teams"),
  validateQuery(membershipActivityQuerySchema),
  getMembershipActivity,
);
userRoutes.get(
  "/memberships/:membershipId/assigned-leads",
  requireAuth,
  requireTenant,
  requireModuleAccess("teams"),
  validateQuery(membershipAssignedLeadsQuerySchema),
  getMembershipAssignedLeads,
);
userRoutes.patch("/memberships/:membershipId", requireAuth, requireTenant, requireModuleAccess("teams"), validateJson(updateMembershipSchema), updateMembership);
userRoutes.delete("/memberships/:membershipId", requireAuth, requireTenant, requireModuleAccess("teams"), deleteMembership);
