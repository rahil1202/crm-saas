import { and, count, desc, eq, ilike, inArray, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { campaignCustomers, campaigns, customers } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { createNotification } from "@/lib/notifications";
import { campaignParamSchema } from "@/modules/campaigns/schema";
import type { CreateCampaignInput, ListCampaignsQuery, UpdateCampaignInput } from "@/modules/campaigns/schema";

export function getCampaignOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "campaigns",
    capabilities: ["create-campaign", "audience-selection", "email-campaigns", "scheduling", "analytics"],
  });
}

async function loadCampaignAudience(companyId: string, campaignIds: string[]) {
  if (campaignIds.length === 0) {
    return new Map<string, Array<{ customerId: string; fullName: string; email: string | null }>>();
  }

  const rows = await db
    .select({
      campaignId: campaignCustomers.campaignId,
      customerId: customers.id,
      fullName: customers.fullName,
      email: customers.email,
    })
    .from(campaignCustomers)
    .innerJoin(customers, eq(customers.id, campaignCustomers.customerId))
    .where(and(eq(campaignCustomers.companyId, companyId), inArray(campaignCustomers.campaignId, campaignIds), isNull(customers.deletedAt)));

  const audienceByCampaign = new Map<string, Array<{ customerId: string; fullName: string; email: string | null }>>();

  for (const row of rows) {
    const audience = audienceByCampaign.get(row.campaignId) ?? [];
    audience.push({
      customerId: row.customerId,
      fullName: row.fullName,
      email: row.email,
    });
    audienceByCampaign.set(row.campaignId, audience);
  }

  return audienceByCampaign;
}

async function assertValidCustomers(companyId: string, customerIds: string[]) {
  if (customerIds.length === 0) {
    return;
  }

  const uniqueCustomerIds = Array.from(new Set(customerIds));
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.companyId, companyId), inArray(customers.id, uniqueCustomerIds), isNull(customers.deletedAt)));

  if (rows.length !== uniqueCustomerIds.length) {
    throw AppError.badRequest("One or more selected customers are not available in this company");
  }
}

async function replaceCampaignAudience(input: { companyId: string; campaignId: string; customerIds: string[] }) {
  await db.delete(campaignCustomers).where(eq(campaignCustomers.campaignId, input.campaignId));

  const uniqueCustomerIds = Array.from(new Set(input.customerIds));
  if (uniqueCustomerIds.length === 0) {
    return;
  }

  await db.insert(campaignCustomers).values(
    uniqueCustomerIds.map((customerId) => ({
      companyId: input.companyId,
      campaignId: input.campaignId,
      customerId,
    })),
  );
}

export async function listCampaigns(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListCampaignsQuery;

  const conditions = [eq(campaigns.companyId, tenant.companyId), isNull(campaigns.deletedAt)];
  if (query.q) {
    conditions.push(ilike(campaigns.name, `%${query.q}%`));
  }
  if (query.status) {
    conditions.push(eq(campaigns.status, query.status));
  }

  const where = and(...conditions);
  const [items, totalRows] = await Promise.all([
    db.select().from(campaigns).where(where).orderBy(desc(campaigns.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(campaigns).where(where),
  ]);

  const audienceByCampaign = await loadCampaignAudience(
    tenant.companyId,
    items.map((item) => item.id),
  );

  return ok(c, {
    items: items.map((item) => {
      const linkedCustomers = audienceByCampaign.get(item.id) ?? [];
      return {
        ...item,
        audienceCount: linkedCustomers.length,
        linkedCustomers,
      };
    }),
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function createCampaign(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateCampaignInput;
  await assertValidCustomers(tenant.companyId, body.customerIds);

  const [created] = await db
    .insert(campaigns)
    .values({
      companyId: tenant.companyId,
      name: body.name,
      channel: body.channel,
      status: body.status,
      audienceDescription: body.audienceDescription ?? null,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      launchedAt: body.launchedAt ? new Date(body.launchedAt) : null,
      completedAt: body.completedAt ? new Date(body.completedAt) : null,
      sentCount: body.sentCount,
      deliveredCount: body.deliveredCount,
      openedCount: body.openedCount,
      clickedCount: body.clickedCount,
      notes: body.notes ?? null,
      createdBy: user.id,
    })
    .returning();

  await replaceCampaignAudience({
    companyId: tenant.companyId,
    campaignId: created.id,
    customerIds: body.customerIds,
  });

  await createNotification({
    companyId: tenant.companyId,
    type: "campaign",
    title: "Campaign created",
    message: `${created.name} is ${created.status} with ${body.customerIds.length} linked customers`,
    entityId: created.id,
    entityPath: `/dashboard/campaigns`,
    payload: {
      status: created.status,
      audienceCount: body.customerIds.length,
    },
  });

  return ok(c, created, 201);
}

export async function updateCampaign(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateCampaignInput;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  if (body.customerIds !== undefined) {
    await assertValidCustomers(tenant.companyId, body.customerIds);
  }

  const [updated] = await db
    .update(campaigns)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.channel !== undefined ? { channel: body.channel } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.customerIds !== undefined ? {} : {}),
      ...(body.audienceDescription !== undefined ? { audienceDescription: body.audienceDescription ?? null } : {}),
      ...(body.scheduledAt !== undefined ? { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null } : {}),
      ...(body.launchedAt !== undefined ? { launchedAt: body.launchedAt ? new Date(body.launchedAt) : null } : {}),
      ...(body.completedAt !== undefined ? { completedAt: body.completedAt ? new Date(body.completedAt) : null } : {}),
      ...(body.sentCount !== undefined ? { sentCount: body.sentCount } : {}),
      ...(body.deliveredCount !== undefined ? { deliveredCount: body.deliveredCount } : {}),
      ...(body.openedCount !== undefined ? { openedCount: body.openedCount } : {}),
      ...(body.clickedCount !== undefined ? { clickedCount: body.clickedCount } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(campaigns.id, params.campaignId), eq(campaigns.companyId, tenant.companyId), isNull(campaigns.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Campaign not found");
  }

  if (body.customerIds !== undefined) {
    await replaceCampaignAudience({
      companyId: tenant.companyId,
      campaignId: updated.id,
      customerIds: body.customerIds,
    });
  }

  return ok(c, updated);
}

export async function deleteCampaign(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(campaigns)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(campaigns.id, params.campaignId), eq(campaigns.companyId, tenant.companyId), isNull(campaigns.deletedAt)))
    .returning({ id: campaigns.id });

  if (!deleted) {
    throw AppError.notFound("Campaign not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
}
