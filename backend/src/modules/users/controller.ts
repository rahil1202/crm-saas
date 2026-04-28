import { and, asc, count, desc, eq, ilike, isNull, max, ne } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { authSessions, companyCustomRoles, companyMemberships, leads, profiles, securityAuditLogs, stores, teamMemberAudits } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { recordTeamAudit } from "@/lib/team-audit";
import { membershipParamSchema } from "@/modules/users/schema";
import type { MembershipActivityQuery, MembershipAssignedLeadsQuery, UpdateMembershipInput } from "@/modules/users/schema";

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
      customRoleId: companyMemberships.customRoleId,
      customRoleName: companyCustomRoles.name,
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
    .leftJoin(companyCustomRoles, and(eq(companyCustomRoles.id, companyMemberships.customRoleId), isNull(companyCustomRoles.deletedAt)))
    .where(and(eq(companyMemberships.companyId, tenant.companyId), isNull(companyMemberships.deletedAt)))
    .orderBy(asc(companyMemberships.createdAt));

  const userIds = members.map((member) => member.userId);
  const [loginRows, assignedLeadRows] = await Promise.all([
    userIds.length > 0
      ? db
          .select({ userId: authSessions.userId, lastLoginAt: max(authSessions.lastSeenAt) })
          .from(authSessions)
          .where(and(eq(authSessions.status, "active")))
          .groupBy(authSessions.userId)
      : Promise.resolve([]),
    userIds.length > 0
      ? db
          .select({ userId: leads.assignedToUserId, total: count() })
          .from(leads)
          .where(and(eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)))
          .groupBy(leads.assignedToUserId)
      : Promise.resolve([]),
  ]);

  const loginByUserId = new Map(loginRows.map((row) => [row.userId, row.lastLoginAt]));
  const assignedByUserId = new Map(assignedLeadRows.filter((row) => row.userId != null).map((row) => [row.userId as string, row.total]));

  return ok(c, {
    members: members.map((member) => ({
      ...member,
      lastLoginAt: loginByUserId.get(member.userId) ?? null,
      assignedLeadsCount: assignedByUserId.get(member.userId) ?? 0,
    })),
  });
}

export async function getMembershipDetail(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = membershipParamSchema.parse(c.req.param());

  const [member] = await db
    .select({
      membershipId: companyMemberships.id,
      userId: companyMemberships.userId,
      role: companyMemberships.role,
      customRoleId: companyMemberships.customRoleId,
      customRoleName: companyCustomRoles.name,
      status: companyMemberships.status,
      storeId: companyMemberships.storeId,
      storeName: stores.name,
      email: profiles.email,
      fullName: profiles.fullName,
      createdAt: companyMemberships.createdAt,
      updatedAt: companyMemberships.updatedAt,
    })
    .from(companyMemberships)
    .innerJoin(profiles, eq(profiles.id, companyMemberships.userId))
    .leftJoin(stores, eq(stores.id, companyMemberships.storeId))
    .leftJoin(companyCustomRoles, and(eq(companyCustomRoles.id, companyMemberships.customRoleId), isNull(companyCustomRoles.deletedAt)))
    .where(and(eq(companyMemberships.id, params.membershipId), eq(companyMemberships.companyId, tenant.companyId), isNull(companyMemberships.deletedAt)))
    .limit(1);

  if (!member) {
    throw AppError.notFound("Membership not found");
  }

  const [lastLoginRow, lastTeamActivityRow, lastSecurityActivityRow, leadStatsRow] = await Promise.all([
    db
      .select({ value: max(authSessions.lastSeenAt) })
      .from(authSessions)
      .where(and(eq(authSessions.userId, member.userId), eq(authSessions.status, "active"))),
    db
      .select({ value: max(teamMemberAudits.createdAt) })
      .from(teamMemberAudits)
      .where(and(eq(teamMemberAudits.companyId, tenant.companyId), eq(teamMemberAudits.targetUserId, member.userId))),
    db
      .select({ value: max(securityAuditLogs.createdAt) })
      .from(securityAuditLogs)
      .where(and(eq(securityAuditLogs.companyId, tenant.companyId), eq(securityAuditLogs.userId, member.userId))),
    db
      .select({
        assignedLeads: count(),
      })
      .from(leads)
      .where(and(eq(leads.companyId, tenant.companyId), eq(leads.assignedToUserId, member.userId), isNull(leads.deletedAt))),
  ]);

  const lastActivityAt = lastTeamActivityRow[0]?.value ?? lastSecurityActivityRow[0]?.value ?? null;

  return ok(c, {
    member,
    stats: {
      assignedLeads: leadStatsRow[0]?.assignedLeads ?? 0,
    },
    activity: {
      lastLoginAt: lastLoginRow[0]?.value ?? null,
      lastActivityAt,
    },
  });
}

export async function getMembershipAssignedLeads(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = membershipParamSchema.parse(c.req.param());
  const query = c.get("validatedQuery") as MembershipAssignedLeadsQuery;

  const [member] = await db
    .select({ userId: companyMemberships.userId })
    .from(companyMemberships)
    .where(and(eq(companyMemberships.id, params.membershipId), eq(companyMemberships.companyId, tenant.companyId), isNull(companyMemberships.deletedAt)))
    .limit(1);

  if (!member) {
    throw AppError.notFound("Membership not found");
  }

  const conditions = [
    eq(leads.companyId, tenant.companyId),
    eq(leads.assignedToUserId, member.userId),
    isNull(leads.deletedAt),
  ];

  if (query.status) {
    conditions.push(eq(leads.status, query.status));
  }

  if (query.q) {
    conditions.push(ilike(leads.title, `%${query.q}%`));
  }

  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    db.select().from(leads).where(where).orderBy(desc(leads.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(leads).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function getMembershipActivity(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = membershipParamSchema.parse(c.req.param());
  const query = c.get("validatedQuery") as MembershipActivityQuery;

  const [member] = await db
    .select({ userId: companyMemberships.userId })
    .from(companyMemberships)
    .where(and(eq(companyMemberships.id, params.membershipId), eq(companyMemberships.companyId, tenant.companyId)))
    .limit(1);

  if (!member) {
    throw AppError.notFound("Membership not found");
  }

  const items = await db
    .select({
      id: teamMemberAudits.id,
      eventType: teamMemberAudits.eventType,
      summary: teamMemberAudits.summary,
      metadata: teamMemberAudits.metadata,
      createdAt: teamMemberAudits.createdAt,
      actorUserId: teamMemberAudits.actorUserId,
      actorName: profiles.fullName,
      actorEmail: profiles.email,
    })
    .from(teamMemberAudits)
    .leftJoin(profiles, eq(profiles.id, teamMemberAudits.actorUserId))
    .where(
      and(
        eq(teamMemberAudits.companyId, tenant.companyId),
        eq(teamMemberAudits.targetUserId, member.userId),
      ),
    )
    .orderBy(desc(teamMemberAudits.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  const [totalRow] = await db
    .select({ count: count() })
    .from(teamMemberAudits)
    .where(and(eq(teamMemberAudits.companyId, tenant.companyId), eq(teamMemberAudits.targetUserId, member.userId)));

  return ok(c, {
    items,
    total: totalRow?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function updateMembership(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = membershipParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateMembershipInput;

  if (!body.role && !body.status && body.customRoleId === undefined) {
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
  let nextCustomRoleId = body.customRoleId === undefined ? membership.customRoleId : body.customRoleId;

  if (nextRole !== "member") {
    nextCustomRoleId = null;
  }

  if (nextCustomRoleId) {
    const [customRole] = await db
      .select({ id: companyCustomRoles.id })
      .from(companyCustomRoles)
      .where(and(eq(companyCustomRoles.id, nextCustomRoleId), eq(companyCustomRoles.companyId, tenant.companyId), isNull(companyCustomRoles.deletedAt)))
      .limit(1);

    if (!customRole) {
      throw AppError.badRequest("Invalid custom role selection");
    }
  }

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
      customRoleId: nextCustomRoleId,
      status: nextStatus,
      updatedAt: new Date(),
      deletedAt: null,
    })
    .where(eq(companyMemberships.id, membership.id))
    .returning();

  if (membership.role !== updatedMembership.role) {
    await recordTeamAudit({
      companyId: tenant.companyId,
      actorUserId: user.id,
      membershipId: membership.id,
      targetUserId: membership.userId,
      eventType: "membership.role_changed",
      summary: `Role changed from ${membership.role} to ${updatedMembership.role}`,
      metadata: { from: membership.role, to: updatedMembership.role },
    });
  }

  if ((membership.customRoleId ?? null) !== (updatedMembership.customRoleId ?? null)) {
    await recordTeamAudit({
      companyId: tenant.companyId,
      actorUserId: user.id,
      membershipId: membership.id,
      targetUserId: membership.userId,
      eventType: "membership.custom_role_changed",
      summary: "Custom role assignment updated",
      metadata: { from: membership.customRoleId, to: updatedMembership.customRoleId },
    });
  }

  if (membership.status !== updatedMembership.status) {
    await recordTeamAudit({
      companyId: tenant.companyId,
      actorUserId: user.id,
      membershipId: membership.id,
      targetUserId: membership.userId,
      eventType: updatedMembership.status === "disabled" ? "membership.deactivated" : "membership.reactivated",
      summary: updatedMembership.status === "disabled" ? "Membership deactivated" : "Membership reactivated",
      metadata: { from: membership.status, to: updatedMembership.status },
    });
  }

  return ok(c, {
    membership: updatedMembership,
  });
}

export async function deleteMembership(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = membershipParamSchema.parse(c.req.param());

  const [membership] = await db
    .select()
    .from(companyMemberships)
    .where(and(eq(companyMemberships.id, params.membershipId), eq(companyMemberships.companyId, tenant.companyId), isNull(companyMemberships.deletedAt)))
    .limit(1);

  if (!membership) {
    throw AppError.notFound("Membership not found");
  }

  if (membership.userId === user.id) {
    throw AppError.forbidden("You cannot delete your own membership");
  }

  if (membership.role === "owner") {
    const otherActiveOwnerCount = await countActiveOwners(tenant.companyId, membership.id);
    if (otherActiveOwnerCount === 0) {
      throw AppError.conflict("At least one active owner must remain on the company");
    }
  }

  await db
    .update(companyMemberships)
    .set({
      status: "disabled",
      updatedAt: new Date(),
      deletedAt: new Date(),
    })
    .where(eq(companyMemberships.id, membership.id));

  await recordTeamAudit({
    companyId: tenant.companyId,
    actorUserId: user.id,
    membershipId: membership.id,
    targetUserId: membership.userId,
    eventType: "membership.deleted",
    summary: "Membership deleted",
  });

  return ok(c, {
    membershipId: membership.id,
    deleted: true,
  });
}
