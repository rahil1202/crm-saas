import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "@/app/router";
import { db } from "@/db/client";
import { companies, companyInvites, companyMemberships, profiles, stores } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";

const updateCompanySchema = z.object({
  name: z.string().trim().min(2).max(180),
  timezone: z.string().trim().min(2).max(80),
  currency: z.string().trim().min(3).max(8),
});

const createStoreSchema = z.object({
  name: z.string().trim().min(2).max(180),
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .transform((value) => value.toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "")),
  isDefault: z.boolean().optional().default(false),
});

const updateStoreSchema = z.object({
  name: z.string().trim().min(2).max(180),
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .transform((value) => value.toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "")),
  isDefault: z.boolean().optional().default(false),
});

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

export const companyRoutes = new Hono<AppEnv>().basePath("/companies");

companyRoutes.get("/", (c) =>
  ok(c, {
    module: "companies",
    capabilities: ["company-profile", "branches", "branding", "lead-sources", "default-pipeline"],
  }),
);

companyRoutes.get("/current", requireAuth, requireTenant, async (c) => {
  const tenant = c.get("tenant");
  return ok(c, await loadCompanySnapshot(tenant.companyId));
});

companyRoutes.patch("/current", requireAuth, requireTenant, requireRole("admin"), validateJson(updateCompanySchema), async (c) => {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as z.infer<typeof updateCompanySchema>;

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
});

companyRoutes.post("/stores", requireAuth, requireTenant, requireRole("admin"), validateJson(createStoreSchema), async (c) => {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as z.infer<typeof createStoreSchema>;

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
});

companyRoutes.patch("/stores/:storeId", requireAuth, requireTenant, requireRole("admin"), validateJson(updateStoreSchema), async (c) => {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as z.infer<typeof updateStoreSchema>;
  const storeId = c.req.param("storeId");

  const [existingStore] = await db
    .select()
    .from(stores)
    .where(and(eq(stores.id, storeId), eq(stores.companyId, tenant.companyId), isNull(stores.deletedAt)))
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
});
