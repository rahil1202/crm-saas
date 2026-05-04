import { and, count, desc, eq, ilike, isNotNull, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { campaigns, templates } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { templateParamSchema } from "@/modules/templates/schema";
import type { CreateTemplateInput, ListTemplatesQuery, UpdateTemplateInput } from "@/modules/templates/schema";

export function getTemplateOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "templates",
    capabilities: ["email-templates", "whatsapp-templates", "sms-templates", "task-templates", "pipeline-templates"],
  });
}

export async function listTemplates(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListTemplatesQuery;

  const conditions = [
    eq(templates.companyId, tenant.companyId),
    query.lifecycle === "deleted" ? isNotNull(templates.deletedAt) : isNull(templates.deletedAt),
  ];
  if (query.q) {
    conditions.push(ilike(templates.name, `%${query.q}%`));
  }
  if (query.type) {
    conditions.push(eq(templates.type, query.type));
  }

  const where = and(...conditions);
  const [items, totalRows] = await Promise.all([
    db.select().from(templates).where(where).orderBy(desc(templates.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(templates).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function createTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateTemplateInput;

  const [created] = await db
    .insert(templates)
    .values({
      companyId: tenant.companyId,
      name: body.name,
      type: body.type,
      subject: body.subject ?? null,
      content: body.content,
      notes: body.notes ?? null,
      createdBy: user.id,
    })
    .returning();

  return ok(c, created, 201);
}

export async function updateTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = templateParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateTemplateInput;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  const [updated] = await db
    .update(templates)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.subject !== undefined ? { subject: body.subject ?? null } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(templates.id, params.templateId), eq(templates.companyId, tenant.companyId), isNull(templates.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Template not found");
  }

  return ok(c, updated);
}

export async function deleteTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = templateParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(templates)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(templates.id, params.templateId), eq(templates.companyId, tenant.companyId), isNull(templates.deletedAt)))
    .returning({ id: templates.id });

  if (!deleted) {
    throw AppError.notFound("Template not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
}

export async function restoreTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = templateParamSchema.parse(c.req.param());

  const [restored] = await db
    .update(templates)
    .set({
      deletedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(templates.id, params.templateId), eq(templates.companyId, tenant.companyId), isNotNull(templates.deletedAt)))
    .returning({ id: templates.id });

  if (!restored) {
    throw AppError.notFound("Deleted template not found");
  }

  return ok(c, { restored: true, id: restored.id });
}

export async function permanentlyDeleteTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = templateParamSchema.parse(c.req.param());

  const [template] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, params.templateId), eq(templates.companyId, tenant.companyId), isNotNull(templates.deletedAt)))
    .limit(1);

  if (!template) {
    throw AppError.notFound("Deleted template not found");
  }

  await db
    .update(campaigns)
    .set({ templateId: null, updatedAt: new Date() })
    .where(and(eq(campaigns.companyId, tenant.companyId), eq(campaigns.templateId, template.id)));

  const [deleted] = await db
    .delete(templates)
    .where(and(eq(templates.id, params.templateId), eq(templates.companyId, tenant.companyId), isNotNull(templates.deletedAt)))
    .returning({ id: templates.id });

  return ok(c, { deleted: true, permanent: true, id: deleted.id });
}
