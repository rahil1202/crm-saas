import { and, count, desc, eq, ilike, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { partnerCompanies, partnerUsers } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { partnerParamSchema, partnerUserParamSchema } from "@/modules/partners/schema";
import type {
  CreatePartnerInput,
  CreatePartnerUserInput,
  ListPartnersQuery,
  ListPartnerUsersQuery,
  UpdatePartnerInput,
  UpdatePartnerUserInput,
} from "@/modules/partners/schema";

export async function listPartners(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListPartnersQuery;

  const conditions = [eq(partnerCompanies.companyId, tenant.companyId), isNull(partnerCompanies.deletedAt)];
  if (query.q) {
    conditions.push(ilike(partnerCompanies.name, `%${query.q}%`));
  }
  if (query.status) {
    conditions.push(eq(partnerCompanies.status, query.status));
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

  const [created] = await db
    .insert(partnerCompanies)
    .values({
      companyId: tenant.companyId,
      name: body.name,
      contactName: body.contactName ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      notes: body.notes ?? null,
      status: body.status,
      createdBy: user.id,
    })
    .returning();

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

  if (!updated) {
    throw AppError.notFound("Partner not found");
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
