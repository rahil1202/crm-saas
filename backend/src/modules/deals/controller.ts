import { and, asc, count, desc, eq, ilike, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { dealActivities, deals, partnerCompanies } from "@/db/schema";
import { ok } from "@/lib/api";
import { getCompanySettings } from "@/lib/company-settings";
import { AppError } from "@/lib/errors";
import { dealParamSchema } from "@/modules/deals/schema";
import type {
  BoardDealsQuery,
  CreateDealInput,
  CreateDealTimelineInput,
  DealTimelineQuery,
  ListDealsQuery,
  UpdateDealInput,
} from "@/modules/deals/schema";

async function addDealActivity(input: {
  companyId: string;
  dealId: string;
  actorUserId: string;
  type: string;
  payload: Record<string, unknown>;
}) {
  await db.insert(dealActivities).values(input);
}

async function assertValidPipelineStage(companyId: string, pipelineKey: string, stageKey: string) {
  const settings = await getCompanySettings(companyId);
  const pipeline = settings.dealPipelines.find((item) => item.key === pipelineKey);

  if (!pipeline) {
    throw AppError.badRequest("Selected pipeline does not exist in company settings");
  }

  const stage = pipeline.stages.find((item) => item.key === stageKey);

  if (!stage) {
    throw AppError.badRequest("Selected stage does not exist in the configured pipeline");
  }
}

async function assertValidPartnerCompany(companyId: string, partnerCompanyId?: string | null) {
  if (!partnerCompanyId) {
    return;
  }

  const [partner] = await db
    .select({ id: partnerCompanies.id })
    .from(partnerCompanies)
    .where(and(eq(partnerCompanies.id, partnerCompanyId), eq(partnerCompanies.companyId, companyId), isNull(partnerCompanies.deletedAt)))
    .limit(1);

  if (!partner) {
    throw AppError.badRequest("Partner is not available in this company");
  }
}

export async function listDeals(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListDealsQuery;

  const conditions = [eq(deals.companyId, tenant.companyId), isNull(deals.deletedAt)];
  if (query.q) {
    conditions.push(ilike(deals.title, `%${query.q}%`));
  }
  if (query.status) {
    conditions.push(eq(deals.status, query.status));
  }
  if (query.pipeline) {
    conditions.push(eq(deals.pipeline, query.pipeline));
  }
  if (query.assignedToUserId) {
    conditions.push(eq(deals.assignedToUserId, query.assignedToUserId));
  }

  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    db.select().from(deals).where(where).orderBy(desc(deals.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(deals).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function getDealsBoard(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as BoardDealsQuery;
  const settings = await getCompanySettings(tenant.companyId);
  const selectedPipelineKey = query.pipeline ?? settings.defaultDealPipeline;
  const selectedPipeline = settings.dealPipelines.find((item) => item.key === selectedPipelineKey);

  if (!selectedPipeline) {
    throw AppError.badRequest("Selected pipeline does not exist in company settings");
  }

  const items = await db
    .select()
    .from(deals)
    .where(and(eq(deals.companyId, tenant.companyId), eq(deals.pipeline, selectedPipeline.key), isNull(deals.deletedAt)))
    .orderBy(desc(deals.updatedAt), desc(deals.createdAt));

  const columns = selectedPipeline.stages.map((stage) => ({
    key: stage.key,
    label: stage.label,
    items: items.filter((deal) => deal.stage === stage.key && deal.status === "open"),
    totalValue: items
      .filter((deal) => deal.stage === stage.key && deal.status === "open")
      .reduce((sum, deal) => sum + deal.value, 0),
  }));

  return ok(c, {
    pipeline: {
      key: selectedPipeline.key,
      label: selectedPipeline.label,
    },
    availablePipelines: settings.dealPipelines.map((pipeline) => ({
      key: pipeline.key,
      label: pipeline.label,
    })),
    columns,
    wonCount: items.filter((deal) => deal.status === "won").length,
    lostCount: items.filter((deal) => deal.status === "lost").length,
  });
}

export async function createDeal(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateDealInput;

  await assertValidPipelineStage(tenant.companyId, body.pipeline, body.stage);
  await assertValidPartnerCompany(tenant.companyId, body.partnerCompanyId);

  const [created] = await db
    .insert(deals)
    .values({
      companyId: tenant.companyId,
      storeId: body.storeId ?? tenant.storeId ?? null,
      customerId: body.customerId ?? null,
      leadId: body.leadId ?? null,
      partnerCompanyId: body.partnerCompanyId ?? null,
      assignedToUserId: body.assignedToUserId ?? null,
      title: body.title,
      pipeline: body.pipeline,
      stage: body.stage,
      status: body.status,
      value: body.value,
      expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : null,
      lostReason: body.lostReason ?? null,
      notes: body.notes ?? null,
      createdBy: user.id,
    })
    .returning();

  await addDealActivity({
    companyId: tenant.companyId,
    dealId: created.id,
    actorUserId: user.id,
    type: "deal_created",
    payload: { title: created.title, status: created.status },
  });

  return ok(c, created, 201);
}

export async function updateDeal(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = dealParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateDealInput;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  const [before] = await db
    .select({ status: deals.status, pipeline: deals.pipeline, stage: deals.stage })
    .from(deals)
    .where(and(eq(deals.id, params.dealId), eq(deals.companyId, tenant.companyId), isNull(deals.deletedAt)))
    .limit(1);

  if (!before) {
    throw AppError.notFound("Deal not found");
  }

  const effectivePipeline = body.pipeline ?? before.pipeline;
  const effectiveStage = body.stage ?? before.stage;

  if (body.pipeline !== undefined || body.stage !== undefined) {
    await assertValidPipelineStage(tenant.companyId, effectivePipeline, effectiveStage);
  }
  if (body.partnerCompanyId !== undefined) {
    await assertValidPartnerCompany(tenant.companyId, body.partnerCompanyId);
  }

  const [updated] = await db
    .update(deals)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.pipeline !== undefined ? { pipeline: body.pipeline } : {}),
      ...(body.stage !== undefined ? { stage: body.stage } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.value !== undefined ? { value: body.value } : {}),
      ...(body.expectedCloseDate !== undefined
        ? { expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : null }
        : {}),
      ...(body.lostReason !== undefined ? { lostReason: body.lostReason ?? null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      ...(body.partnerCompanyId !== undefined ? { partnerCompanyId: body.partnerCompanyId ?? null } : {}),
      ...(body.assignedToUserId !== undefined ? { assignedToUserId: body.assignedToUserId ?? null } : {}),
      ...(body.customerId !== undefined ? { customerId: body.customerId ?? null } : {}),
      ...(body.leadId !== undefined ? { leadId: body.leadId ?? null } : {}),
      ...(body.storeId !== undefined ? { storeId: body.storeId ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(deals.id, params.dealId), eq(deals.companyId, tenant.companyId), isNull(deals.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Deal not found");
  }

  if (body.status && body.status !== before.status) {
    await addDealActivity({
      companyId: tenant.companyId,
      dealId: updated.id,
      actorUserId: user.id,
      type: "deal_status_changed",
      payload: { from: before.status, to: body.status },
    });
  }

  return ok(c, updated);
}

export async function getDealTimeline(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = dealParamSchema.parse(c.req.param());
  const query = c.get("validatedQuery") as DealTimelineQuery;

  const [deal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.id, params.dealId), eq(deals.companyId, tenant.companyId), isNull(deals.deletedAt)))
    .limit(1);

  if (!deal) {
    throw AppError.notFound("Deal not found");
  }

  const items = await db
    .select()
    .from(dealActivities)
    .where(and(eq(dealActivities.companyId, tenant.companyId), eq(dealActivities.dealId, params.dealId)))
    .orderBy(desc(dealActivities.createdAt), asc(dealActivities.id))
    .limit(query.limit)
    .offset(query.offset);

  return ok(c, { items, limit: query.limit, offset: query.offset });
}

export async function createDealTimeline(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = dealParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as CreateDealTimelineInput;

  const [deal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.id, params.dealId), eq(deals.companyId, tenant.companyId), isNull(deals.deletedAt)))
    .limit(1);

  if (!deal) {
    throw AppError.notFound("Deal not found");
  }

  const [created] = await db
    .insert(dealActivities)
    .values({
      companyId: tenant.companyId,
      dealId: params.dealId,
      actorUserId: user.id,
      type: body.type,
      payload: { message: body.message },
    })
    .returning();

  return ok(c, created, 201);
}

export async function deleteDeal(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = dealParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(deals)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(deals.id, params.dealId), eq(deals.companyId, tenant.companyId), isNull(deals.deletedAt)))
    .returning({ id: deals.id });

  if (!deleted) {
    throw AppError.notFound("Deal not found");
  }

  await addDealActivity({
    companyId: tenant.companyId,
    dealId: deleted.id,
    actorUserId: user.id,
    type: "deal_deleted",
    payload: {},
  });

  return ok(c, { deleted: true, id: deleted.id });
}
