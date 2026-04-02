import { and, asc, eq, gt, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { companies, companyInvites, companyMemberships, profiles, stores } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { storeParamSchema } from "@/modules/companies/schema";
import type { CreateStoreInput, UpdateCompanyInput, UpdateStoreInput } from "@/modules/companies/schema";

async function loadCompanySnapshot(companyId: string) {
  const [company] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)))
    .limit(1);

  if (!company) {
    throw AppError.notFound("Company not found");
  }

  const storeRows = await db
    .select()
    .from(stores)
    .where(and(eq(stores.companyId, companyId), isNull(stores.deletedAt)))
    .orderBy(asc(stores.createdAt));

  const memberRows = await db
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
    .where(and(eq(companyMemberships.companyId, companyId), isNull(companyMemberships.deletedAt)))
    .orderBy(asc(companyMemberships.createdAt));

  const inviteRows = await db
    .select({
      inviteId: companyInvites.id,
      email: companyInvites.email,
      role: companyInvites.role,
      status: companyInvites.status,
      storeId: companyInvites.storeId,
      storeName: stores.name,
      expiresAt: companyInvites.expiresAt,
      createdAt: companyInvites.createdAt,
    })
    .from(companyInvites)
    .leftJoin(stores, eq(stores.id, companyInvites.storeId))
    .where(and(eq(companyInvites.companyId, companyId), gt(companyInvites.expiresAt, new Date())))
    .orderBy(asc(companyInvites.createdAt));

  return {
    company: {
      id: company.id,
      name: company.name,
      timezone: company.timezone,
      currency: company.currency,
      createdBy: company.createdBy,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    },
    stores: storeRows,
    members: memberRows,
    invites: inviteRows,
  };
}

export function getCompaniesOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "companies",
    capabilities: ["company-profile", "branches", "branding", "lead-sources", "default-pipeline"],
  });
}

export async function getCurrentCompany(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  return ok(c, await loadCompanySnapshot(tenant.companyId));
}

export async function updateCurrentCompany(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as UpdateCompanyInput;

  const [company] = await db
    .update(companies)
    .set({
      name: body.name,
      timezone: body.timezone,
      currency: body.currency.toUpperCase(),
      updatedAt: new Date(),
    })
    .where(and(eq(companies.id, tenant.companyId), isNull(companies.deletedAt)))
    .returning();

  if (!company) {
    throw AppError.notFound("Company not found");
  }

  return ok(c, {
    company: {
      id: company.id,
      name: company.name,
      timezone: company.timezone,
      currency: company.currency,
      updatedAt: company.updatedAt,
    },
  });
}

export async function createStore(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as CreateStoreInput;

  if (!body.code) {
    throw AppError.badRequest("Store code is required");
  }

  if (body.isDefault) {
    await db
      .update(stores)
      .set({
        isDefault: false,
        updatedAt: new Date(),
      })
      .where(and(eq(stores.companyId, tenant.companyId), isNull(stores.deletedAt)));
  }

  const [createdStore] = await db
    .insert(stores)
    .values({
      companyId: tenant.companyId,
      name: body.name,
      code: body.code,
      isDefault: body.isDefault,
    })
    .returning();

  return ok(
    c,
    {
      store: createdStore,
    },
    201,
  );
}

export async function updateStore(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as UpdateStoreInput;
  const params = storeParamSchema.parse(c.req.param());

  const [existingStore] = await db
    .select()
    .from(stores)
    .where(and(eq(stores.id, params.storeId), eq(stores.companyId, tenant.companyId), isNull(stores.deletedAt)))
    .limit(1);

  if (!existingStore) {
    throw AppError.notFound("Store not found");
  }

  if (body.isDefault) {
    await db
      .update(stores)
      .set({
        isDefault: false,
        updatedAt: new Date(),
      })
      .where(and(eq(stores.companyId, tenant.companyId), isNull(stores.deletedAt)));
  }

  const [updatedStore] = await db
    .update(stores)
    .set({
      name: body.name,
      code: body.code,
      isDefault: body.isDefault,
      updatedAt: new Date(),
    })
    .where(eq(stores.id, existingStore.id))
    .returning();

  return ok(c, {
    store: updatedStore,
  });
}
