import { and, count, desc, eq, ilike, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "@/app/router";
import { db } from "@/db/client";
import { customers } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { requireAuth, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

const listSchema = z.object({
  q: z.string().trim().optional(),
  email: z.string().email().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const createSchema = z.object({
  fullName: z.string().trim().min(1).max(180),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).default([]),
  notes: z.string().trim().max(4000).optional(),
  leadId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
});

const updateSchema = createSchema.partial();
const paramSchema = z.object({ customerId: z.string().uuid() });

export const customerRoutes = new Hono<AppEnv>().basePath("/customers");
customerRoutes.use("*", requireAuth, requireTenant);

customerRoutes.get("/", validateQuery(listSchema), async (c) => {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as z.infer<typeof listSchema>;

  const conditions = [eq(customers.companyId, tenant.companyId), isNull(customers.deletedAt)];
  if (query.q) {
    conditions.push(ilike(customers.fullName, `%${query.q}%`));
  }
  if (query.email) {
    conditions.push(eq(customers.email, query.email));
  }

  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    db.select().from(customers).where(where).orderBy(desc(customers.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(customers).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
});

customerRoutes.post("/", validateJson(createSchema), async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as z.infer<typeof createSchema>;

  const [created] = await db
    .insert(customers)
    .values({
      companyId: tenant.companyId,
      storeId: body.storeId ?? tenant.storeId ?? null,
      leadId: body.leadId ?? null,
      fullName: body.fullName,
      email: body.email ?? null,
      phone: body.phone ?? null,
      tags: body.tags,
      notes: body.notes ?? null,
      createdBy: user.id,
    })
    .returning();

  return ok(c, created, 201);
});

customerRoutes.patch("/:customerId", validateJson(updateSchema), async (c) => {
  const tenant = c.get("tenant");
  const params = paramSchema.parse(c.req.param());
  const body = c.get("validatedBody") as z.infer<typeof updateSchema>;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  const [updated] = await db
    .update(customers)
    .set({
      ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
      ...(body.email !== undefined ? { email: body.email ?? null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      ...(body.leadId !== undefined ? { leadId: body.leadId ?? null } : {}),
      ...(body.storeId !== undefined ? { storeId: body.storeId ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(customers.id, params.customerId), eq(customers.companyId, tenant.companyId), isNull(customers.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Customer not found");
  }

  return ok(c, updated);
});

customerRoutes.delete("/:customerId", async (c) => {
  const tenant = c.get("tenant");
  const params = paramSchema.parse(c.req.param());

  const [deleted] = await db
    .update(customers)
    .set({ updatedAt: new Date(), deletedAt: new Date() })
    .where(and(eq(customers.id, params.customerId), eq(customers.companyId, tenant.companyId), isNull(customers.deletedAt)))
    .returning({ id: customers.id });

  if (!deleted) {
    throw AppError.notFound("Customer not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
});
