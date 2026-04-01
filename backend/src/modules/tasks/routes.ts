import { and, count, desc, eq, ilike, isNull, lte } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "@/app/router";
import { db } from "@/db/client";
import { tasks } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { requireAuth, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

const listSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["todo", "in_progress", "done", "overdue"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  assignedToUserId: z.string().uuid().optional(),
  overdueOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(4000).optional(),
  status: z.enum(["todo", "in_progress", "done", "overdue"]).default("todo"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueAt: z.string().datetime().optional(),
  isRecurring: z.boolean().default(false),
  recurrenceRule: z.string().trim().max(120).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
});

const updateSchema = createSchema.partial();
const paramSchema = z.object({ taskId: z.string().uuid() });

export const taskRoutes = new Hono<AppEnv>().basePath("/tasks");
taskRoutes.use("*", requireAuth, requireTenant);

taskRoutes.get("/", validateQuery(listSchema), async (c) => {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as z.infer<typeof listSchema>;

  const conditions = [eq(tasks.companyId, tenant.companyId), isNull(tasks.deletedAt)];
  if (query.q) {
    conditions.push(ilike(tasks.title, `%${query.q}%`));
  }
  if (query.status) {
    conditions.push(eq(tasks.status, query.status));
  }
  if (query.priority) {
    conditions.push(eq(tasks.priority, query.priority));
  }
  if (query.assignedToUserId) {
    conditions.push(eq(tasks.assignedToUserId, query.assignedToUserId));
  }
  if (query.overdueOnly) {
    conditions.push(lte(tasks.dueAt, new Date()));
  }

  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    db.select().from(tasks).where(where).orderBy(desc(tasks.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(tasks).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
});

taskRoutes.post("/", validateJson(createSchema), async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as z.infer<typeof createSchema>;

  const [created] = await db
    .insert(tasks)
    .values({
      companyId: tenant.companyId,
      storeId: body.storeId ?? tenant.storeId ?? null,
      customerId: body.customerId ?? null,
      dealId: body.dealId ?? null,
      assignedToUserId: body.assignedToUserId ?? null,
      title: body.title,
      description: body.description ?? null,
      status: body.status,
      priority: body.priority,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      completedAt: body.status === "done" ? new Date() : null,
      isRecurring: body.isRecurring,
      recurrenceRule: body.recurrenceRule ?? null,
      createdBy: user.id,
    })
    .returning();

  return ok(c, created, 201);
});

taskRoutes.patch("/:taskId", validateJson(updateSchema), async (c) => {
  const tenant = c.get("tenant");
  const params = paramSchema.parse(c.req.param());
  const body = c.get("validatedBody") as z.infer<typeof updateSchema>;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  let completedAt: Date | null | undefined = undefined;
  if (body.status === "done") {
    completedAt = new Date();
  } else if (body.status !== undefined) {
    completedAt = null;
  }

  const [updated] = await db
    .update(tasks)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description ?? null } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(body.dueAt) : null } : {}),
      ...(completedAt !== undefined ? { completedAt } : {}),
      ...(body.isRecurring !== undefined ? { isRecurring: body.isRecurring } : {}),
      ...(body.recurrenceRule !== undefined ? { recurrenceRule: body.recurrenceRule ?? null } : {}),
      ...(body.assignedToUserId !== undefined ? { assignedToUserId: body.assignedToUserId ?? null } : {}),
      ...(body.customerId !== undefined ? { customerId: body.customerId ?? null } : {}),
      ...(body.dealId !== undefined ? { dealId: body.dealId ?? null } : {}),
      ...(body.storeId !== undefined ? { storeId: body.storeId ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, params.taskId), eq(tasks.companyId, tenant.companyId), isNull(tasks.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Task not found");
  }

  return ok(c, updated);
});

taskRoutes.delete("/:taskId", async (c) => {
  const tenant = c.get("tenant");
  const params = paramSchema.parse(c.req.param());

  const [deleted] = await db
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, params.taskId), eq(tasks.companyId, tenant.companyId), isNull(tasks.deletedAt)))
    .returning({ id: tasks.id });

  if (!deleted) {
    throw AppError.notFound("Task not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
});
