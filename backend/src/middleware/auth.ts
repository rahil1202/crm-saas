import type { MiddlewareHandler } from "hono";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { companyMemberships, profiles } from "@/db/schema";
import { verifySupabaseAccessToken } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { hasMinimumRole } from "@/middleware/roles";
import type { CompanyRole } from "@/types/app";

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const authorization = c.req.header("authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw AppError.unauthorized("Missing bearer token");
  }

  const token = authorization.slice("Bearer ".length);
  const verified = await verifySupabaseAccessToken(token);

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
    rawToken: verified.rawToken,
  });

  await next();
};

export const requireTenant: MiddlewareHandler = async (c, next) => {
  const user = c.get("user");
  if (!user) {
    throw AppError.unauthorized();
  }

  const requestedCompanyId = c.req.header("x-company-id") ?? c.req.query("companyId") ?? null;
  const requestedStoreId = c.req.header("x-store-id") ?? c.req.query("storeId") ?? null;

  const memberships = await db
    .select()
    .from(companyMemberships)
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
  });

  await next();
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
