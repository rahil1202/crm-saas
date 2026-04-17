import { and, count, desc, eq, ilike, isNotNull, isNull, or } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import {
  companies,
  companyCustomRoles,
  companyMemberships,
  companyPlans,
  deals,
  leads,
  partnerCompanies,
  partnerUsers,
  profiles,
  stores,
} from "@/db/schema";
import { assertPasswordPolicy, createManagedSupabaseUser, findManagedSupabaseUserByEmail, updateManagedSupabaseUser } from "@/lib/auth";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { leavePartnerCompanySchema, partnerCompanyParamSchema, partnerParamSchema, partnerUserParamSchema } from "@/modules/partners/schema";
import type {
  CreatePartnerInput,
  CreatePartnerUserInput,
  LeavePartnerCompanyInput,
  ListPartnersQuery,
  ListPartnerUsersQuery,
  UpdatePartnerInput,
  UpdatePartnerUserInput,
} from "@/modules/partners/schema";
import type { CompanyModuleKey } from "@/types/app";

const partnerRoleModules: CompanyModuleKey[] = ["contacts", "leads", "deals", "documents", "reports"];

async function ensurePartnerCustomRole(companyId: string, createdBy: string) {
  const [existing] = await db
    .select({ id: companyCustomRoles.id })
    .from(companyCustomRoles)
    .where(and(eq(companyCustomRoles.companyId, companyId), eq(companyCustomRoles.name, "Partner"), isNull(companyCustomRoles.deletedAt)))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(companyCustomRoles)
    .values({
      companyId,
      name: "Partner",
      modules: partnerRoleModules,
      createdBy,
    })
    .returning({ id: companyCustomRoles.id });

  return created.id;
}

async function upsertPartnerAccess(input: {
  companyId: string;
  partnerCompanyId: string;
  authUserId: string;
  email: string;
  fullName: string;
  phone?: string | null;
  status: "active" | "inactive";
  createdBy: string;
}) {
  const partnerRoleId = await ensurePartnerCustomRole(input.companyId, input.createdBy);

  await db
    .insert(profiles)
    .values({
      id: input.authUserId,
      email: input.email,
      fullName: input.fullName,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        email: input.email,
        fullName: input.fullName,
        updatedAt: new Date(),
      },
    });

  const [existingPartnerAccess] = await db
    .select({
      id: partnerUsers.id,
      partnerCompanyId: partnerUsers.partnerCompanyId,
    })
    .from(partnerUsers)
    .where(
      and(
        eq(partnerUsers.companyId, input.companyId),
        eq(partnerUsers.authUserId, input.authUserId),
        isNull(partnerUsers.deletedAt),
      ),
    )
    .limit(1);

  if (existingPartnerAccess && existingPartnerAccess.partnerCompanyId !== input.partnerCompanyId) {
    throw AppError.conflict("This login is already linked to another partner company in the selected company");
  }

  await db
    .insert(companyMemberships)
    .values({
      companyId: input.companyId,
      userId: input.authUserId,
      role: "member",
      customRoleId: partnerRoleId,
      status: input.status === "active" ? "active" : "disabled",
    })
    .onConflictDoUpdate({
      target: [companyMemberships.companyId, companyMemberships.userId],
      set: {
        role: "member",
        customRoleId: partnerRoleId,
        status: input.status === "active" ? "active" : "disabled",
        deletedAt: null,
        updatedAt: new Date(),
      },
    });

  if (existingPartnerAccess) {
    await db
      .update(partnerUsers)
      .set({
        partnerCompanyId: input.partnerCompanyId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone ?? null,
        status: input.status,
        updatedAt: new Date(),
        deletedAt: null,
      })
      .where(eq(partnerUsers.id, existingPartnerAccess.id));
    return;
  }

  await db.insert(partnerUsers).values({
    companyId: input.companyId,
    partnerCompanyId: input.partnerCompanyId,
    authUserId: input.authUserId,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone ?? null,
    title: "Primary Partner Login",
    status: input.status,
    accessLevel: "standard",
    permissions: {
      leads: true,
      deals: true,
      reports: true,
      documents: true,
    },
    createdBy: input.createdBy,
  });
}

export async function listMyPartnerCompanies(c: Context<AppEnv>) {
  const user = c.get("user");

  const items = await db
    .select({
      companyId: companies.id,
      companyName: companies.name,
      timezone: companies.timezone,
      currency: companies.currency,
      membershipId: companyMemberships.id,
      role: companyMemberships.role,
      storeId: companyMemberships.storeId,
      storeName: stores.name,
      partnerCompanyId: partnerCompanies.id,
      partnerCompanyName: partnerCompanies.name,
      partnerStatus: partnerUsers.status,
      partnerContactName: partnerCompanies.contactName,
      partnerEmail: partnerCompanies.email,
      partnerPhone: partnerCompanies.phone,
      linkedAt: partnerUsers.createdAt,
      lastAccessAt: partnerUsers.lastAccessAt,
      planName: companyPlans.planName,
      planStatus: companyPlans.status,
    })
    .from(partnerUsers)
    .innerJoin(
      partnerCompanies,
      and(eq(partnerCompanies.id, partnerUsers.partnerCompanyId), isNull(partnerCompanies.deletedAt)),
    )
    .innerJoin(companies, and(eq(companies.id, partnerUsers.companyId), isNull(companies.deletedAt)))
    .innerJoin(
      companyMemberships,
      and(
        eq(companyMemberships.companyId, partnerUsers.companyId),
        eq(companyMemberships.userId, user.id),
        eq(companyMemberships.status, "active"),
        isNull(companyMemberships.deletedAt),
      ),
    )
    .leftJoin(stores, eq(stores.id, companyMemberships.storeId))
    .leftJoin(companyPlans, eq(companyPlans.companyId, companies.id))
    .where(
      and(
        eq(partnerUsers.authUserId, user.id),
        eq(partnerUsers.status, "active"),
        isNull(partnerUsers.deletedAt),
        isNotNull(partnerUsers.authUserId),
      ),
    )
    .orderBy(partnerCompanies.name);

  if (items.length === 0) {
    throw AppError.forbidden("No partner companies found for the authenticated user");
  }

  return ok(c, { items });
}

export async function leaveMyPartnerCompany(c: Context<AppEnv>) {
  const user = c.get("user");
  const params = partnerCompanyParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as LeavePartnerCompanyInput;

  leavePartnerCompanySchema.parse(body);

  const activeLinks = await db
    .select({
      companyId: partnerUsers.companyId,
      partnerUserId: partnerUsers.id,
      membershipId: companyMemberships.id,
    })
    .from(partnerUsers)
    .innerJoin(
      companyMemberships,
      and(
        eq(companyMemberships.companyId, partnerUsers.companyId),
        eq(companyMemberships.userId, user.id),
        eq(companyMemberships.status, "active"),
        isNull(companyMemberships.deletedAt),
      ),
    )
    .where(
      and(
        eq(partnerUsers.authUserId, user.id),
        eq(partnerUsers.status, "active"),
        isNull(partnerUsers.deletedAt),
      ),
    );

  const targetLink = activeLinks.find((item) => item.companyId === params.companyId);
  if (!targetLink) {
    throw AppError.notFound("Partner company access not found");
  }

  if (activeLinks.length <= 1) {
    throw AppError.conflict("You cannot leave your last remaining partner company");
  }

  await db
    .update(partnerUsers)
    .set({
      status: "inactive",
      updatedAt: new Date(),
      deletedAt: new Date(),
    })
    .where(eq(partnerUsers.id, targetLink.partnerUserId));

  await db
    .update(companyMemberships)
    .set({
      status: "disabled",
      updatedAt: new Date(),
      deletedAt: new Date(),
    })
    .where(eq(companyMemberships.id, targetLink.membershipId));

  return ok(c, {
    removed: true,
    companyId: targetLink.companyId,
    remainingCompanyIds: activeLinks.filter((item) => item.companyId !== targetLink.companyId).map((item) => item.companyId),
  });
}

export async function listPartners(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListPartnersQuery;

  const conditions = [eq(partnerCompanies.companyId, tenant.companyId), isNull(partnerCompanies.deletedAt)];
  if (query.q) {
    conditions.push(
      or(
        ilike(partnerCompanies.name, `%${query.q}%`),
        ilike(partnerCompanies.contactName, `%${query.q}%`),
        ilike(partnerCompanies.email, `%${query.q}%`),
        ilike(partnerCompanies.phone, `%${query.q}%`),
      )!,
    );
  }
  if (query.status) {
    conditions.push(eq(partnerCompanies.status, query.status));
  }
  if (query.createdBy) {
    conditions.push(eq(partnerCompanies.createdBy, query.createdBy));
  }

  const where = and(...conditions);
  const [items, totalRows] = await Promise.all([
    db.select().from(partnerCompanies).where(where).orderBy(desc(partnerCompanies.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(partnerCompanies).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function createPartner(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreatePartnerInput;

  let notes = body.notes ?? null;
  let managedUserId: string | null = null;

  if (body.email && !body.contactName) {
    throw AppError.badRequest("Contact person is required when creating a partner login");
  }

  if (body.email && body.contactName) {
    const existingManagedUser = await findManagedSupabaseUserByEmail(body.email);

    if (existingManagedUser) {
      managedUserId = existingManagedUser.userId;
    } else {
      if (!body.password) {
        throw AppError.badRequest("Password is required when creating a new partner login");
      }

      assertPasswordPolicy(body.password, {
        email: body.email,
        fullName: body.contactName,
      });

      const managedUser = await createManagedSupabaseUser({
        email: body.email,
        password: body.password,
        fullName: body.contactName,
        emailConfirm: true,
      });
      managedUserId = managedUser.userId;
    }
  }

  const [created] = await db
    .insert(partnerCompanies)
    .values({
      companyId: tenant.companyId,
      name: body.name,
      contactName: body.contactName ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      notes,
      status: body.status,
      createdBy: user.id,
    })
    .returning();

  if (managedUserId && body.email && body.contactName) {
    await upsertPartnerAccess({
      companyId: tenant.companyId,
      partnerCompanyId: created.id,
      authUserId: managedUserId,
      email: body.email,
      fullName: body.contactName,
      phone: body.phone ?? null,
      status: body.status,
      createdBy: user.id,
    });
  }

  return ok(c, created, 201);
}

export async function listPartnerUsers(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListPartnerUsersQuery;

  const conditions = [eq(partnerUsers.companyId, tenant.companyId), isNull(partnerUsers.deletedAt)];
  if (query.partnerCompanyId) {
    conditions.push(eq(partnerUsers.partnerCompanyId, query.partnerCompanyId));
  }
  if (query.status) {
    conditions.push(eq(partnerUsers.status, query.status));
  }

  const where = and(...conditions);
  const [items, totalRows] = await Promise.all([
    db.select().from(partnerUsers).where(where).orderBy(desc(partnerUsers.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(partnerUsers).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function getPartnerDetail(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = partnerParamSchema.parse(c.req.param());

  const [partnerRow] = await db
    .select({
      partner: partnerCompanies,
      creator: {
        id: profiles.id,
        fullName: profiles.fullName,
        email: profiles.email,
      },
    })
    .from(partnerCompanies)
    .leftJoin(profiles, eq(partnerCompanies.createdBy, profiles.id))
    .where(
      and(
        eq(partnerCompanies.id, params.partnerId),
        eq(partnerCompanies.companyId, tenant.companyId),
        isNull(partnerCompanies.deletedAt),
      ),
    )
    .limit(1);

  if (!partnerRow) {
    throw AppError.notFound("Partner not found");
  }

  const partnerId = partnerRow.partner.id;

  const [
    users,
    recentLeads,
    recentDeals,
    activeUsersRows,
    managerUsersRows,
    leadCountRows,
    openDealRows,
    wonDealRows,
  ] = await Promise.all([
    db
      .select()
      .from(partnerUsers)
      .where(and(eq(partnerUsers.companyId, tenant.companyId), eq(partnerUsers.partnerCompanyId, partnerId), isNull(partnerUsers.deletedAt)))
      .orderBy(desc(partnerUsers.createdAt)),
    db
      .select({
        id: leads.id,
        title: leads.title,
        fullName: leads.fullName,
        email: leads.email,
        phone: leads.phone,
        status: leads.status,
        score: leads.score,
        createdAt: leads.createdAt,
      })
      .from(leads)
      .where(and(eq(leads.companyId, tenant.companyId), eq(leads.partnerCompanyId, partnerId), isNull(leads.deletedAt)))
      .orderBy(desc(leads.createdAt))
      .limit(6),
    db
      .select({
        id: deals.id,
        title: deals.title,
        stage: deals.stage,
        status: deals.status,
        value: deals.value,
        createdAt: deals.createdAt,
      })
      .from(deals)
      .where(and(eq(deals.companyId, tenant.companyId), eq(deals.partnerCompanyId, partnerId), isNull(deals.deletedAt)))
      .orderBy(desc(deals.createdAt))
      .limit(6),
    db
      .select({ count: count() })
      .from(partnerUsers)
      .where(
        and(
          eq(partnerUsers.companyId, tenant.companyId),
          eq(partnerUsers.partnerCompanyId, partnerId),
          eq(partnerUsers.status, "active"),
          isNull(partnerUsers.deletedAt),
        ),
      ),
    db
      .select({ count: count() })
      .from(partnerUsers)
      .where(
        and(
          eq(partnerUsers.companyId, tenant.companyId),
          eq(partnerUsers.partnerCompanyId, partnerId),
          eq(partnerUsers.accessLevel, "manager"),
          isNull(partnerUsers.deletedAt),
        ),
      ),
    db
      .select({ count: count() })
      .from(leads)
      .where(and(eq(leads.companyId, tenant.companyId), eq(leads.partnerCompanyId, partnerId), isNull(leads.deletedAt))),
    db
      .select({ count: count() })
      .from(deals)
      .where(
        and(
          eq(deals.companyId, tenant.companyId),
          eq(deals.partnerCompanyId, partnerId),
          eq(deals.status, "open"),
          isNull(deals.deletedAt),
        ),
      ),
    db
      .select({ count: count() })
      .from(deals)
      .where(
        and(
          eq(deals.companyId, tenant.companyId),
          eq(deals.partnerCompanyId, partnerId),
          eq(deals.status, "won"),
          isNull(deals.deletedAt),
        ),
      ),
  ]);

  const lastLoginAt = users.reduce<string | null>((latest, user) => {
    if (!user.lastAccessAt) {
      return latest;
    }
    if (!latest) {
      return user.lastAccessAt.toISOString();
    }
    return new Date(user.lastAccessAt).getTime() > new Date(latest).getTime()
      ? user.lastAccessAt.toISOString()
      : latest;
  }, null);

  return ok(c, {
    partner: partnerRow.partner,
    creator: partnerRow.creator && partnerRow.creator.id ? partnerRow.creator : null,
    users,
    recentLeads,
    recentDeals,
    summary: {
      assignedLeads: leadCountRows[0]?.count ?? 0,
      activeUsers: activeUsersRows[0]?.count ?? 0,
      managerUsers: managerUsersRows[0]?.count ?? 0,
      openDeals: openDealRows[0]?.count ?? 0,
      wonDeals: wonDealRows[0]?.count ?? 0,
      lastLoginAt,
    },
  });
}

export async function createPartnerUser(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreatePartnerUserInput;

  const [partner] = await db
    .select({ id: partnerCompanies.id })
    .from(partnerCompanies)
    .where(and(eq(partnerCompanies.id, body.partnerCompanyId), eq(partnerCompanies.companyId, tenant.companyId), isNull(partnerCompanies.deletedAt)))
    .limit(1);

  if (!partner) {
    throw AppError.notFound("Partner company not found");
  }

  const [created] = await db
    .insert(partnerUsers)
    .values({
      companyId: tenant.companyId,
      partnerCompanyId: body.partnerCompanyId,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone ?? null,
      title: body.title ?? null,
      status: body.status,
      accessLevel: body.accessLevel,
      permissions: body.permissions,
      createdBy: user.id,
    })
    .returning();

  return ok(c, created, 201);
}

export async function updatePartner(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = partnerParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdatePartnerInput;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  const [existing] = await db
    .select()
    .from(partnerCompanies)
    .where(and(eq(partnerCompanies.id, params.partnerId), eq(partnerCompanies.companyId, tenant.companyId), isNull(partnerCompanies.deletedAt)))
    .limit(1);

  if (!existing) {
    throw AppError.notFound("Partner not found");
  }

  const [linkedPartnerAccess] = await db
    .select({
      authUserId: partnerUsers.authUserId,
    })
    .from(partnerUsers)
    .where(
      and(
        eq(partnerUsers.companyId, tenant.companyId),
        eq(partnerUsers.partnerCompanyId, params.partnerId),
        isNotNull(partnerUsers.authUserId),
        isNull(partnerUsers.deletedAt),
      ),
    )
    .limit(1);

  const authUserId = linkedPartnerAccess?.authUserId ?? null;

  if (body.password) {
    assertPasswordPolicy(body.password, {
      email: body.email ?? existing.email,
      fullName: body.contactName ?? existing.contactName,
    });
    if (!authUserId) {
      throw AppError.badRequest("This partner does not have a managed login yet");
    }
  }

  const [updated] = await db
    .update(partnerCompanies)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.contactName !== undefined ? { contactName: body.contactName ?? null } : {}),
      ...(body.email !== undefined ? { email: body.email ?? null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(partnerCompanies.id, params.partnerId), eq(partnerCompanies.companyId, tenant.companyId), isNull(partnerCompanies.deletedAt)))
    .returning();

  if (authUserId) {
    const effectiveEmail = body.email ?? existing.email;
    const effectiveName = body.contactName ?? existing.contactName;

    await updateManagedSupabaseUser({
      userId: authUserId,
      ...(effectiveEmail ? { email: effectiveEmail } : {}),
      ...(effectiveName ? { fullName: effectiveName } : {}),
      ...(body.password ? { password: body.password } : {}),
    });

    await db
      .update(profiles)
      .set({
        ...(effectiveEmail ? { email: effectiveEmail } : {}),
        ...(effectiveName ? { fullName: effectiveName } : {}),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, authUserId));

    await db
      .update(partnerUsers)
      .set({
        ...(effectiveEmail ? { email: effectiveEmail } : {}),
        ...(effectiveName ? { fullName: effectiveName } : {}),
        ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(partnerUsers.companyId, tenant.companyId),
          eq(partnerUsers.partnerCompanyId, params.partnerId),
          eq(partnerUsers.authUserId, authUserId),
          isNull(partnerUsers.deletedAt),
        ),
      );

    await db
      .update(companyMemberships)
      .set({
        ...(body.status !== undefined ? { status: body.status === "active" ? "active" : "disabled" } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(companyMemberships.companyId, tenant.companyId), eq(companyMemberships.userId, authUserId), isNull(companyMemberships.deletedAt)));
  }

  return ok(c, updated);
}

export async function deletePartner(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = partnerParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(partnerCompanies)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(partnerCompanies.id, params.partnerId), eq(partnerCompanies.companyId, tenant.companyId), isNull(partnerCompanies.deletedAt)))
    .returning({ id: partnerCompanies.id });

  if (!deleted) {
    throw AppError.notFound("Partner not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
}

export async function updatePartnerUser(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = partnerUserParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdatePartnerUserInput;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  if (body.partnerCompanyId) {
    const [partner] = await db
      .select({ id: partnerCompanies.id })
      .from(partnerCompanies)
      .where(and(eq(partnerCompanies.id, body.partnerCompanyId), eq(partnerCompanies.companyId, tenant.companyId), isNull(partnerCompanies.deletedAt)))
      .limit(1);

    if (!partner) {
      throw AppError.notFound("Partner company not found");
    }
  }

  const [updated] = await db
    .update(partnerUsers)
    .set({
      ...(body.partnerCompanyId !== undefined ? { partnerCompanyId: body.partnerCompanyId } : {}),
      ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
      ...(body.title !== undefined ? { title: body.title ?? null } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.accessLevel !== undefined ? { accessLevel: body.accessLevel } : {}),
      ...(body.permissions !== undefined ? { permissions: body.permissions } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(partnerUsers.id, params.partnerUserId), eq(partnerUsers.companyId, tenant.companyId), isNull(partnerUsers.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Partner user not found");
  }

  return ok(c, updated);
}

export async function deletePartnerUser(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = partnerUserParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(partnerUsers)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(partnerUsers.id, params.partnerUserId), eq(partnerUsers.companyId, tenant.companyId), isNull(partnerUsers.deletedAt)))
    .returning({ id: partnerUsers.id });

  if (!deleted) {
    throw AppError.notFound("Partner user not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
}
