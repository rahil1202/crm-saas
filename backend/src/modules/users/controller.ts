import { and, asc, eq, isNull, ne } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { companyMemberships, profiles, stores } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { membershipParamSchema } from "@/modules/users/schema";
import type { UpdateMembershipInput } from "@/modules/users/schema";

async function countActiveOwners(companyId: string, excludeMembershipId?: string) {
  const filters = [
    eq(companyMemberships.companyId, companyId),
    eq(companyMemberships.role, "owner"),
    eq(companyMemberships.status, "active"),
    isNull(companyMemberships.deletedAt),
  ];

  if (excludeMembershipId) {
    filters.push(ne(companyMemberships.id, excludeMembershipId));
  }

  const owners = await db.select({ id: companyMemberships.id }).from(companyMemberships).where(and(...filters));

  return owners.length;
}

export function getUsersOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "users",
    capabilities: ["invite-users", "roles", "permissions", "deactivate-users", "activity-tracking"],
  });
}

export async function getCurrentCompanyUsers(c: Context<AppEnv>) {
  const tenant = c.get("tenant");

  const members = await db
    .select({
      membershipId: companyMemberships.id,
      userId: companyMemberships.userId,
      role: companyMemberships.role,
      status: companyMemberships.status,
      storeId: companyMemberships.storeId,
      storeName: stores.name,
      email: profiles.email,
      fullName: profiles.fullName,
      createdAt: companyMemberships.createdAt,
    })
    .from(companyMemberships)
    .innerJoin(profiles, eq(profiles.id, companyMemberships.userId))
    .leftJoin(stores, eq(stores.id, companyMemberships.storeId))
    .where(and(eq(companyMemberships.companyId, tenant.companyId), isNull(companyMemberships.deletedAt)))
    .orderBy(asc(companyMemberships.createdAt));

  return ok(c, { members });
}

export async function updateMembership(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = membershipParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateMembershipInput;

  if (!body.role && !body.status) {
    throw AppError.badRequest("At least one membership field must be updated");
  }

  const [membership] = await db
    .select()
    .from(companyMemberships)
    .where(and(eq(companyMemberships.id, params.membershipId), eq(companyMemberships.companyId, tenant.companyId), isNull(companyMemberships.deletedAt)))
    .limit(1);

  if (!membership) {
    throw AppError.notFound("Membership not found");
  }

  if (membership.userId === user.id) {
    throw AppError.forbidden("Use your own account settings for personal changes");
  }

  const nextRole = body.role ?? membership.role;
  const nextStatus = body.status ?? membership.status;

  if ((membership.role === "owner" && nextRole !== "owner") || (membership.role === "owner" && nextStatus !== "active")) {
    const otherActiveOwnerCount = await countActiveOwners(tenant.companyId, membership.id);
    if (otherActiveOwnerCount === 0) {
      throw AppError.conflict("At least one active owner must remain on the company");
    }
  }

  const [updatedMembership] = await db
    .update(companyMemberships)
    .set({
      role: nextRole,
      status: nextStatus,
      updatedAt: new Date(),
      deletedAt: null,
    })
    .where(eq(companyMemberships.id, membership.id))
    .returning();

  return ok(c, {
    membership: updatedMembership,
  });
}
