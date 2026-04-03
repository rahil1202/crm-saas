import { access, readFile } from "node:fs/promises";

import { and, count, desc, eq, ilike, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { customers, deals, documents, leads } from "@/db/schema";
import { ok } from "@/lib/api";
import { getDocumentAbsolutePath, normalizeDocumentFolder, persistDocumentFile, removeDocumentFile } from "@/lib/documents";
import { AppError } from "@/lib/errors";
import { documentParamSchema, uploadDocumentFieldsSchema } from "@/modules/documents/schema";
import type { ListDocumentsQuery } from "@/modules/documents/schema";

type DocumentEntityType = "general" | "lead" | "deal" | "customer";

async function assertValidDocumentTarget(companyId: string, entityType: DocumentEntityType, entityId?: string) {
  if (entityType === "general") {
    return;
  }

  if (!entityId) {
    throw AppError.badRequest("Entity attachments require an entityId");
  }

  if (entityType === "lead") {
    const [item] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, entityId), eq(leads.companyId, companyId), isNull(leads.deletedAt)))
      .limit(1);

    if (!item) {
      throw AppError.badRequest("Lead attachment target was not found");
    }
    return;
  }

  if (entityType === "deal") {
    const [item] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(and(eq(deals.id, entityId), eq(deals.companyId, companyId), isNull(deals.deletedAt)))
      .limit(1);

    if (!item) {
      throw AppError.badRequest("Deal attachment target was not found");
    }
    return;
  }

  const [item] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, entityId), eq(customers.companyId, companyId), isNull(customers.deletedAt)))
    .limit(1);

  if (!item) {
    throw AppError.badRequest("Customer attachment target was not found");
  }
}

export function getDocumentOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "documents",
    capabilities: ["file-upload", "lead-attachments", "deal-attachments", "folder-structure", "file-search"],
  });
}

export async function listDocuments(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListDocumentsQuery;

  const conditions = [eq(documents.companyId, tenant.companyId), isNull(documents.deletedAt)];
  if (query.q) {
    conditions.push(ilike(documents.originalName, `%${query.q}%`));
  }
  if (query.folder) {
    conditions.push(eq(documents.folder, normalizeDocumentFolder(query.folder)));
  }
  if (query.entityType) {
    conditions.push(eq(documents.entityType, query.entityType));
  }
  if (query.entityId) {
    conditions.push(eq(documents.entityId, query.entityId));
  }

  const where = and(...conditions);
  const [items, totalRows] = await Promise.all([
    db.select().from(documents).where(where).orderBy(desc(documents.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(documents).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function uploadDocument(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const formData = await c.req.raw.formData();
  const fileInput = formData.get("file");

  if (!(fileInput instanceof File)) {
    throw AppError.badRequest("A file upload is required");
  }

  if (fileInput.size <= 0) {
    throw AppError.badRequest("Uploaded file is empty");
  }

  const parsedFields = uploadDocumentFieldsSchema.parse({
    entityType: typeof formData.get("entityType") === "string" ? formData.get("entityType") : undefined,
    entityId: typeof formData.get("entityId") === "string" ? formData.get("entityId") : undefined,
    folder: typeof formData.get("folder") === "string" ? formData.get("folder") : undefined,
  });

  await assertValidDocumentTarget(tenant.companyId, parsedFields.entityType, parsedFields.entityId);

  const folder = normalizeDocumentFolder(parsedFields.folder ?? parsedFields.entityType);
  const stored = await persistDocumentFile({
    companyId: tenant.companyId,
    folder,
    originalName: fileInput.name,
    file: fileInput,
  });

  const [created] = await db
    .insert(documents)
    .values({
      companyId: tenant.companyId,
      storeId: tenant.storeId,
      entityType: parsedFields.entityType,
      entityId: parsedFields.entityId ?? null,
      folder,
      originalName: fileInput.name,
      storagePath: stored.relativePath,
      mimeType: fileInput.type || null,
      sizeBytes: fileInput.size,
      createdBy: user.id,
    })
    .returning();

  return ok(c, created, 201);
}

export async function downloadDocument(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = documentParamSchema.parse(c.req.param());

  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, params.documentId), eq(documents.companyId, tenant.companyId), isNull(documents.deletedAt)))
    .limit(1);

  if (!document) {
    throw AppError.notFound("Document not found");
  }

  const absolutePath = getDocumentAbsolutePath(document.storagePath);

  try {
    await access(absolutePath);
  } catch {
    throw AppError.notFound("Stored file is missing");
  }

  const file = await readFile(absolutePath);

  return new Response(file, {
    headers: {
      "Content-Type": document.mimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(document.originalName)}"`,
    },
  });
}

export async function deleteDocument(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = documentParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(documents)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, params.documentId), eq(documents.companyId, tenant.companyId), isNull(documents.deletedAt)))
    .returning();

  if (!deleted) {
    throw AppError.notFound("Document not found");
  }

  await removeDocumentFile(deleted.storagePath);

  return ok(c, { deleted: true, id: deleted.id });
}
