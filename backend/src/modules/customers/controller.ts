import { and, asc, count, desc, eq, gte, ilike, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { campaignCustomers, campaigns, companyMemberships, customers, deals, leads, profiles, tasks } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { customerParamSchema } from "@/modules/customers/schema";
import type { CreateCustomerInput, ImportCustomerCsvInput, ListCustomersQuery, UpdateCustomerInput } from "@/modules/customers/schema";

async function assertAssignableUser(companyId: string, assignedToUserId?: string | null) {
  if (!assignedToUserId) {
    return;
  }

  const [membership] = await db
    .select({ membershipId: companyMemberships.id })
    .from(companyMemberships)
    .where(
      and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.userId, assignedToUserId),
        eq(companyMemberships.status, "active"),
      ),
    )
    .limit(1);

  if (!membership) {
    throw AppError.badRequest("Assigned user must belong to the current company");
  }
}

function detectDelimitedSeparator(text: string) {
  const sampleLine = text
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0)
    ?? "";

  const tabCount = (sampleLine.match(/\t/g) ?? []).length;
  const commaCount = (sampleLine.match(/,/g) ?? []).length;
  const semicolonCount = (sampleLine.match(/;/g) ?? []).length;

  if (tabCount >= commaCount && tabCount >= semicolonCount && tabCount > 0) {
    return "\t";
  }

  if (semicolonCount > commaCount) {
    return ";";
  }

  return ",";
}

function parseDelimitedRows(text: string) {
  const delimiter = detectDelimitedSeparator(text);
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }

      insideQuotes = !insideQuotes;
      continue;
    }

    if (character === delimiter && !insideQuotes) {
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

function parsePdfTextToRows(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    if (line.includes("\t")) {
      return line.split("\t").map((cell) => cell.trim());
    }

    if (line.includes(",")) {
      return line.split(",").map((cell) => cell.trim());
    }

    if (line.includes("  ")) {
      return line.split(/\s{2,}/).map((cell) => cell.trim());
    }

    return [line];
  });
}

function buildCustomerRow(row: Record<string, string>) {
  const firstName = row.first_name || row.firstname || "";
  const lastName = row.last_name || row.lastname || "";
  const fullName = row.full_name || row.fullname || row.name || row.contact_name || [firstName, lastName].filter(Boolean).join(" ") || row.email;

  if (!fullName) {
    throw AppError.badRequest("CSV requires a full_name, name, contact_name, or email column");
  }

  return {
    fullName,
    email: row.email || null,
    phone: row.phone || row.mobile || null,
    tags: parseCsvTags(row.tags),
    notes: withDefaultCallFields(row.notes || row.note || null),
  };
}

function withDefaultCallFields(notes: string | null | undefined) {
  const raw = (notes ?? "").trim();
  const lines = raw ? raw.split(/\r?\n/) : [];
  const hasCallRemark = lines.some((line) => /^call remark:/i.test(line.trim()));
  const hasCallStatus = lines.some((line) => /^call status:/i.test(line.trim()));

  if (!hasCallRemark) {
    lines.push("Call Remark: Not Started");
  }

  if (!hasCallStatus) {
    lines.push("Call Status: Not Started");
  }

  return lines.join("\n").trim();
}

function rowsToPreview(rows: string[][]) {
  if (rows.length < 2) {
    throw AppError.badRequest("Import file must include a header row and at least one data row");
  }

  const [headerRow, ...dataRows] = rows;
  const normalizedHeaders = headerRow.map(normalizeCsvHeader);

  const preview = dataRows.slice(0, 50).map((rowValues, index) => {
    const rowRecord = normalizedHeaders.reduce<Record<string, string>>((accumulator, header, headerIndex) => {
      accumulator[header] = rowValues[headerIndex] ?? "";
      return accumulator;
    }, {});

    const customer = buildCustomerRow(rowRecord);
    return {
      row: index + 2,
      ...customer,
    };
  });

  return {
    headers: ["full_name", "email", "phone", "tags", "notes"],
    rows: preview,
    totalRows: dataRows.length,
  };
}

async function readCustomerImportRows(c: Context<AppEnv>) {
  const contentType = c.req.header("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await c.req.json()) as { text?: string };
    if (!body.text) {
      throw AppError.badRequest("Import preview text is required");
    }

    return parseDelimitedRows(body.text);
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") ?? "sheet");

    if (!(file instanceof File)) {
      throw AppError.badRequest("Import preview file is required");
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (mode === "pdf") {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return parsePdfTextToRows(result.text);
      } finally {
        await parser.destroy();
      }
    }

    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      throw AppError.badRequest("Sheet file does not contain any sheets");
    }

    const sheet = workbook.Sheets[firstSheet];
    const jsonRows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, raw: false }) as string[][];
    return jsonRows.map((row) => row.map((cell) => String(cell ?? "").trim()));
  }

  throw AppError.badRequest("Unsupported import preview payload");
}

async function importCustomerRows(c: Context<AppEnv>, rows: string[][]) {
  const tenant = c.get("tenant");
  const user = c.get("user");

  if (rows.length < 2) {
    throw AppError.badRequest("CSV must include a header row and at least one data row");
  }

  const [headerRow, ...dataRows] = rows;
  const normalizedHeaders = headerRow.map(normalizeCsvHeader);

  if (dataRows.length > 200) {
    throw AppError.badRequest("CSV import supports up to 200 customers per request");
  }

  const createdCustomerIds: string[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let index = 0; index < dataRows.length; index += 1) {
    const rowNumber = index + 2;
    const rowValues = dataRows[index] ?? [];
    const rowRecord = normalizedHeaders.reduce<Record<string, string>>((accumulator, header, headerIndex) => {
      accumulator[header] = rowValues[headerIndex] ?? "";
      return accumulator;
    }, {});

    try {
      const customerInput = buildCustomerRow(rowRecord);

      const [created] = await db
        .insert(customers)
        .values({
          companyId: tenant.companyId,
          storeId: tenant.storeId ?? null,
          assignedToUserId: user.id,
          fullName: customerInput.fullName,
          email: customerInput.email ?? null,
          phone: customerInput.phone ?? null,
          tags: customerInput.tags,
          notes: withDefaultCallFields(customerInput.notes),
          createdBy: user.id,
        })
        .returning({ id: customers.id });

      if (created?.id) {
        createdCustomerIds.push(created.id);
      }
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
    createdCount: createdCustomerIds.length,
    attemptedCount: dataRows.length,
    errorCount: errors.length,
    customerIds: createdCustomerIds,
    errors,
  });
}

export async function listCustomers(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListCustomersQuery;

  const conditions = [
    eq(customers.companyId, tenant.companyId),
    query.lifecycle === "deleted" ? isNotNull(customers.deletedAt) : isNull(customers.deletedAt),
  ];
  if (query.q) {
    const queryText = `%${query.q}%`;
    conditions.push(
      sql<boolean>`(
        coalesce(${customers.fullName}, '') ILIKE ${queryText}
        OR coalesce(${customers.email}, '') ILIKE ${queryText}
        OR coalesce(${customers.phone}, '') ILIKE ${queryText}
        OR coalesce(${customers.notes}, '') ILIKE ${queryText}
        OR coalesce(array_to_string(${customers.tags}, ', '), '') ILIKE ${queryText}
      )`,
    );
  }
  if (query.email) {
    conditions.push(eq(customers.email, query.email));
  }
  if (query.assignedToUserId) {
    conditions.push(eq(customers.assignedToUserId, query.assignedToUserId));
  }
  if (query.title) {
    conditions.push(ilike(sql<string>`coalesce(${customers.notes}, '')`, `%Title: ${query.title}%`));
  }
  if (query.callRemark) {
    conditions.push(ilike(sql<string>`coalesce(${customers.notes}, '')`, `%Call Remark: ${query.callRemark}%`));
  }
  if (query.callStatus) {
    conditions.push(ilike(sql<string>`coalesce(${customers.notes}, '')`, `%Call Status: ${query.callStatus}%`));
  }
  if (query.country) {
    conditions.push(ilike(sql<string>`coalesce(${customers.notes}, '')`, `%Country: ${query.country}%`));
  }
  if (query.source) {
    conditions.push(ilike(sql<string>`coalesce(${customers.notes}, '')`, `%Source: ${query.source}%`));
  }
  if (query.productTags) {
    conditions.push(ilike(sql<string>`coalesce(array_to_string(${customers.tags}, ', '), '')`, `%${query.productTags}%`));
  }
  if (query.phone) {
    conditions.push(ilike(customers.phone, `%${query.phone}%`));
  }
  if (query.createdFrom) {
    conditions.push(gte(customers.createdAt, new Date(`${query.createdFrom}T00:00:00.000Z`)));
  }
  if (query.createdTo) {
    conditions.push(lte(customers.createdAt, new Date(`${query.createdTo}T23:59:59.999Z`)));
  }

  const where = and(...conditions);
  const sortExpression =
    query.sortBy === "name"
      ? customers.fullName
      : query.sortBy === "email"
        ? customers.email
        : query.sortBy === "mobile"
          ? customers.phone
          : query.sortBy === "title"
            ? sql<string>`coalesce(substring(${customers.notes} from 'Title: ([^\\n]+)'), '')`
            : query.sortBy === "remarks"
              ? sql<string>`coalesce(${customers.notes}, '')`
              : query.sortBy === "callRemark"
                ? sql<string>`coalesce(substring(${customers.notes} from 'Call Remark: ([^\\n]+)'), '')`
                : query.sortBy === "callStatus"
                  ? sql<string>`coalesce(substring(${customers.notes} from 'Call Status: ([^\\n]+)'), '')`
                  : query.sortBy === "productTags"
                    ? sql<string>`coalesce(array_to_string(${customers.tags}, ', '), '')`
                    : query.sortBy === "country"
                      ? sql<string>`coalesce(substring(${customers.notes} from 'Country: ([^\\n]+)'), '')`
                      : query.sortBy === "source"
                        ? sql<string>`coalesce(substring(${customers.notes} from 'Source: ([^\\n]+)'), '')`
                        : query.sortBy === "status"
                          ? sql<string>`coalesce(substring(${customers.notes} from 'Status: ([^\\n]+)'), '')`
                          : query.sortBy === "createdAt"
                            ? customers.createdAt
                            : customers.updatedAt;
  const sortDirection = query.sortDir === "asc" ? asc : desc;

  const isPrimarySortUpdatedAt = query.sortBy === "updatedAt";

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(where)
      .orderBy(
        sortDirection(sortExpression),
        ...(isPrimarySortUpdatedAt ? [] : [desc(customers.updatedAt)]),
        desc(customers.createdAt),
      )
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: count() }).from(customers).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function getCustomerHistory(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = customerParamSchema.parse(c.req.param());

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, params.customerId), eq(customers.companyId, tenant.companyId), isNull(customers.deletedAt)))
    .limit(1);

  if (!customer) {
    throw AppError.notFound("Customer not found");
  }

  const [lead, customerDeals, customerTasks, customerCampaigns, creatorProfile] = await Promise.all([
    customer.leadId
      ? db
          .select()
          .from(leads)
          .where(and(eq(leads.id, customer.leadId), eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)))
          .limit(1)
          .then((items) => items[0] ?? null)
      : Promise.resolve(null),
    db
      .select()
      .from(deals)
      .where(and(eq(deals.companyId, tenant.companyId), eq(deals.customerId, customer.id), isNull(deals.deletedAt)))
      .orderBy(desc(deals.createdAt)),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.companyId, tenant.companyId), eq(tasks.customerId, customer.id), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.createdAt)),
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        channel: campaigns.channel,
        status: campaigns.status,
        scheduledAt: campaigns.scheduledAt,
        createdAt: campaigns.createdAt,
      })
      .from(campaignCustomers)
      .innerJoin(campaigns, eq(campaigns.id, campaignCustomers.campaignId))
      .where(and(eq(campaignCustomers.companyId, tenant.companyId), eq(campaignCustomers.customerId, customer.id), isNull(campaigns.deletedAt)))
      .orderBy(desc(campaigns.createdAt)),
    db
      .select({ id: profiles.id, fullName: profiles.fullName, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, customer.createdBy))
      .limit(1)
      .then((items) => items[0] ?? null),
  ]);

  return ok(c, {
    customer,
    creator: creatorProfile,
    lead,
    deals: customerDeals,
    tasks: customerTasks,
    campaigns: customerCampaigns,
    summary: {
      openDeals: customerDeals.filter((deal) => deal.status === "open").length,
      wonDeals: customerDeals.filter((deal) => deal.status === "won").length,
      pendingTasks: customerTasks.filter((task) => task.status !== "done").length,
      completedTasks: customerTasks.filter((task) => task.status === "done").length,
      campaigns: customerCampaigns.length,
    },
  });
}

export async function createCustomer(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateCustomerInput;

  await assertAssignableUser(tenant.companyId, body.assignedToUserId ?? user.id);

  const [created] = await db
    .insert(customers)
    .values({
      companyId: tenant.companyId,
      storeId: body.storeId ?? tenant.storeId ?? null,
      leadId: body.leadId ?? null,
      assignedToUserId: body.assignedToUserId ?? user.id,
      fullName: body.fullName,
      email: body.email ?? null,
      phone: body.phone ?? null,
      tags: body.tags,
      notes: withDefaultCallFields(body.notes),
      createdBy: user.id,
    })
    .returning();

  return ok(c, created, 201);
}

export async function importCustomersFromCsv(c: Context<AppEnv>) {
  const body = c.get("validatedBody") as ImportCustomerCsvInput;
  return importCustomerRows(c, parseDelimitedRows(body.csv));
}

export async function previewCustomerImport(c: Context<AppEnv>) {
  const rows = await readCustomerImportRows(c);
  return ok(c, rowsToPreview(rows));
}

export async function importCustomers(c: Context<AppEnv>) {
  const rows = await readCustomerImportRows(c);
  return importCustomerRows(c, rows);
}

export async function updateCustomer(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = customerParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateCustomerInput;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  await assertAssignableUser(tenant.companyId, body.assignedToUserId);

  const [updated] = await db
    .update(customers)
    .set({
      ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
      ...(body.email !== undefined ? { email: body.email ?? null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(body.notes !== undefined ? { notes: withDefaultCallFields(body.notes) } : {}),
      ...(body.assignedToUserId !== undefined ? { assignedToUserId: body.assignedToUserId ?? null } : {}),
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
}

export async function deleteCustomer(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = customerParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(customers)
    .set({ updatedAt: new Date(), deletedAt: new Date() })
    .where(and(eq(customers.id, params.customerId), eq(customers.companyId, tenant.companyId), isNull(customers.deletedAt)))
    .returning({ id: customers.id });

  if (!deleted) {
    throw AppError.notFound("Customer not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
}

export async function restoreCustomer(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = customerParamSchema.parse(c.req.param());

  const [restored] = await db
    .update(customers)
    .set({ updatedAt: new Date(), deletedAt: null })
    .where(and(eq(customers.id, params.customerId), eq(customers.companyId, tenant.companyId), isNotNull(customers.deletedAt)))
    .returning({ id: customers.id });

  if (!restored) {
    throw AppError.notFound("Deleted customer not found");
  }

  return ok(c, { restored: true, id: restored.id });
}

export async function permanentlyDeleteCustomer(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = customerParamSchema.parse(c.req.param());

  const [deleted] = await db
    .delete(customers)
    .where(and(eq(customers.id, params.customerId), eq(customers.companyId, tenant.companyId), isNotNull(customers.deletedAt)))
    .returning({ id: customers.id });

  if (!deleted) {
    throw AppError.notFound("Deleted customer not found");
  }

  return ok(c, { deleted: true, permanent: true, id: deleted.id });
}
