import { and, asc, count, desc, eq, ilike, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "@/app/router";
import { db } from "@/db/client";
import { dealActivities, deals } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { requireAuth, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

const listSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["open", "won", "lost"]).optional(),
  pipeline: z.string().trim().optional(),
  assignedToUserId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(180),
  pipeline: z.string().trim().min(1).max(100).default("default"),
  stage: z.string().trim().min(1).max(100).default("new"),
  status: z.enum(["open", "won", "lost"]).default("open"),
  value: z.number().int().min(0).default(0),
  expectedCloseDate: z.string().datetime().optional(),
  lostReason: z.string().trim().max(250).optional(),
  notes: z.string().trim().max(4000).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
});

const updateSchema = createSchema.partial();
const paramSchema = z.object({ dealId: z.string().uuid() });

const timelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const timelineCreateSchema = z.object({
  type: z.enum(["note", "call", "email", "meeting", "status_change", "system"]).default("note"),
  message: z.string().trim().min(1).max(1000),
});

async function addDealActivity(input: {
  companyId: string;
  dealId: string;
  actorUserId: string;
  type: string;
  payload: Record<string, unknown>;
}) {
  await db.insert(dealActivities).values(input);
}

export const dealRoutes = new Hono<AppEnv>().basePath("/deals");
dealRoutes.use("*", requireAuth, requireTenant);

dealRoutes.get("/", validateQuery(listSchema), async (c) => {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as z.infer<typeof listSchema>;

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
});

dealRoutes.post("/", validateJson(createSchema), async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as z.infer<typeof createSchema>;

  const [created] = await db
    .insert(deals)
    .values({
      companyId: tenant.companyId,
      storeId: body.storeId ?? tenant.storeId ?? null,
      customerId: body.customerId ?? null,
      leadId: body.leadId ?? null,
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
});

dealRoutes.patch("/:dealId", validateJson(updateSchema), async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = paramSchema.parse(c.req.param());
  const body = c.get("validatedBody") as z.infer<typeof updateSchema>;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  const [before] = await db
    .select({ status: deals.status })
    .from(deals)
    .where(and(eq(deals.id, params.dealId), eq(deals.companyId, tenant.companyId), isNull(deals.deletedAt)))
    .limit(1);

  if (!before) {
    throw AppError.notFound("Deal not found");
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
});

dealRoutes.get("/:dealId/timeline", validateQuery(timelineQuerySchema), async (c) => {
  const tenant = c.get("tenant");
  const params = paramSchema.parse(c.req.param());
  const query = c.get("validatedQuery") as z.infer<typeof timelineQuerySchema>;

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
});

dealRoutes.post("/:dealId/timeline", validateJson(timelineCreateSchema), async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = paramSchema.parse(c.req.param());
  const body = c.get("validatedBody") as z.infer<typeof timelineCreateSchema>;

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
});

dealRoutes.delete("/:dealId", async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = paramSchema.parse(c.req.param());

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
});
