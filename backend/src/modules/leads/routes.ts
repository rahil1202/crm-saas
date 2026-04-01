import { and, count, desc, eq, ilike, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "@/db/client";
import { leads } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { requireAuth, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";
import type { AppEnv } from "@/app/router";

const listLeadsQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["new", "qualified", "proposal", "won", "lost"]).optional(),
  source: z.string().trim().optional(),
  assignedToUserId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const createLeadSchema = z.object({
  title: z.string().trim().min(1).max(180),
  fullName: z.string().trim().max(180).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
  source: z.string().trim().max(100).optional(),
  status: z.enum(["new", "qualified", "proposal", "won", "lost"]).default("new"),
  score: z.number().int().min(0).max(100).default(0),
  notes: z.string().trim().max(4000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).default([]),
  assignedToUserId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
});

const updateLeadSchema = createLeadSchema.partial();

const leadIdParamSchema = z.object({
  leadId: z.string().uuid(),
});

export const leadRoutes = new Hono<AppEnv>().basePath("/leads");

leadRoutes.use("*", requireAuth, requireTenant);

leadRoutes.get("/", validateQuery(listLeadsQuerySchema), async (c) => {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as z.infer<typeof listLeadsQuerySchema>;

  const conditions = [eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)];

  if (query.status) {
    conditions.push(eq(leads.status, query.status));
  }

  if (query.source) {
    conditions.push(eq(leads.source, query.source));
  }

  if (query.assignedToUserId) {
    conditions.push(eq(leads.assignedToUserId, query.assignedToUserId));
  }

  if (query.q) {
    conditions.push(ilike(leads.title, `%${query.q}%`));
  }

  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(where)
      .orderBy(desc(leads.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: count() }).from(leads).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
});

leadRoutes.post("/", validateJson(createLeadSchema), async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as z.infer<typeof createLeadSchema>;

  const [created] = await db
    .insert(leads)
    .values({
      companyId: tenant.companyId,
      storeId: body.storeId ?? tenant.storeId ?? null,
      assignedToUserId: body.assignedToUserId ?? null,
      title: body.title,
      fullName: body.fullName ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      source: body.source ?? null,
      status: body.status,
      score: body.score,
      notes: body.notes ?? null,
      tags: body.tags,
      createdBy: user.id,
    })
    .returning();

  return ok(c, created, 201);
});

leadRoutes.patch("/:leadId", validateJson(updateLeadSchema), async (c) => {
  const tenant = c.get("tenant");
  const params = leadIdParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as z.infer<typeof updateLeadSchema>;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  const patch = {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.fullName !== undefined ? { fullName: body.fullName ?? null } : {}),
    ...(body.email !== undefined ? { email: body.email ?? null } : {}),
    ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
    ...(body.source !== undefined ? { source: body.source ?? null } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.score !== undefined ? { score: body.score } : {}),
    ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
    ...(body.tags !== undefined ? { tags: body.tags } : {}),
    ...(body.assignedToUserId !== undefined ? { assignedToUserId: body.assignedToUserId ?? null } : {}),
    ...(body.storeId !== undefined ? { storeId: body.storeId ?? null } : {}),
    updatedAt: new Date(),
  };

  const [updated] = await db
    .update(leads)
    .set(patch)
    .where(and(eq(leads.id, params.leadId), eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Lead not found");
  }

  return ok(c, updated);
});

leadRoutes.delete("/:leadId", async (c) => {
  const tenant = c.get("tenant");
  const params = leadIdParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(leads)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(leads.id, params.leadId), eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)))
    .returning({ id: leads.id });

  if (!deleted) {
    throw AppError.notFound("Lead not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
});
