import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { companies, companyCustomRoles, companyInvites, companyMemberships, companyPlans, externalInvites, profiles, referralAttributions, referralCodes, stores } from "@/db/schema";
import { ok } from "@/lib/api";
import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { companyParamSchema, externalInviteLookupParamSchema, externalInviteParamSchema, storeParamSchema } from "@/modules/companies/schema";
import type { CreateExternalInviteInput, CreateStoreInput, UpdateCompanyInput, UpdateCompanyPlanInput, UpdateExternalInviteInput, UpdateStoreInput } from "@/modules/companies/schema";

function buildExternalInviteUrl(token: string) {
  return `${env.FRONTEND_URL}/register?externalInvite=${encodeURIComponent(token)}`;
}

function isExternalInviteExpired(input: { expiresAt: Date; status: string }) {
  return input.status === "pending" && input.expiresAt.getTime() <= Date.now();
}

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

  const externalInviteRows = await db
    .select({
      externalInviteId: externalInvites.id,
      channel: externalInvites.channel,
      status: externalInvites.status,
      contactName: externalInvites.contactName,
      email: externalInvites.email,
      phone: externalInvites.phone,
      message: externalInvites.message,
      storeId: externalInvites.storeId,
      storeName: stores.name,
      invitedBy: externalInvites.invitedBy,
      inviterName: profiles.fullName,
      inviterEmail: profiles.email,
      expiresAt: externalInvites.expiresAt,
      completedAt: externalInvites.completedAt,
      createdAt: externalInvites.createdAt,
      updatedAt: externalInvites.updatedAt,
      inviteLinkToken: externalInvites.inviteLinkToken,
      metadata: externalInvites.metadata,
    })
    .from(externalInvites)
    .leftJoin(profiles, eq(profiles.id, externalInvites.invitedBy))
    .leftJoin(stores, eq(stores.id, externalInvites.storeId))
    .where(eq(externalInvites.companyId, companyId))
    .orderBy(desc(externalInvites.createdAt));

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
    externalInvites: externalInviteRows.map((invite) => ({
      ...invite,
      inviteUrl: buildExternalInviteUrl(invite.inviteLinkToken),
    })),
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

export async function createExternalInvite(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateExternalInviteInput;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [createdInvite] = await db
    .insert(externalInvites)
    .values({
      companyId: tenant.companyId,
      storeId: body.storeId ?? null,
      channel: body.channel,
      status: "pending",
      contactName: body.contactName?.trim() || null,
      email: body.email?.trim().toLowerCase() || null,
      phone: body.phone?.trim() || null,
      message: body.message?.trim() || null,
      invitedBy: user.id,
      inviteLinkToken: crypto.randomUUID(),
      expiresAt,
      metadata: body.metadata ?? {},
    })
    .returning();

  return ok(c, {
    externalInviteId: createdInvite.id,
    inviteUrl: buildExternalInviteUrl(createdInvite.inviteLinkToken),
    status: createdInvite.status,
    expiresAt: createdInvite.expiresAt,
  }, 201);
}

export async function updateExternalInvite(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as UpdateExternalInviteInput;
  const params = externalInviteParamSchema.parse(c.req.param());

  const [existingInvite] = await db
    .select()
    .from(externalInvites)
    .where(and(eq(externalInvites.id, params.externalInviteId), eq(externalInvites.companyId, tenant.companyId)))
    .limit(1);

  if (!existingInvite) {
    throw AppError.notFound("External invite not found");
  }

  if (isExternalInviteExpired(existingInvite) && body.status === "completed") {
    throw AppError.conflict("Expired invites cannot be completed");
  }

  const nextStatus = body.status ?? existingInvite.status;

  const [updatedInvite] = await db
    .update(externalInvites)
    .set({
      status: nextStatus,
      completedAt: nextStatus === "completed" ? existingInvite.completedAt ?? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(externalInvites.id, existingInvite.id))
    .returning();

  return ok(c, {
    externalInviteId: updatedInvite.id,
    status: updatedInvite.status,
    completedAt: updatedInvite.completedAt,
  });
}

export async function deleteExternalInvite(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = externalInviteParamSchema.parse(c.req.param());

  const [existingInvite] = await db
    .select({ id: externalInvites.id })
    .from(externalInvites)
    .where(and(eq(externalInvites.id, params.externalInviteId), eq(externalInvites.companyId, tenant.companyId)))
    .limit(1);

  if (!existingInvite) {
    throw AppError.notFound("External invite not found");
  }

  await db.delete(externalInvites).where(eq(externalInvites.id, existingInvite.id));

  return ok(c, { deleted: true });
}

export async function getExternalInviteLookup(c: Context<AppEnv>) {
  const params = externalInviteLookupParamSchema.parse(c.req.param());

  const [invite] = await db
    .select({
      externalInviteId: externalInvites.id,
      channel: externalInvites.channel,
      status: externalInvites.status,
      contactName: externalInvites.contactName,
      email: externalInvites.email,
      phone: externalInvites.phone,
      message: externalInvites.message,
      expiresAt: externalInvites.expiresAt,
      createdAt: externalInvites.createdAt,
      companyName: companies.name,
      storeName: stores.name,
      inviterName: profiles.fullName,
      inviterEmail: profiles.email,
    })
    .from(externalInvites)
    .innerJoin(companies, eq(companies.id, externalInvites.companyId))
    .leftJoin(stores, eq(stores.id, externalInvites.storeId))
    .leftJoin(profiles, eq(profiles.id, externalInvites.invitedBy))
    .where(eq(externalInvites.inviteLinkToken, params.token))
    .limit(1);

  if (!invite || invite.status !== "pending" || isExternalInviteExpired(invite)) {
    return ok(c, {
      valid: false,
      invite: null,
    });
  }

  return ok(c, {
    valid: true,
    invite: {
      externalInviteId: invite.externalInviteId,
      channel: invite.channel,
      contactName: invite.contactName,
      email: invite.email,
      phone: invite.phone,
      message: invite.message,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
      companyName: invite.companyName,
      storeName: invite.storeName,
      inviterName: invite.inviterName,
      inviterEmail: invite.inviterEmail,
    },
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
