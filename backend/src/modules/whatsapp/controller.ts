import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { whatsappTemplates, whatsappWorkspaces } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { listWhatsappTemplates, listWhatsappWorkspaces, upsertWhatsappTemplate, upsertWhatsappWorkspace } from "@/lib/whatsapp-workspace";
import { whatsappTemplateParamSchema, whatsappWorkspaceParamSchema } from "@/modules/whatsapp/schema";
import type {
  CreateWhatsappTemplateInput,
  CreateWhatsappWorkspaceInput,
  ListWhatsappTemplatesQuery,
  ListWhatsappWorkspacesQuery,
  SyncWhatsappTemplateInput,
  UpdateWhatsappTemplateInput,
  UpdateWhatsappWorkspaceInput,
} from "@/modules/whatsapp/schema";

export function getWhatsappOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "whatsapp",
    capabilities: ["workspaces", "phone-number-mapping", "template-management", "inbox-actions"],
  });
}

export async function getWhatsappWorkspaces(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListWhatsappWorkspacesQuery;
  const items = await listWhatsappWorkspaces(tenant.companyId);
  const filtered = query.q ? items.filter((item) => item.name.toLowerCase().includes(query.q!.toLowerCase())) : items;
  return ok(c, { items: filtered });
}

export async function createWhatsappWorkspace(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateWhatsappWorkspaceInput;

  const workspace = await upsertWhatsappWorkspace({
    companyId: tenant.companyId,
    createdBy: user.id,
    ...body,
  });

  return ok(c, workspace, 201);
}

export async function updateWhatsappWorkspace(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappWorkspaceParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateWhatsappWorkspaceInput;

  const [current] = await db
    .select()
    .from(whatsappWorkspaces)
    .where(and(eq(whatsappWorkspaces.companyId, tenant.companyId), eq(whatsappWorkspaces.id, params.workspaceId), isNull(whatsappWorkspaces.deletedAt)))
    .limit(1);
  if (!current) {
    throw AppError.notFound("WhatsApp workspace not found");
  }

  const [updated] = await db
    .update(whatsappWorkspaces)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.phoneNumberId !== undefined ? { phoneNumberId: body.phoneNumberId } : {}),
      ...(body.businessAccountId !== undefined ? { businessAccountId: body.businessAccountId ?? null } : {}),
      ...(body.accessToken !== undefined ? { accessToken: body.accessToken ?? null } : {}),
      ...(body.verifyToken !== undefined ? { verifyToken: body.verifyToken ?? null } : {}),
      ...(body.appSecret !== undefined ? { appSecret: body.appSecret ?? null } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.isVerified !== undefined ? { isVerified: body.isVerified } : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      updatedAt: new Date(),
    })
    .where(eq(whatsappWorkspaces.id, current.id))
    .returning();

  return ok(c, updated);
}

export async function deleteWhatsappWorkspace(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappWorkspaceParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(whatsappWorkspaces)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      isActive: false,
    })
    .where(and(eq(whatsappWorkspaces.companyId, tenant.companyId), eq(whatsappWorkspaces.id, params.workspaceId), isNull(whatsappWorkspaces.deletedAt)))
    .returning({ id: whatsappWorkspaces.id });

  if (!deleted) {
    throw AppError.notFound("WhatsApp workspace not found");
  }
  return ok(c, { deleted: true, id: deleted.id });
}

export async function getWhatsappTemplates(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListWhatsappTemplatesQuery;
  const items = await listWhatsappTemplates(tenant.companyId, query.q);
  return ok(c, { items });
}

export async function createWhatsappTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateWhatsappTemplateInput;

  const item = await upsertWhatsappTemplate({
    companyId: tenant.companyId,
    createdBy: user.id,
    ...body,
  });

  return ok(c, item, 201);
}

export async function syncWhatsappTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappTemplateParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as SyncWhatsappTemplateInput;

  const [template] = await db
    .update(whatsappTemplates)
    .set({
      status: body.status,
      providerTemplateId: body.providerTemplateId ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(whatsappTemplates.companyId, tenant.companyId), eq(whatsappTemplates.id, params.templateId), isNull(whatsappTemplates.deletedAt)))
    .returning();

  if (!template) {
    throw AppError.notFound("WhatsApp template not found");
  }

  return ok(c, template);
}

export async function updateWhatsappTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappTemplateParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateWhatsappTemplateInput;

  const [updated] = await db
    .update(whatsappTemplates)
    .set({
      ...(body.workspaceId !== undefined ? { workspaceId: body.workspaceId ?? null } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.category !== undefined ? { category: body.category ?? null } : {}),
      ...(body.language !== undefined ? { language: body.language } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.variables !== undefined ? { variables: body.variables } : {}),
      ...(body.providerTemplateId !== undefined ? { providerTemplateId: body.providerTemplateId ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(whatsappTemplates.companyId, tenant.companyId), eq(whatsappTemplates.id, params.templateId), isNull(whatsappTemplates.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("WhatsApp template not found");
  }

  return ok(c, updated);
}

export async function deleteWhatsappTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappTemplateParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(whatsappTemplates)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(whatsappTemplates.companyId, tenant.companyId), eq(whatsappTemplates.id, params.templateId), isNull(whatsappTemplates.deletedAt)))
    .returning({ id: whatsappTemplates.id });

  if (!deleted) {
    throw AppError.notFound("WhatsApp template not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
}
