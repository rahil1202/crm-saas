import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { customers, deals, documents, leads, profiles } from "@/db/schema";
import { ok } from "@/lib/api";
import { normalizeDocumentFolder, persistDocumentFile, readDocumentFile, removeDocumentFile } from "@/lib/documents";
import { AppError } from "@/lib/errors";
import { documentParamSchema, uploadDocumentFieldsSchema } from "@/modules/documents/schema";
import type {
  BulkDeleteDocumentsInput,
  ListDocumentAssociationOptionsQuery,
  ListDocumentsQuery,
  UpdateDocumentInput,
} from "@/modules/documents/schema";

type DocumentEntityType = "general" | "lead" | "deal" | "customer";

function mapEntityLabel(input: {
  entityType: DocumentEntityType;
  leadTitle: string | null;
  leadSubtitle: string | null;
  dealTitle: string | null;
  dealSubtitle: string | null;
  customerName: string | null;
  customerSubtitle: string | null;
}) {
  if (input.entityType === "lead") {
    return {
      entityLabel: input.leadTitle,
      entitySubtitle: input.leadSubtitle,
    };
  }

  if (input.entityType === "deal") {
    return {
      entityLabel: input.dealTitle,
      entitySubtitle: input.dealSubtitle,
    };
  }

  if (input.entityType === "customer") {
    return {
      entityLabel: input.customerName,
      entitySubtitle: input.customerSubtitle,
    };
  }

  return {
    entityLabel: "Unlinked",
    entitySubtitle: null,
  };
}

async function assertValidDocumentTarget(companyId: string, entityType: DocumentEntityType, entityId?: string | null) {
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

function mapDocumentRow(row: {
  id: string;
  entityType: DocumentEntityType;
  entityId: string | null;
  folder: string;
  originalName: string;
  remark: string | null;
  mimeType: string | null;
  sizeBytes: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  storageProvider: string;
  storageBucket: string;
  storageObjectPath: string;
  storagePath: string;
  uploadedByName: string | null;
  uploadedByEmail: string | null;
  leadTitle: string | null;
  leadSubtitle: string | null;
  dealTitle: string | null;
  dealSubtitle: string | null;
  customerName: string | null;
  customerSubtitle: string | null;
}) {
  const association = mapEntityLabel({
    entityType: row.entityType,
    leadTitle: row.leadTitle,
    leadSubtitle: row.leadSubtitle,
    dealTitle: row.dealTitle,
    dealSubtitle: row.dealSubtitle,
    customerName: row.customerName,
    customerSubtitle: row.customerSubtitle,
  });

  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    folder: row.folder,
    originalName: row.originalName,
    remark: row.remark,
    entityLabel: association.entityLabel,
    entitySubtitle: association.entitySubtitle,
    uploadedByUserId: row.createdBy,
    uploadedByName: row.uploadedByName ?? row.uploadedByEmail ?? "Unknown",
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    storageProvider: row.storageProvider,
    storageBucket: row.storageBucket,
    storageObjectPath: row.storageObjectPath,
  };
}

async function findDocumentOrFail(companyId: string, documentId: string) {
  const [document] = await db
    .select({
      id: documents.id,
      entityType: documents.entityType,
      entityId: documents.entityId,
      folder: documents.folder,
      originalName: documents.originalName,
      remark: documents.remark,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      createdBy: documents.createdBy,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      storageProvider: documents.storageProvider,
      storageBucket: documents.storageBucket,
      storageObjectPath: documents.storageObjectPath,
      storagePath: documents.storagePath,
      uploadedByName: profiles.fullName,
      uploadedByEmail: profiles.email,
      leadTitle: leads.title,
      leadSubtitle: leads.fullName,
      dealTitle: deals.title,
      dealSubtitle: deals.stage,
      customerName: customers.fullName,
      customerSubtitle: customers.email,
    })
    .from(documents)
    .leftJoin(profiles, eq(profiles.id, documents.createdBy))
    .leftJoin(leads, and(eq(documents.entityType, "lead"), eq(leads.id, documents.entityId), eq(leads.companyId, companyId), isNull(leads.deletedAt)))
    .leftJoin(deals, and(eq(documents.entityType, "deal"), eq(deals.id, documents.entityId), eq(deals.companyId, companyId), isNull(deals.deletedAt)))
    .leftJoin(customers, and(eq(documents.entityType, "customer"), eq(customers.id, documents.entityId), eq(customers.companyId, companyId), isNull(customers.deletedAt)))
    .where(and(eq(documents.id, documentId), eq(documents.companyId, companyId), isNull(documents.deletedAt)))
    .limit(1);

  if (!document) {
    throw AppError.notFound("Document not found");
  }

  return document;
}

function shouldOpenInline(mimeType: string | null) {
  if (!mimeType) {
    return false;
  }
  const normalized = mimeType.toLowerCase();
  return normalized === "application/pdf"
    || normalized === "application/msword"
    || normalized === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export function getDocumentOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "documents",
    capabilities: ["file-upload", "lead-attachments", "deal-attachments", "folder-structure", "file-search", "bulk-delete", "preview-open"],
  });
}

export async function listDocuments(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListDocumentsQuery;

  const searchTerm = query.q?.trim();

  const where = and(
    eq(documents.companyId, tenant.companyId),
    isNull(documents.deletedAt),
    query.folder ? eq(documents.folder, normalizeDocumentFolder(query.folder)) : undefined,
    query.entityType ? eq(documents.entityType, query.entityType) : undefined,
    query.entityId ? eq(documents.entityId, query.entityId) : undefined,
    searchTerm
      ? or(ilike(documents.originalName, `%${searchTerm}%`), ilike(documents.remark, `%${searchTerm}%`))
      : undefined,
  );

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: documents.id,
        entityType: documents.entityType,
        entityId: documents.entityId,
        folder: documents.folder,
        originalName: documents.originalName,
        remark: documents.remark,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        createdBy: documents.createdBy,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        storageProvider: documents.storageProvider,
        storageBucket: documents.storageBucket,
        storageObjectPath: documents.storageObjectPath,
        storagePath: documents.storagePath,
        uploadedByName: profiles.fullName,
        uploadedByEmail: profiles.email,
        leadTitle: leads.title,
        leadSubtitle: leads.fullName,
        dealTitle: deals.title,
        dealSubtitle: deals.stage,
        customerName: customers.fullName,
        customerSubtitle: customers.email,
      })
      .from(documents)
      .leftJoin(profiles, eq(profiles.id, documents.createdBy))
      .leftJoin(leads, and(eq(documents.entityType, "lead"), eq(leads.id, documents.entityId), eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)))
      .leftJoin(deals, and(eq(documents.entityType, "deal"), eq(deals.id, documents.entityId), eq(deals.companyId, tenant.companyId), isNull(deals.deletedAt)))
      .leftJoin(customers, and(eq(documents.entityType, "customer"), eq(customers.id, documents.entityId), eq(customers.companyId, tenant.companyId), isNull(customers.deletedAt)))
      .where(where)
      .orderBy(desc(documents.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: count() }).from(documents).where(where),
  ]);

  return ok(c, {
    items: items.map(mapDocumentRow),
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function getDocumentById(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = documentParamSchema.parse(c.req.param());

  const document = await findDocumentOrFail(tenant.companyId, params.documentId);
  return ok(c, mapDocumentRow(document));
}

export async function uploadDocument(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const formData = await c.req.raw.formData();

  const fileInputs = formData.getAll("files");
  const fallbackFile = formData.get("file");
  const files = (fileInputs.length > 0 ? fileInputs : fallbackFile ? [fallbackFile] : []).filter((item): item is File => item instanceof File);

  if (files.length === 0) {
    throw AppError.badRequest("At least one file upload is required");
  }

  if (files.some((file) => file.size <= 0)) {
    throw AppError.badRequest("Uploaded files cannot be empty");
  }

  const fields = {
    entityType: typeof formData.get("entityType") === "string" ? formData.get("entityType") : undefined,
    entityId: typeof formData.get("entityId") === "string" ? formData.get("entityId") : undefined,
    folder: typeof formData.get("folder") === "string" ? formData.get("folder") : undefined,
    remark: typeof formData.get("remark") === "string" ? formData.get("remark") : undefined,
  };

  const parsed = uploadDocumentFieldsSchema.parse(fields);

  await assertValidDocumentTarget(tenant.companyId, parsed.entityType, parsed.entityId ?? null);

  const folder = normalizeDocumentFolder(parsed.folder ?? parsed.entityType);
  const uploaded: Array<{ provider: "supabase"; bucket: string; objectPath: string }> = [];

  try {
    for (const file of files) {
      const stored = await persistDocumentFile({
        companyId: tenant.companyId,
        folder,
        originalName: file.name,
        file,
      });
      uploaded.push({ provider: stored.provider, bucket: stored.bucket, objectPath: stored.objectPath });
    }

    const created = await db
      .insert(documents)
      .values(
        files.map((file, index) => ({
          companyId: tenant.companyId,
          storeId: tenant.storeId,
          entityType: parsed.entityType,
          entityId: parsed.entityId ?? null,
          folder,
          originalName: file.name,
          remark: parsed.remark?.trim() || null,
          storagePath: uploaded[index]!.objectPath,
          storageProvider: uploaded[index]!.provider,
          storageBucket: uploaded[index]!.bucket,
          storageObjectPath: uploaded[index]!.objectPath,
          mimeType: file.type || null,
          sizeBytes: file.size,
          createdBy: user.id,
        })),
      )
      .returning();

    return ok(c, {
      items: created,
      createdCount: created.length,
    }, 201);
  } catch (error) {
    await Promise.all(
      uploaded.map((item) =>
        removeDocumentFile({
          storageProvider: item.provider,
          storageBucket: item.bucket,
          storageObjectPath: item.objectPath,
          storagePath: item.objectPath,
        }).catch(() => undefined),
      ),
    );
    throw error;
  }
}

export async function updateDocument(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = documentParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateDocumentInput;

  const existing = await findDocumentOrFail(tenant.companyId, params.documentId);

  const nextEntityType = body.entityType ?? existing.entityType;
  const nextEntityId = body.entityType
    ? (body.entityType === "general" ? null : body.entityId ?? null)
    : (body.entityId === undefined ? existing.entityId : body.entityId);

  if (!body.entityType && body.entityId && existing.entityType === "general") {
    throw AppError.badRequest("Cannot set entityId for a general document without changing entityType");
  }

  await assertValidDocumentTarget(tenant.companyId, nextEntityType, nextEntityId);

  const [updated] = await db
    .update(documents)
    .set({
      entityType: nextEntityType,
      entityId: nextEntityId,
      folder: body.folder ? normalizeDocumentFolder(body.folder) : existing.folder,
      remark: body.remark === undefined ? existing.remark : body.remark,
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, params.documentId), eq(documents.companyId, tenant.companyId), isNull(documents.deletedAt)))
    .returning({ id: documents.id });

  if (!updated) {
    throw AppError.notFound("Document not found");
  }

  const fresh = await findDocumentOrFail(tenant.companyId, updated.id);
  return ok(c, mapDocumentRow(fresh));
}

export async function downloadDocument(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = documentParamSchema.parse(c.req.param());
  const document = await findDocumentOrFail(tenant.companyId, params.documentId);

  const file = await readDocumentFile({
    storageProvider: document.storageProvider,
    storageBucket: document.storageBucket,
    storageObjectPath: document.storageObjectPath,
    storagePath: document.storagePath,
  });

  return new Response(file, {
    headers: {
      "Content-Type": document.mimeType ?? "application/octet-stream",
      "Content-Length": String(file.byteLength),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(document.originalName)}"`,
    },
  });
}

export async function openDocument(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = documentParamSchema.parse(c.req.param());
  const document = await findDocumentOrFail(tenant.companyId, params.documentId);

  const file = await readDocumentFile({
    storageProvider: document.storageProvider,
    storageBucket: document.storageBucket,
    storageObjectPath: document.storageObjectPath,
    storagePath: document.storagePath,
  });

  const inline = shouldOpenInline(document.mimeType);

  return new Response(file, {
    headers: {
      "Content-Type": document.mimeType ?? "application/octet-stream",
      "Content-Length": String(file.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(document.originalName)}"`,
      "X-Document-Preview": inline ? "inline" : "download",
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

  await removeDocumentFile({
    storageProvider: deleted.storageProvider,
    storageBucket: deleted.storageBucket,
    storageObjectPath: deleted.storageObjectPath,
    storagePath: deleted.storagePath,
  });

  return ok(c, { deleted: true, id: deleted.id });
}

export async function bulkDeleteDocuments(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as BulkDeleteDocumentsInput;

  const existing = await db
    .select()
    .from(documents)
    .where(and(eq(documents.companyId, tenant.companyId), isNull(documents.deletedAt), inArray(documents.id, body.ids)));

  if (existing.length !== body.ids.length) {
    throw AppError.badRequest("One or more documents were not found");
  }

  await db
    .update(documents)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(documents.companyId, tenant.companyId), isNull(documents.deletedAt), inArray(documents.id, body.ids)));

  await Promise.all(
    existing.map((document) =>
      removeDocumentFile({
        storageProvider: document.storageProvider,
        storageBucket: document.storageBucket,
        storageObjectPath: document.storageObjectPath,
        storagePath: document.storagePath,
      }).catch(() => undefined),
    ),
  );

  return ok(c, {
    deleted: true,
    count: existing.length,
    ids: existing.map((item) => item.id),
  });
}

export async function listDocumentAssociationOptions(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListDocumentAssociationOptionsQuery;
  const searchTerm = query.q?.trim();

  if (query.entityType === "lead") {
    const rows = await db
      .select({ id: leads.id, label: leads.title, subtitle: leads.fullName })
      .from(leads)
      .where(
        and(
          eq(leads.companyId, tenant.companyId),
          isNull(leads.deletedAt),
          searchTerm
            ? or(ilike(leads.title, `%${searchTerm}%`), ilike(leads.fullName, `%${searchTerm}%`), ilike(leads.email, `%${searchTerm}%`))
            : undefined,
        ),
      )
      .orderBy(asc(leads.title), asc(leads.createdAt))
      .limit(query.limit);

    return ok(c, { items: rows.map((row) => ({ entityType: "lead", entityId: row.id, entityLabel: row.label, entitySubtitle: row.subtitle })) });
  }

  if (query.entityType === "deal") {
    const rows = await db
      .select({ id: deals.id, label: deals.title, subtitle: deals.stage })
      .from(deals)
      .where(
        and(
          eq(deals.companyId, tenant.companyId),
          isNull(deals.deletedAt),
          searchTerm
            ? or(ilike(deals.title, `%${searchTerm}%`), ilike(deals.stage, `%${searchTerm}%`), ilike(deals.dealType, `%${searchTerm}%`))
            : undefined,
        ),
      )
      .orderBy(asc(deals.title), asc(deals.createdAt))
      .limit(query.limit);

    return ok(c, { items: rows.map((row) => ({ entityType: "deal", entityId: row.id, entityLabel: row.label, entitySubtitle: row.subtitle })) });
  }

  const rows = await db
    .select({ id: customers.id, label: customers.fullName, subtitle: customers.email })
    .from(customers)
    .where(
      and(
        eq(customers.companyId, tenant.companyId),
        isNull(customers.deletedAt),
        searchTerm
          ? or(ilike(customers.fullName, `%${searchTerm}%`), ilike(customers.email, `%${searchTerm}%`), ilike(customers.phone, `%${searchTerm}%`))
          : undefined,
      ),
    )
    .orderBy(asc(customers.fullName), asc(customers.createdAt))
    .limit(query.limit);

  return ok(c, { items: rows.map((row) => ({ entityType: "customer", entityId: row.id, entityLabel: row.label, entitySubtitle: row.subtitle })) });
}
