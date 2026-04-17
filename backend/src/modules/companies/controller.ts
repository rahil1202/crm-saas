import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { companies, companyCustomRoles, companyInvites, companyMemberships, companyPlans, profiles, referralAttributions, referralCodes, stores } from "@/db/schema";
import { ok } from "@/lib/api";
import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { companyParamSchema, storeParamSchema } from "@/modules/companies/schema";
import type { CreateStoreInput, UpdateCompanyInput, UpdateCompanyPlanInput, UpdateStoreInput } from "@/modules/companies/schema";

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
    .where(and(eq(companyMemberships.companyId, companyId), isNull(companyMemberships.deletedAt)))
    .orderBy(asc(companyMemberships.createdAt));

  const customRoleRows = await db
    .select({
      id: companyCustomRoles.id,
      name: companyCustomRoles.name,
      modules: companyCustomRoles.modules,
      createdAt: companyCustomRoles.createdAt,
      updatedAt: companyCustomRoles.updatedAt,
    })
    .from(companyCustomRoles)
    .where(and(eq(companyCustomRoles.companyId, companyId), isNull(companyCustomRoles.deletedAt)))
    .orderBy(asc(companyCustomRoles.createdAt));

  const inviteRows = await db
    .select({
      inviteId: companyInvites.id,
      email: companyInvites.email,
      role: companyInvites.role,
      status: companyInvites.status,
      storeId: companyInvites.storeId,
      storeName: stores.name,
      referralCode: companyInvites.referralCode,
      inviteMessage: companyInvites.inviteMessage,
      metadata: companyInvites.metadata,
      token: companyInvites.token,
      invitedBy: companyInvites.invitedBy,
      inviterName: profiles.fullName,
      inviterEmail: profiles.email,
      expiresAt: companyInvites.expiresAt,
      acceptedAt: companyInvites.acceptedAt,
      createdAt: companyInvites.createdAt,
    })
    .from(companyInvites)
    .leftJoin(profiles, eq(profiles.id, companyInvites.invitedBy))
    .leftJoin(stores, eq(stores.id, companyInvites.storeId))
    .where(eq(companyInvites.companyId, companyId))
    .orderBy(desc(companyInvites.createdAt));

  const referralCodeRows = await db
    .select({
      id: referralCodes.id,
      code: referralCodes.code,
      isActive: referralCodes.isActive,
      metadata: referralCodes.metadata,
      createdAt: referralCodes.createdAt,
      updatedAt: referralCodes.updatedAt,
      referrerUserId: referralCodes.referrerUserId,
      referrerName: profiles.fullName,
      referrerEmail: profiles.email,
    })
    .from(referralCodes)
    .leftJoin(profiles, eq(profiles.id, referralCodes.referrerUserId))
    .where(eq(referralCodes.companyId, companyId))
    .orderBy(desc(referralCodes.createdAt));

  const referralAttributionRows = await db
    .select({
      id: referralAttributions.id,
      referralCodeId: referralAttributions.referralCodeId,
      referralCode: referralCodes.code,
      status: referralAttributions.status,
      referrerUserId: referralAttributions.referrerUserId,
      referrerName: profiles.fullName,
      referrerEmail: profiles.email,
      referredUserId: referralAttributions.referredUserId,
      referredEmail: referralAttributions.referredEmail,
      inviteId: referralAttributions.inviteId,
      capturedAt: referralAttributions.capturedAt,
      registeredAt: referralAttributions.registeredAt,
      verifiedAt: referralAttributions.verifiedAt,
      joinedCompanyAt: referralAttributions.joinedCompanyAt,
      completedOnboardingAt: referralAttributions.completedOnboardingAt,
      createdAt: referralAttributions.createdAt,
      updatedAt: referralAttributions.updatedAt,
    })
    .from(referralAttributions)
    .leftJoin(referralCodes, eq(referralCodes.id, referralAttributions.referralCodeId))
    .leftJoin(profiles, eq(profiles.id, referralAttributions.referrerUserId))
    .where(eq(referralAttributions.companyId, companyId))
    .orderBy(desc(referralAttributions.createdAt));

  const [plan] = await db.select().from(companyPlans).where(eq(companyPlans.companyId, companyId)).limit(1);

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
    plan: plan ?? null,
    stores: storeRows,
    customRoles: customRoleRows,
    members: memberRows,
    invites: inviteRows.map((invite) => ({
      ...invite,
      inviteUrl: `${env.FRONTEND_URL}/register?inviteToken=${encodeURIComponent(invite.token)}${invite.referralCode ? `&referralCode=${encodeURIComponent(invite.referralCode)}` : ""}`,
    })),
    referralCodes: referralCodeRows.map((item) => ({
      ...item,
      referralUrl: `${env.FRONTEND_URL}/register?referralCode=${encodeURIComponent(item.code)}`,
    })),
    referralAttributions: referralAttributionRows,
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

export async function getCurrentCompanyPlan(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const [plan] = await db.select().from(companyPlans).where(eq(companyPlans.companyId, tenant.companyId)).limit(1);

  return ok(c, {
    plan: plan ?? null,
  });
}

export async function updateCompanyPlan(c: Context<AppEnv>) {
  const params = companyParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateCompanyPlanInput;

  const [updated] = await db
    .insert(companyPlans)
    .values({
      companyId: params.companyId,
      planCode: body.planCode,
      planName: body.planName,
      status: body.status,
      billingInterval: body.billingInterval,
      seatLimit: body.seatLimit,
      monthlyPrice: body.monthlyPrice,
      currency: body.currency.toUpperCase(),
      trialEndsAt: body.trialEndsAt ? new Date(body.trialEndsAt) : null,
      renewalDate: body.renewalDate ? new Date(body.renewalDate) : null,
      notes: body.notes ?? null,
    })
    .onConflictDoUpdate({
      target: companyPlans.companyId,
      set: {
        planCode: body.planCode,
        planName: body.planName,
        status: body.status,
        billingInterval: body.billingInterval,
        seatLimit: body.seatLimit,
        monthlyPrice: body.monthlyPrice,
        currency: body.currency.toUpperCase(),
        trialEndsAt: body.trialEndsAt ? new Date(body.trialEndsAt) : null,
        renewalDate: body.renewalDate ? new Date(body.renewalDate) : null,
        notes: body.notes ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return ok(c, {
    plan: updated,
  });
}
