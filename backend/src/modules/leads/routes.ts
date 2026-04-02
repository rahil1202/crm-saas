import { and, asc, count, desc, eq, ilike, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "@/app/router";
import { db } from "@/db/client";
import { customers, dealActivities, deals, leadActivities, leads, partnerCompanies } from "@/db/schema";
import { ok } from "@/lib/api";
import { getCompanySettings } from "@/lib/company-settings";
import { AppError } from "@/lib/errors";
import { requireAuth, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

const listLeadsQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["new", "qualified", "proposal", "won", "lost"]).optional(),
  source: z.string().trim().optional(),
  assignedToUserId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const boardQuerySchema = z.object({
  source: z.string().trim().optional(),
});

const createLeadSchema = z.object({
  title: z.string().trim().min(1).max(180),
  fullName: z.string().trim().max(180).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
  source: z.string().trim().max(100).optional(),
  partnerCompanyId: z.string().uuid().nullable().optional(),
  status: z.enum(["new", "qualified", "proposal", "won", "lost"]).default("new"),
  score: z.number().int().min(0).max(100).default(0),
  notes: z.string().trim().max(4000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).default([]),
  assignedToUserId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
});

const updateLeadSchema = createLeadSchema.partial();

const bulkUpdateLeadSchema = z
  .object({
    leadIds: z.array(z.string().uuid()).min(1).max(200),
    status: z.enum(["new", "qualified", "proposal", "won", "lost"]).optional(),
    source: z.string().trim().max(100).nullable().optional(),
  })
  .refine((value) => value.status !== undefined || value.source !== undefined, {
    message: "At least one bulk update field is required",
    path: ["status"],
  });

const importCsvSchema = z.object({
  csv: z.string().trim().min(1).max(100_000),
});

const leadIdParamSchema = z.object({
  leadId: z.string().uuid(),
});

const convertLeadSchema = z.object({
  dealTitle: z.string().trim().min(1).max(180).optional(),
  pipeline: z.string().trim().min(1).max(100).default("default"),
  stage: z.string().trim().min(1).max(100).default("new"),
  value: z.number().int().min(0).default(0),
  createCustomer: z.boolean().default(true),
});

const timelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const timelineCreateSchema = z.object({
  type: z.enum(["note", "call", "email", "meeting", "status_change", "system"]).default("note"),
  message: z.string().trim().min(1).max(1000),
});

async function addLeadActivity(input: {
  companyId: string;
  leadId: string;
  actorUserId: string;
  type: string;
  payload: Record<string, unknown>;
}) {
  await db.insert(leadActivities).values(input);
}

async function assertValidLeadSource(companyId: string, source?: string | null) {
  if (!source) {
    return;
  }

  const settings = await getCompanySettings(companyId);
  const isConfigured = settings.leadSources.some((item) => item.key === source);

  if (!isConfigured) {
    throw AppError.badRequest("Lead source is not configured for this company");
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

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let insideQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const nextCharacter = csv[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }

      insideQuotes = !insideQuotes;
      continue;
    }

    if (character === "," && !insideQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);
      rows.push(currentRow);
      currentCell = "";
      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

function normalizeCsvHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function parseCsvTags(value?: string) {
  if (!value) {
    return [];
  }

  return value
    .split(/[|;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function parseCsvLeadRow(row: Record<string, string>) {
  const title = row.title || row.lead_title || row.company || row.full_name || row.fullname || row.name || row.email;
  const email = row.email || undefined;
  const status = row.status || "new";
  const scoreValue = row.score?.trim();
  const score = scoreValue ? Number.parseInt(scoreValue, 10) : 0;

  return createLeadSchema.parse({
    title,
    fullName: row.full_name || row.fullname || row.name || row.contact_name || undefined,
    email,
    phone: row.phone || row.mobile || undefined,
    source: row.source || row.lead_source || undefined,
    status,
    score: Number.isNaN(score) ? scoreValue : score,
    notes: row.notes || row.note || undefined,
    tags: parseCsvTags(row.tags),
  });
}

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
    db.select().from(leads).where(where).orderBy(desc(leads.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(leads).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
});

leadRoutes.get("/board", validateQuery(boardQuerySchema), async (c) => {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as z.infer<typeof boardQuerySchema>;

  const conditions = [eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)];
  if (query.source) {
    conditions.push(eq(leads.source, query.source));
  }

  const items = await db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.updatedAt), desc(leads.createdAt));

  const columns = ["new", "qualified", "proposal", "won", "lost"].map((status) => ({
    key: status,
    label: status,
    items: items.filter((lead) => lead.status === status),
  }));

  return ok(c, {
    columns,
    total: items.length,
  });
});

leadRoutes.post("/", validateJson(createLeadSchema), async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as z.infer<typeof createLeadSchema>;

  await assertValidLeadSource(tenant.companyId, body.source);
  await assertValidPartnerCompany(tenant.companyId, body.partnerCompanyId);

  const [created] = await db
    .insert(leads)
    .values({
      companyId: tenant.companyId,
      storeId: body.storeId ?? tenant.storeId ?? null,
      partnerCompanyId: body.partnerCompanyId ?? null,
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

  await addLeadActivity({
    companyId: tenant.companyId,
    leadId: created.id,
    actorUserId: user.id,
    type: "lead_created",
    payload: {
      title: created.title,
      status: created.status,
    },
  });

  return ok(c, created, 201);
});

leadRoutes.post("/bulk-update", validateJson(bulkUpdateLeadSchema), async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as z.infer<typeof bulkUpdateLeadSchema>;

  await assertValidLeadSource(tenant.companyId, body.source);

  const uniqueLeadIds = [...new Set(body.leadIds)];
  const targetLeads = await db
    .select({ id: leads.id, status: leads.status })
    .from(leads)
    .where(and(eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)));

  const matchingLeads = targetLeads.filter((lead) => uniqueLeadIds.includes(lead.id));

  if (matchingLeads.length === 0) {
    throw AppError.notFound("No matching leads found for bulk update");
  }

  for (const lead of matchingLeads) {
    const [updated] = await db
      .update(leads)
      .set({
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.source !== undefined ? { source: body.source ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(leads.id, lead.id))
      .returning({ id: leads.id, status: leads.status, source: leads.source });

    if (!updated) {
      continue;
    }

    await addLeadActivity({
      companyId: tenant.companyId,
      leadId: updated.id,
      actorUserId: user.id,
      type: "lead_bulk_updated",
      payload: {
        ...(body.status !== undefined ? { fromStatus: lead.status, toStatus: body.status } : {}),
        ...(body.source !== undefined ? { source: body.source } : {}),
      },
    });
  }

  return ok(c, {
    updatedCount: matchingLeads.length,
    leadIds: matchingLeads.map((lead) => lead.id),
  });
});

leadRoutes.post("/import-csv", validateJson(importCsvSchema), async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as z.infer<typeof importCsvSchema>;

  const parsedRows = parseCsvRows(body.csv);
  if (parsedRows.length < 2) {
    throw AppError.badRequest("CSV must include a header row and at least one data row");
  }

  const [headerRow, ...dataRows] = parsedRows;
  const normalizedHeaders = headerRow.map(normalizeCsvHeader);

  if (!normalizedHeaders.includes("title") && !normalizedHeaders.includes("full_name") && !normalizedHeaders.includes("fullname") && !normalizedHeaders.includes("name") && !normalizedHeaders.includes("email")) {
    throw AppError.badRequest("CSV requires a title, full_name, name, or email column");
  }

  if (dataRows.length > 200) {
    throw AppError.badRequest("CSV import supports up to 200 leads per request");
  }

  const createdLeadIds: string[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let index = 0; index < dataRows.length; index += 1) {
    const rowNumber = index + 2;
    const rowValues = dataRows[index] ?? [];
    const rowRecord = normalizedHeaders.reduce<Record<string, string>>((accumulator, header, headerIndex) => {
      accumulator[header] = rowValues[headerIndex] ?? "";
      return accumulator;
    }, {});

    try {
      const leadInput = parseCsvLeadRow(rowRecord);
      await assertValidLeadSource(tenant.companyId, leadInput.source);

      const [created] = await db
        .insert(leads)
        .values({
          companyId: tenant.companyId,
          storeId: tenant.storeId ?? null,
          assignedToUserId: null,
          title: leadInput.title,
          fullName: leadInput.fullName ?? null,
          email: leadInput.email ?? null,
          phone: leadInput.phone ?? null,
          source: leadInput.source ?? null,
          status: leadInput.status,
          score: leadInput.score,
          notes: leadInput.notes ?? null,
          tags: leadInput.tags,
          createdBy: user.id,
        })
        .returning({ id: leads.id, title: leads.title, status: leads.status });

      createdLeadIds.push(created.id);

      await addLeadActivity({
        companyId: tenant.companyId,
        leadId: created.id,
        actorUserId: user.id,
        type: "lead_imported",
        payload: {
          row: rowNumber,
          title: created.title,
          status: created.status,
        },
      });
    } catch (error) {
      const message =
        error instanceof AppError
          ? error.message
          : error instanceof z.ZodError
            ? error.issues[0]?.message ?? "Invalid CSV row"
            : "Invalid CSV row";

      errors.push({ row: rowNumber, message });
    }
  }

  return ok(c, {
    createdCount: createdLeadIds.length,
    attemptedCount: dataRows.length,
    errorCount: errors.length,
    leadIds: createdLeadIds,
    errors,
  });
});

leadRoutes.patch("/:leadId", validateJson(updateLeadSchema), async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = leadIdParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as z.infer<typeof updateLeadSchema>;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  const [before] = await db
    .select({ status: leads.status })
    .from(leads)
    .where(and(eq(leads.id, params.leadId), eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)))
    .limit(1);

  if (!before) {
    throw AppError.notFound("Lead not found");
  }

  if (body.source !== undefined) {
    await assertValidLeadSource(tenant.companyId, body.source);
  }
  if (body.partnerCompanyId !== undefined) {
    await assertValidPartnerCompany(tenant.companyId, body.partnerCompanyId);
  }

  const [updated] = await db
    .update(leads)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.fullName !== undefined ? { fullName: body.fullName ?? null } : {}),
      ...(body.email !== undefined ? { email: body.email ?? null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
      ...(body.source !== undefined ? { source: body.source ?? null } : {}),
      ...(body.partnerCompanyId !== undefined ? { partnerCompanyId: body.partnerCompanyId ?? null } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.score !== undefined ? { score: body.score } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(body.assignedToUserId !== undefined ? { assignedToUserId: body.assignedToUserId ?? null } : {}),
      ...(body.storeId !== undefined ? { storeId: body.storeId ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, params.leadId), eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Lead not found");
  }

  if (body.status && body.status !== before.status) {
    await addLeadActivity({
      companyId: tenant.companyId,
      leadId: updated.id,
      actorUserId: user.id,
      type: "lead_status_changed",
      payload: {
        from: before.status,
        to: body.status,
      },
    });
  }

  return ok(c, updated);
});

leadRoutes.get("/:leadId/timeline", validateQuery(timelineQuerySchema), async (c) => {
  const tenant = c.get("tenant");
  const params = leadIdParamSchema.parse(c.req.param());
  const query = c.get("validatedQuery") as z.infer<typeof timelineQuerySchema>;

  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, params.leadId), eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)))
    .limit(1);

  if (!lead) {
    throw AppError.notFound("Lead not found");
  }

  const items = await db
    .select()
    .from(leadActivities)
    .where(and(eq(leadActivities.companyId, tenant.companyId), eq(leadActivities.leadId, params.leadId)))
    .orderBy(desc(leadActivities.createdAt), asc(leadActivities.id))
    .limit(query.limit)
    .offset(query.offset);

  return ok(c, { items, limit: query.limit, offset: query.offset });
});

leadRoutes.post("/:leadId/timeline", validateJson(timelineCreateSchema), async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = leadIdParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as z.infer<typeof timelineCreateSchema>;

  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, params.leadId), eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)))
    .limit(1);

  if (!lead) {
    throw AppError.notFound("Lead not found");
  }

  const [created] = await db
    .insert(leadActivities)
    .values({
      companyId: tenant.companyId,
      leadId: params.leadId,
      actorUserId: user.id,
      type: body.type,
      payload: { message: body.message },
    })
    .returning();

  return ok(c, created, 201);
});

leadRoutes.delete("/:leadId", async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = leadIdParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(leads)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(leads.id, params.leadId), eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)))
    .returning({ id: leads.id });

  if (!deleted) {
    throw AppError.notFound("Lead not found");
  }

  await addLeadActivity({
    companyId: tenant.companyId,
    leadId: deleted.id,
    actorUserId: user.id,
    type: "lead_deleted",
    payload: {},
  });

  return ok(c, { deleted: true, id: deleted.id });
});

leadRoutes.post("/:leadId/convert", validateJson(convertLeadSchema), async (c) => {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = leadIdParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as z.infer<typeof convertLeadSchema>;

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, params.leadId), eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)))
    .limit(1);

  if (!lead) {
    throw AppError.notFound("Lead not found");
  }

  const [existingDeal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.leadId, lead.id), eq(deals.companyId, tenant.companyId), isNull(deals.deletedAt)))
    .limit(1);

  if (existingDeal) {
    throw AppError.conflict("Lead has already been converted to a deal", { dealId: existingDeal.id });
  }

  let customerId: string | null = null;
  if (body.createCustomer) {
    const [existingCustomer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.leadId, lead.id), eq(customers.companyId, tenant.companyId), isNull(customers.deletedAt)))
      .limit(1);

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const [createdCustomer] = await db
        .insert(customers)
        .values({
          companyId: tenant.companyId,
          storeId: lead.storeId,
          leadId: lead.id,
          fullName: lead.fullName ?? lead.title,
          email: lead.email,
          phone: lead.phone,
          tags: lead.tags,
          notes: lead.notes,
          createdBy: user.id,
        })
        .returning({ id: customers.id });

      customerId = createdCustomer?.id ?? null;
    }
  }

  const [createdDeal] = await db
    .insert(deals)
    .values({
      companyId: tenant.companyId,
      storeId: lead.storeId,
      leadId: lead.id,
      customerId,
      assignedToUserId: lead.assignedToUserId,
      title: body.dealTitle ?? `Converted: ${lead.title}`,
      pipeline: body.pipeline,
      stage: body.stage,
      status: "open",
      value: body.value,
      notes: lead.notes,
      createdBy: user.id,
    })
    .returning();

  await db.insert(dealActivities).values({
    companyId: tenant.companyId,
    dealId: createdDeal.id,
    actorUserId: user.id,
    type: "deal_created",
    payload: {
      source: "lead_conversion",
      leadId: lead.id,
    },
  });

  const leadNextStatus = lead.status === "new" ? "qualified" : lead.status;
  await db
    .update(leads)
    .set({
      status: leadNextStatus,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, lead.id));

  await addLeadActivity({
    companyId: tenant.companyId,
    leadId: lead.id,
    actorUserId: user.id,
    type: "lead_converted",
    payload: {
      dealId: createdDeal.id,
      customerId,
    },
  });

  return ok(c, {
    leadId: lead.id,
    dealId: createdDeal.id,
    customerId,
    converted: true,
  });
});
