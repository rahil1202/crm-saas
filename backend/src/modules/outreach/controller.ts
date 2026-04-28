import { and, count, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import {
  emailAccounts,
  emailMessages,
  emailTrackingEvents,
  outreachAgentRuns,
  outreachAccounts,
  outreachContacts,
  outreachListMembers,
  outreachLists,
  templates,
} from "@/db/schema";
import { ok } from "@/lib/api";
import { getCompanySettings } from "@/lib/company-settings";
import { getDefaultEmailAccount, queueEmailMessage } from "@/lib/email-runtime";
import { AppError } from "@/lib/errors";
import { runOutreachAgent } from "@/lib/outreach-agent-runtime";
import { renderTemplateContent } from "@/lib/template-renderer";
import {
  outreachAccountParamSchema,
  outreachContactParamSchema,
  outreachListParamSchema,
  type AddOutreachListMembersInput,
  type CreateOutreachAccountInput,
  type CreateOutreachContactInput,
  type CreateOutreachListInput,
  type ImportOutreachCsvInput,
  type ListOutreachAccountsQuery,
  type ListOutreachContactsQuery,
  type OutreachDashboardQuery,
  type OutreachListSendInput,
  type SeedOutreachExamplesInput,
  type OutreachTemplatePreviewInput,
  type OutreachTemplateSendInput,
  type UpdateOutreachAccountInput,
  type UpdateOutreachContactInput,
} from "@/modules/outreach/schema";

const starterTemplates = [
  {
    name: "Cold intro - problem aware",
    subject: "Quick idea for {{outreach.account.name}}",
    content:
      "<p>Hi {{outreach.contact.fullName}},</p><p>I noticed {{outreach.account.name}} is likely focused on growth and pipeline quality. We help teams spot qualified conversations earlier and follow up without manual chasing.</p><p>Worth a 15 minute conversation next week?</p>",
  },
  {
    name: "Follow-up after no reply",
    subject: "Re: quick idea for {{outreach.account.name}}",
    content:
      "<p>Hi {{outreach.contact.fullName}},</p><p>Checking back once. If improving outbound follow-up or lead handoff is a priority, I can share a short workflow that has worked for similar teams.</p><p>Should I send it over?</p>",
  },
  {
    name: "Warm referral ask",
    subject: "Best person for revenue operations?",
    content:
      "<p>Hi {{outreach.contact.fullName}},</p><p>I am trying to reach the person who owns CRM follow-up and outbound workflow at {{outreach.account.name}}. Would that be you, or is there someone better to speak with?</p><p>Thanks.</p>",
  },
];

const starterLeads = [
  {
    account: {
      name: "Northstar Software",
      domain: "northstar.example",
      industry: "SaaS",
      location: "Austin, TX",
      notes: "Sample outreach account. Delete it when you add real prospects.",
    },
    contact: {
      fullName: "Avery Stone",
      email: "avery@northstar.example",
      title: "VP Sales",
    },
  },
  {
    account: {
      name: "Brightline Operations",
      domain: "brightline.example",
      industry: "Operations",
      location: "Chicago, IL",
      notes: "Sample outreach account. Delete it when you add real prospects.",
    },
    contact: {
      fullName: "Maya Chen",
      email: "maya@brightline.example",
      title: "Head of Revenue Operations",
    },
  },
  {
    account: {
      name: "Summit Advisory Group",
      domain: "summitadvisory.example",
      industry: "Consulting",
      location: "Denver, CO",
      notes: "Sample outreach account. Delete it when you add real prospects.",
    },
    contact: {
      fullName: "Jordan Patel",
      email: "jordan@summitadvisory.example",
      title: "Managing Partner",
    },
  },
];

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

  return rows.map((row) => row.map((cell) => cell.trim())).filter((row) => row.some((cell) => cell.length > 0));
}

function normalizeCsvHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function buildSearchConditions(q?: string) {
  if (!q) return [];
  return [ilike(outreachAccounts.name, `%${q}%`)];
}

export async function getOutreachDashboard(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as OutreachDashboardQuery;

  const rangeCondition =
    query.range === "7d"
      ? sql`${emailMessages.createdAt} >= now() - interval '7 days'`
      : query.range === "30d"
        ? sql`${emailMessages.createdAt} >= now() - interval '30 days'`
        : undefined;

  const emailWhere = and(eq(emailMessages.companyId, tenant.companyId), rangeCondition);

  const [foundRow, sentRow, openedRow, hourlyRows, lastRunRows] = await Promise.all([
    db
      .select({ count: count() })
      .from(outreachContacts)
      .where(and(eq(outreachContacts.companyId, tenant.companyId), isNull(outreachContacts.deletedAt))),
    db
      .select({ count: count() })
      .from(emailMessages)
      .where(and(emailWhere, inArray(emailMessages.status, ["sent", "delivered"]))),
    db
      .select({ count: countDistinctEmailMessageId() })
      .from(emailTrackingEvents)
      .innerJoin(emailMessages, eq(emailMessages.id, emailTrackingEvents.emailMessageId))
      .where(and(emailWhere, eq(emailTrackingEvents.eventType, "opened"))),
    db
      .select({
        hour: sql<string>`to_char(${emailTrackingEvents.occurredAt}, 'HH24')`,
        opens: count(),
      })
      .from(emailTrackingEvents)
      .innerJoin(emailMessages, eq(emailMessages.id, emailTrackingEvents.emailMessageId))
      .where(and(emailWhere, eq(emailTrackingEvents.eventType, "opened")))
      .groupBy(sql`to_char(${emailTrackingEvents.occurredAt}, 'HH24')`),
    db
      .select()
      .from(outreachAgentRuns)
      .where(eq(outreachAgentRuns.companyId, tenant.companyId))
      .orderBy(desc(outreachAgentRuns.startedAt))
      .limit(1),
  ]);

  const found = foundRow[0]?.count ?? 0;
  const sent = sentRow[0]?.count ?? 0;
  const opened = openedRow[0]?.count ?? 0;

  return ok(c, {
    range: query.range,
    stats: {
      emailsFound: found,
      emailsSent: sent,
      leadsOpened: opened,
      openRate: sent > 0 ? Number(((opened / sent) * 100).toFixed(1)) : 0,
    },
    funnel: {
      found,
      sent,
      opened,
    },
    openTiming: hourlyRows.map((row) => ({ hour: row.hour, opens: row.opens })),
    lastRun: lastRunRows[0] ?? null,
  });
}

function countDistinctEmailMessageId() {
  return sql<number>`count(distinct ${emailTrackingEvents.emailMessageId})`;
}

export async function listOutreachAccounts(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListOutreachAccountsQuery;

  const conditions = [eq(outreachAccounts.companyId, tenant.companyId), isNull(outreachAccounts.deletedAt), ...buildSearchConditions(query.q)];
  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    db.select().from(outreachAccounts).where(where).orderBy(desc(outreachAccounts.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(outreachAccounts).where(where),
  ]);

  const accountIds = items.map((item) => item.id);
  const contacts = accountIds.length
    ? await db
        .select()
        .from(outreachContacts)
        .where(and(eq(outreachContacts.companyId, tenant.companyId), inArray(outreachContacts.accountId, accountIds), isNull(outreachContacts.deletedAt)))
    : [];

  const byAccount = new Map<string, typeof contacts>();
  for (const contact of contacts) {
    if (query.status && contact.status !== query.status) continue;
    const bucket = byAccount.get(contact.accountId) ?? [];
    bucket.push(contact);
    byAccount.set(contact.accountId, bucket);
  }

  return ok(c, {
    items: items.map((item) => ({
      ...item,
      contacts: byAccount.get(item.id) ?? [],
      contactsCount: (byAccount.get(item.id) ?? []).length,
    })),
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function listOutreachContacts(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListOutreachContactsQuery;

  const conditions = [eq(outreachContacts.companyId, tenant.companyId), isNull(outreachContacts.deletedAt)];
  if (query.q) {
    conditions.push(ilike(outreachContacts.fullName, `%${query.q}%`));
  }
  if (query.status) {
    conditions.push(eq(outreachContacts.status, query.status));
  }

  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: outreachContacts.id,
        companyId: outreachContacts.companyId,
        accountId: outreachContacts.accountId,
        fullName: outreachContacts.fullName,
        email: outreachContacts.email,
        phone: outreachContacts.phone,
        title: outreachContacts.title,
        linkedinUrl: outreachContacts.linkedinUrl,
        status: outreachContacts.status,
        lastContactedAt: outreachContacts.lastContactedAt,
        sentAt: outreachContacts.sentAt,
        openedAt: outreachContacts.openedAt,
        repliedAt: outreachContacts.repliedAt,
        createdBy: outreachContacts.createdBy,
        createdAt: outreachContacts.createdAt,
        updatedAt: outreachContacts.updatedAt,
        accountName: outreachAccounts.name,
      })
      .from(outreachContacts)
      .innerJoin(outreachAccounts, eq(outreachAccounts.id, outreachContacts.accountId))
      .where(where)
      .orderBy(desc(outreachContacts.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: count() }).from(outreachContacts).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function createOutreachAccount(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateOutreachAccountInput;

  const [created] = await db
    .insert(outreachAccounts)
    .values({
      companyId: tenant.companyId,
      name: body.name,
      domain: body.domain ?? null,
      website: body.website ?? null,
      linkedinUrl: body.linkedinUrl ?? null,
      industry: body.industry ?? null,
      sizeBand: body.sizeBand ?? null,
      location: body.location ?? null,
      notes: body.notes ?? null,
      createdBy: user.id,
    })
    .returning();

  if (body.contacts.length) {
    await db.insert(outreachContacts).values(
      body.contacts.map((contact) => ({
        companyId: tenant.companyId,
        accountId: created.id,
        fullName: contact.fullName,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        title: contact.title ?? null,
        linkedinUrl: contact.linkedinUrl ?? null,
        status: contact.status ?? "pending",
        createdBy: user.id,
      })),
    );
  }

  return ok(c, created, 201);
}

export async function updateOutreachAccount(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = outreachAccountParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateOutreachAccountInput;

  const [updated] = await db
    .update(outreachAccounts)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.domain !== undefined ? { domain: body.domain ?? null } : {}),
      ...(body.website !== undefined ? { website: body.website ?? null } : {}),
      ...(body.linkedinUrl !== undefined ? { linkedinUrl: body.linkedinUrl ?? null } : {}),
      ...(body.industry !== undefined ? { industry: body.industry ?? null } : {}),
      ...(body.sizeBand !== undefined ? { sizeBand: body.sizeBand ?? null } : {}),
      ...(body.location !== undefined ? { location: body.location ?? null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(outreachAccounts.id, params.accountId), eq(outreachAccounts.companyId, tenant.companyId), isNull(outreachAccounts.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Outreach account not found");
  }

  return ok(c, updated);
}

export async function deleteOutreachAccount(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = outreachAccountParamSchema.parse(c.req.param());
  const deletedAt = new Date();

  const [updated] = await db
    .update(outreachAccounts)
    .set({
      deletedAt,
      updatedAt: deletedAt,
    })
    .where(and(eq(outreachAccounts.id, params.accountId), eq(outreachAccounts.companyId, tenant.companyId), isNull(outreachAccounts.deletedAt)))
    .returning({ id: outreachAccounts.id });

  if (!updated) {
    throw AppError.notFound("Outreach account not found");
  }

  await db
    .update(outreachContacts)
    .set({
      deletedAt,
      updatedAt: deletedAt,
    })
    .where(and(eq(outreachContacts.companyId, tenant.companyId), eq(outreachContacts.accountId, params.accountId), isNull(outreachContacts.deletedAt)));

  return ok(c, { deleted: true, id: updated.id });
}

export async function createOutreachContact(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateOutreachContactInput;

  const [account] = await db
    .select({ id: outreachAccounts.id })
    .from(outreachAccounts)
    .where(and(eq(outreachAccounts.id, body.accountId), eq(outreachAccounts.companyId, tenant.companyId), isNull(outreachAccounts.deletedAt)))
    .limit(1);

  if (!account) {
    throw AppError.badRequest("Outreach account is not available");
  }

  const [created] = await db
    .insert(outreachContacts)
    .values({
      companyId: tenant.companyId,
      accountId: body.accountId,
      fullName: body.fullName,
      email: body.email ?? null,
      phone: body.phone ?? null,
      title: body.title ?? null,
      linkedinUrl: body.linkedinUrl ?? null,
      status: body.status ?? "pending",
      createdBy: user.id,
    })
    .returning();

  return ok(c, created, 201);
}

export async function updateOutreachContact(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = outreachContactParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateOutreachContactInput;

  const [updated] = await db
    .update(outreachContacts)
    .set({
      ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
      ...(body.email !== undefined ? { email: body.email ?? null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
      ...(body.title !== undefined ? { title: body.title ?? null } : {}),
      ...(body.linkedinUrl !== undefined ? { linkedinUrl: body.linkedinUrl ?? null } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(outreachContacts.id, params.contactId), eq(outreachContacts.companyId, tenant.companyId), isNull(outreachContacts.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Outreach contact not found");
  }

  return ok(c, updated);
}

export async function deleteOutreachContact(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = outreachContactParamSchema.parse(c.req.param());
  const deletedAt = new Date();

  const [updated] = await db
    .update(outreachContacts)
    .set({
      deletedAt,
      updatedAt: deletedAt,
    })
    .where(and(eq(outreachContacts.id, params.contactId), eq(outreachContacts.companyId, tenant.companyId), isNull(outreachContacts.deletedAt)))
    .returning({ id: outreachContacts.id });

  if (!updated) {
    throw AppError.notFound("Outreach contact not found");
  }

  return ok(c, { deleted: true, id: updated.id });
}

export async function listOutreachLists(c: Context<AppEnv>) {
  const tenant = c.get("tenant");

  const items = await db
    .select()
    .from(outreachLists)
    .where(and(eq(outreachLists.companyId, tenant.companyId), isNull(outreachLists.deletedAt)))
    .orderBy(desc(outreachLists.createdAt));

  return ok(c, { items });
}

export async function createOutreachList(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateOutreachListInput;

  const [created] = await db
    .insert(outreachLists)
    .values({
      companyId: tenant.companyId,
      name: body.name,
      entityType: body.entityType,
      createdBy: user.id,
    })
    .returning();

  return ok(c, created, 201);
}

export async function addOutreachListMembers(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = outreachListParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as AddOutreachListMembersInput;

  const values = [
    ...body.contactIds.map((contactId) => ({
      companyId: tenant.companyId,
      listId: params.listId,
      contactId,
      accountId: null,
      createdBy: user.id,
    })),
    ...body.accountIds.map((accountId) => ({
      companyId: tenant.companyId,
      listId: params.listId,
      accountId,
      contactId: null,
      createdBy: user.id,
    })),
  ];

  if (values.length === 0) {
    return ok(c, { added: 0 });
  }

  await db.insert(outreachListMembers).values(values).onConflictDoNothing();
  return ok(c, { added: values.length });
}

export async function previewOutreachTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as OutreachTemplatePreviewInput;

  const [template] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, body.templateId), eq(templates.companyId, tenant.companyId), isNull(templates.deletedAt)))
    .limit(1);

  if (!template) {
    throw AppError.notFound("Template not found");
  }

  let contact: { id: string; accountId: string } | null = null;
  if (body.contactId) {
    const [row] = await db
      .select({ id: outreachContacts.id, accountId: outreachContacts.accountId })
      .from(outreachContacts)
      .where(and(eq(outreachContacts.id, body.contactId), eq(outreachContacts.companyId, tenant.companyId), isNull(outreachContacts.deletedAt)))
      .limit(1);
    contact = row ?? null;
  }

  const rendered = await renderTemplateContent({
    companyId: tenant.companyId,
    subject: template.subject,
    content: template.content,
    variables: body.variables,
  });

  return ok(c, {
    template: {
      id: template.id,
      name: template.name,
      type: template.type,
    },
    contactId: contact?.id ?? null,
    subject: rendered.subject ?? template.subject ?? "",
    content: rendered.content,
  });
}

export async function sendOutreachTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as OutreachTemplateSendInput;

  const [template] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, body.templateId), eq(templates.companyId, tenant.companyId), isNull(templates.deletedAt)))
    .limit(1);

  if (!template) {
    throw AppError.notFound("Template not found");
  }

  const contacts = await db
    .select({
      id: outreachContacts.id,
      accountId: outreachContacts.accountId,
      fullName: outreachContacts.fullName,
      email: outreachContacts.email,
    })
    .from(outreachContacts)
    .where(and(eq(outreachContacts.companyId, tenant.companyId), inArray(outreachContacts.id, body.contactIds), isNull(outreachContacts.deletedAt)));

  const deliverable = contacts.filter((contact) => contact.email);
  if (!deliverable.length) {
    throw AppError.badRequest("No deliverable outreach contacts found");
  }

  const account = body.emailAccountId
    ? await db
        .select()
        .from(emailAccounts)
        .where(and(eq(emailAccounts.id, body.emailAccountId), eq(emailAccounts.companyId, tenant.companyId), isNull(emailAccounts.deletedAt)))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : await getDefaultEmailAccount(tenant.companyId);

  if (!account) {
    throw AppError.conflict("Connect an email account before sending");
  }

  const queuedIds: string[] = [];
  for (const contact of deliverable) {
    const rendered = await renderTemplateContent({
      companyId: tenant.companyId,
      subject: template.subject,
      content: template.content,
      variables: {
        outreach: {
          contact: {
            fullName: contact.fullName,
            email: contact.email,
          },
        },
      },
    });

    const message = await queueEmailMessage({
      companyId: tenant.companyId,
      emailAccountId: account.id,
      createdBy: user.id,
      outreachAccountId: contact.accountId,
      outreachContactId: contact.id,
      recipientEmail: contact.email as string,
      recipientName: contact.fullName,
      subject: rendered.subject ?? template.subject ?? template.name,
      htmlContent: rendered.content,
      metadata: {
        source: "outreach-template-send",
        templateId: template.id,
      },
    });

    queuedIds.push(message.id);

    await db
      .update(outreachContacts)
      .set({
        status: "sent",
        sentAt: new Date(),
        lastContactedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(outreachContacts.id, contact.id));
  }

  return ok(c, {
    queued: true,
    queuedCount: queuedIds.length,
    queuedIds,
  }, 202);
}

export async function sendOutreachListTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as OutreachListSendInput;

  const members = await db
    .select({ contactId: outreachListMembers.contactId })
    .from(outreachListMembers)
    .innerJoin(outreachLists, eq(outreachLists.id, outreachListMembers.listId))
    .where(and(eq(outreachListMembers.companyId, tenant.companyId), eq(outreachListMembers.listId, body.listId), isNull(outreachLists.deletedAt)));

  const contactIds = members.map((item) => item.contactId).filter((value): value is string => Boolean(value));
  if (contactIds.length === 0) {
    throw AppError.badRequest("Selected list has no contacts");
  }

  c.set("validatedBody", {
    templateId: body.templateId,
    contactIds,
    emailAccountId: body.emailAccountId,
  });

  return sendOutreachTemplate(c);
}

export async function importOutreachFromCsv(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as ImportOutreachCsvInput;

  const parsedRows = parseCsvRows(body.csv);
  if (parsedRows.length < 2) {
    throw AppError.badRequest("CSV must include a header row and at least one data row");
  }

  const [headerRow, ...dataRows] = parsedRows;
  const normalizedHeaders = headerRow.map(normalizeCsvHeader);

  const requiredColumns = ["company", "company_name", "account", "name", "full_name", "email"];
  if (!normalizedHeaders.some((header) => requiredColumns.includes(header))) {
    throw AppError.badRequest("CSV requires company/company_name/account and name/full_name/email columns");
  }

  if (dataRows.length > 500) {
    throw AppError.badRequest("CSV import supports up to 500 outreach rows per request");
  }

  let importedAccounts = 0;
  let importedContacts = 0;

  for (const row of dataRows) {
    const rowRecord: Record<string, string> = {};
    normalizedHeaders.forEach((header, index) => {
      rowRecord[header] = row[index] ?? "";
    });

    const companyName = rowRecord.company || rowRecord.company_name || rowRecord.account;
    const fullName = rowRecord.full_name || rowRecord.name || rowRecord.contact_name;
    const email = rowRecord.email || "";
    if (!companyName || (!fullName && !email)) {
      continue;
    }

    const [existingAccount] = await db
      .select({ id: outreachAccounts.id })
      .from(outreachAccounts)
      .where(and(eq(outreachAccounts.companyId, tenant.companyId), eq(outreachAccounts.name, companyName), isNull(outreachAccounts.deletedAt)))
      .limit(1);

    const accountId = existingAccount
      ? existingAccount.id
      : (
          await db
            .insert(outreachAccounts)
            .values({
              companyId: tenant.companyId,
              name: companyName,
              domain: rowRecord.domain || null,
              website: rowRecord.website || null,
              industry: rowRecord.industry || null,
              location: rowRecord.location || null,
              createdBy: user.id,
            })
            .returning({ id: outreachAccounts.id })
        )[0].id;

    if (!existingAccount) {
      importedAccounts += 1;
    }

    if (email) {
      const [existingContact] = await db
        .select({ id: outreachContacts.id })
        .from(outreachContacts)
        .where(and(eq(outreachContacts.companyId, tenant.companyId), eq(outreachContacts.accountId, accountId), eq(outreachContacts.email, email), isNull(outreachContacts.deletedAt)))
        .limit(1);

      if (!existingContact) {
        await db.insert(outreachContacts).values({
          companyId: tenant.companyId,
          accountId,
          fullName: fullName || email,
          email,
          phone: rowRecord.phone || null,
          title: rowRecord.title || null,
          linkedinUrl: rowRecord.linkedin_url || null,
          createdBy: user.id,
        });
        importedContacts += 1;
      }
    }
  }

  return ok(c, {
    importedAccounts,
    importedContacts,
  }, 201);
}

export async function seedOutreachExamples(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as SeedOutreachExamplesInput;
  let createdTemplates = 0;
  let createdAccounts = 0;
  let createdContacts = 0;

  if (body.templates) {
    for (const starter of starterTemplates) {
      const [existing] = await db
        .select({ id: templates.id })
        .from(templates)
        .where(and(eq(templates.companyId, tenant.companyId), eq(templates.name, starter.name), isNull(templates.deletedAt)))
        .limit(1);

      if (!existing) {
        await db.insert(templates).values({
          companyId: tenant.companyId,
          name: starter.name,
          type: "email",
          subject: starter.subject,
          content: starter.content,
          notes: "Starter outreach template. Edit or delete after customizing your playbook.",
          createdBy: user.id,
        });
        createdTemplates += 1;
      }
    }
  }

  if (body.leads) {
    for (const starter of starterLeads) {
      const [existingAccount] = await db
        .select({ id: outreachAccounts.id })
        .from(outreachAccounts)
        .where(and(eq(outreachAccounts.companyId, tenant.companyId), eq(outreachAccounts.name, starter.account.name), isNull(outreachAccounts.deletedAt)))
        .limit(1);

      const accountId = existingAccount
        ? existingAccount.id
        : (
            await db
              .insert(outreachAccounts)
              .values({
                companyId: tenant.companyId,
                name: starter.account.name,
                domain: starter.account.domain,
                industry: starter.account.industry,
                location: starter.account.location,
                notes: starter.account.notes,
                createdBy: user.id,
              })
              .returning({ id: outreachAccounts.id })
          )[0].id;

      if (!existingAccount) {
        createdAccounts += 1;
      }

      const [existingContact] = await db
        .select({ id: outreachContacts.id })
        .from(outreachContacts)
        .where(and(eq(outreachContacts.companyId, tenant.companyId), eq(outreachContacts.accountId, accountId), eq(outreachContacts.email, starter.contact.email), isNull(outreachContacts.deletedAt)))
        .limit(1);

      if (!existingContact) {
        await db.insert(outreachContacts).values({
          companyId: tenant.companyId,
          accountId,
          fullName: starter.contact.fullName,
          email: starter.contact.email,
          title: starter.contact.title,
          status: "pending",
          createdBy: user.id,
        });
        createdContacts += 1;
      }
    }
  }

  return ok(c, {
    createdTemplates,
    createdAccounts,
    createdContacts,
  }, 201);
}

export async function runOutreachNow(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  await getCompanySettings(tenant.companyId);

  const run = await runOutreachAgent({
    companyId: tenant.companyId,
    userId: user.id,
    triggerType: "manual",
  });

  return ok(c, { run }, 202);
}
