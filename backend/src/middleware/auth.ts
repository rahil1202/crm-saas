import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { companyCustomRoles, companyMemberships, profiles, superAdmins } from "@/db/schema";
import { verifyAccessToken } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ensurePartnerMembershipAssignmentsForUser } from "@/lib/partner-role-access";
import { requireActiveAuthSession } from "@/lib/security";
import { hasMinimumRole } from "@/middleware/roles";
import type { CompanyModuleKey, CompanyRole } from "@/types/app";

const ACCESS_COOKIE = "crm_access_token";

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const authorization = c.req.header("authorization");
  const bearerToken = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
  const cookieToken = getCookie(c, ACCESS_COOKIE) ?? null;
  const token = bearerToken ?? cookieToken;

  if (!token) {
    throw AppError.unauthorized("Missing access token");
  }

  const verified = await verifyAccessToken(token);
  await requireActiveAuthSession({
    sessionId: verified.sessionId,
    userId: verified.userId,
  });

  if (verified.email) {
    await db
      .insert(profiles)
      .values({
        id: verified.userId,
        email: verified.email,
      })
      .onConflictDoUpdate({
        target: profiles.id,
        set: {
          email: verified.email,
          updatedAt: new Date(),
        },
      });
  }

  c.set("user", {
    id: verified.userId,
    email: verified.email,
    sessionId: verified.sessionId,
    isSuperAdmin: false,
  });

  const [admin] = await db
    .select({ id: superAdmins.id })
    .from(superAdmins)
    .where(and(eq(superAdmins.userId, verified.userId), eq(superAdmins.isActive, true)))
    .limit(1);

  if (admin) {
    c.set("user", {
      id: verified.userId,
      email: verified.email,
      sessionId: verified.sessionId,
      isSuperAdmin: true,
    });
  }

  await next();
};

export const requireTenant: MiddlewareHandler = async (c, next) => {
  const user = c.get("user");
  if (!user) {
    throw AppError.unauthorized();
  }

  const requestedCompanyId = c.req.header("x-company-id") ?? c.req.query("companyId") ?? null;
  const requestedStoreId = c.req.header("x-store-id") ?? c.req.query("storeId") ?? null;

  await ensurePartnerMembershipAssignmentsForUser(user.id, requestedCompanyId);

  const memberships = await db
    .select({
      id: companyMemberships.id,
      companyId: companyMemberships.companyId,
      role: companyMemberships.role,
      storeId: companyMemberships.storeId,
      customRoleId: companyMemberships.customRoleId,
      customRoleModules: companyCustomRoles.modules,
    })
    .from(companyMemberships)
    .leftJoin(
      companyCustomRoles,
      and(eq(companyCustomRoles.id, companyMemberships.customRoleId), isNull(companyCustomRoles.deletedAt)),
    )
    .where(and(eq(companyMemberships.userId, user.id), eq(companyMemberships.status, "active"), isNull(companyMemberships.deletedAt)))
    .orderBy(asc(companyMemberships.createdAt));

  if (memberships.length === 0) {
    throw AppError.forbidden("No active company memberships found");
  }

  const membership = requestedCompanyId
    ? memberships.find((item) => item.companyId === requestedCompanyId)
    : memberships[0];

  if (!membership) {
    throw AppError.forbidden("Membership does not exist for requested company");
  }

  c.set("tenant", {
    companyId: membership.companyId,
    membershipId: membership.id,
    role: membership.role,
    storeId: requestedStoreId ?? membership.storeId,
    customRoleId: membership.customRoleId,
    customRoleModules: Array.isArray(membership.customRoleModules)
      ? (membership.customRoleModules as CompanyModuleKey[])
      : [],
  });

  await next();
};

export const requireModuleAccess = (moduleKey: CompanyModuleKey): MiddlewareHandler => {
  return async (c, next) => {
    const tenant = c.get("tenant");
    if (!tenant) {
      throw AppError.forbidden("Missing tenant context");
    }

    if (tenant.role === "owner" || tenant.role === "admin") {
      await next();
      return;
    }

    if (!tenant.customRoleId) {
      await next();
      return;
    }

    if (!tenant.customRoleModules.includes(moduleKey)) {
      throw AppError.forbidden(`Your custom role does not allow access to ${moduleKey}`);
    }

    await next();
  };
};

export const requireRole = (minimumRole: CompanyRole): MiddlewareHandler => {
  return async (c, next) => {
    const tenant = c.get("tenant") as { role: CompanyRole } | undefined;
    if (!tenant) {
      throw AppError.forbidden("Missing tenant context");
    }

    if (!hasMinimumRole(tenant.role, minimumRole)) {
      throw AppError.forbidden(`This route requires ${minimumRole} role`);
    }

    await next();
  };
};

export const requireSuperAdmin: MiddlewareHandler = async (c, next) => {
  const user = c.get("user");
  if (!user?.isSuperAdmin) {
    throw AppError.forbidden("This route requires super-admin access");
  }

  await next();
};
