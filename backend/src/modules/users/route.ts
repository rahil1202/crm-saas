import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { getCurrentCompanyUsers, getUsersOverview, updateMembership } from "@/modules/users/controller";
import { updateMembershipSchema } from "@/modules/users/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";

export const userRoutes = new Hono<AppEnv>().basePath("/users");

userRoutes.get("/", getUsersOverview);
userRoutes.get("/current-company", requireAuth, requireTenant, requireModuleAccess("teams"), getCurrentCompanyUsers);
userRoutes.patch("/memberships/:membershipId", requireAuth, requireTenant, requireModuleAccess("teams"), validateJson(updateMembershipSchema), updateMembership);
