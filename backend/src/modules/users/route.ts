import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { getCurrentCompanyUsers, getUsersOverview, updateMembership } from "@/modules/users/controller";
import { updateMembershipSchema } from "@/modules/users/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";

export const userRoutes = new Hono<AppEnv>().basePath("/users");

userRoutes.get("/", getUsersOverview);
userRoutes.get("/current-company", requireAuth, requireTenant, requireRole("admin"), getCurrentCompanyUsers);
userRoutes.patch("/memberships/:membershipId", requireAuth, requireTenant, requireRole("admin"), validateJson(updateMembershipSchema), updateMembership);
