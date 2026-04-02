import { and, count, desc, eq, ilike, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "@/app/router";
import { db } from "@/db/client";
import { partnerCompanies } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

const listPartnersSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const partnerSchema = z.object({
  name: z.string().trim().min(2).max(180),
  contactName: z.string().trim().max(180).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(4000).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

const updatePartnerSchema = partnerSchema.partial();
const paramSchema = z.object({ partnerId: z.string().uuid() });

export const partnerRoutes = new Hono<AppEnv>().basePath("/partners");
partnerRoutes.use("*", requireAuth, requireTenant);

partnerRoutes.get("/", validateQuery(listPartnersSchema), async (c) => {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as z.infer<typeof listPartnersSchema>;

  const conditions = [eq(partnerCompanies.companyId, tenant.companyId), isNull(partnerCompanies.deletedAt)];
  if (query.q) {
    conditions.push(ilike(partnerCompanies.name, `%${query.q}%`));
  }
  if (query.status) {
    conditions.push(eq(partnerCompanies.status, query.status));
  }

  const where = and(...conditions);
  const [items, totalRows] = await Promise.all([
    db.select().from(partnerCompanies).where(where).orderBy(desc(partnerCompanies.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(partnerCompanies).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
});

partnerRoutes.post("/", requireRole("admin"), validateJson(partnerSchema), async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as z.infer<typeof partnerSchema>;

  const [created] = await db
    .insert(partnerCompanies)
    .values({
      companyId: tenant.companyId,
      name: body.name,
      contactName: body.contactName ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      notes: body.notes ?? null,
      status: body.status,
      createdBy: user.id,
    })
    .returning();

  return ok(c, created, 201);
});

partnerRoutes.patch("/:partnerId", requireRole("admin"), validateJson(updatePartnerSchema), async (c) => {
  const tenant = c.get("tenant");
  const params = paramSchema.parse(c.req.param());
  const body = c.get("validatedBody") as z.infer<typeof updatePartnerSchema>;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  const [updated] = await db
    .update(partnerCompanies)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.contactName !== undefined ? { contactName: body.contactName ?? null } : {}),
      ...(body.email !== undefined ? { email: body.email ?? null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(partnerCompanies.id, params.partnerId), eq(partnerCompanies.companyId, tenant.companyId), isNull(partnerCompanies.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Partner not found");
  }

  return ok(c, updated);
});

partnerRoutes.delete("/:partnerId", requireRole("admin"), async (c) => {
  const tenant = c.get("tenant");
  const params = paramSchema.parse(c.req.param());

  const [deleted] = await db
    .update(partnerCompanies)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(partnerCompanies.id, params.partnerId), eq(partnerCompanies.companyId, tenant.companyId), isNull(partnerCompanies.deletedAt)))
    .returning({ id: partnerCompanies.id });

  if (!deleted) {
    throw AppError.notFound("Partner not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
});
