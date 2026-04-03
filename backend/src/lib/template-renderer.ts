import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { companySettings, customers, deals, leads } from "@/db/schema";

interface RenderContextInput {
  companyId: string;
  leadId?: string | null;
  dealId?: string | null;
  customerId?: string | null;
  variables?: Record<string, unknown>;
  fallbackValue?: string;
}

type VariableBucket = Record<string, unknown>;

function readPath(source: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((accumulator, segment) => {
    if (accumulator === null || accumulator === undefined) {
      return undefined;
    }

    if (typeof accumulator !== "object") {
      return undefined;
    }

    return (accumulator as Record<string, unknown>)[segment];
  }, source);
}

function stringifyValue(value: unknown, fallback: string) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

async function loadLead(companyId: string, leadId?: string | null) {
  if (!leadId) {
    return null;
  }

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.companyId, companyId), eq(leads.id, leadId), isNull(leads.deletedAt)))
    .limit(1);

  return lead ?? null;
}

async function loadDeal(companyId: string, dealId?: string | null) {
  if (!dealId) {
    return null;
  }

  const [deal] = await db
    .select()
    .from(deals)
    .where(and(eq(deals.companyId, companyId), eq(deals.id, dealId), isNull(deals.deletedAt)))
    .limit(1);

  return deal ?? null;
}

async function loadCustomer(companyId: string, customerId?: string | null) {
  if (!customerId) {
    return null;
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.companyId, companyId), eq(customers.id, customerId), isNull(customers.deletedAt)))
    .limit(1);

  return customer ?? null;
}

async function loadCompanyCustomFieldDefinitions(companyId: string) {
  const [settings] = await db
    .select({ customFields: companySettings.customFields })
    .from(companySettings)
    .where(eq(companySettings.companyId, companyId))
    .limit(1);

  return settings?.customFields ?? [];
}

export async function buildTemplateVariables(input: RenderContextInput) {
  const [lead, deal, customer, customFieldDefinitions] = await Promise.all([
    loadLead(input.companyId, input.leadId),
    loadDeal(input.companyId, input.dealId),
    loadCustomer(input.companyId, input.customerId),
    loadCompanyCustomFieldDefinitions(input.companyId),
  ]);

  const custom = Object.fromEntries(customFieldDefinitions.map((field) => [field.key, input.variables?.[field.key] ?? null]));

  return {
    lead: (lead ?? {}) as VariableBucket,
    deal: (deal ?? {}) as VariableBucket,
    customer: (customer ?? {}) as VariableBucket,
    custom,
    variables: input.variables ?? {},
  } satisfies Record<string, VariableBucket>;
}

export async function renderTemplateString(template: string, input: RenderContextInput) {
  const fallback = input.fallbackValue ?? "";
  const variables = await buildTemplateVariables(input);

  return template.replace(/\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]+?)\s*)?\}\}/g, (_match, expression: string, inlineFallback?: string) => {
    const path = expression.trim();
    const fallbackValue = inlineFallback?.trim() ?? fallback;
    return stringifyValue(readPath(variables, path), fallbackValue);
  });
}

export async function renderTemplateContent(input: {
  companyId: string;
  subject?: string | null;
  content: string;
  leadId?: string | null;
  dealId?: string | null;
  customerId?: string | null;
  variables?: Record<string, unknown>;
  fallbackValue?: string;
}) {
  const renderedSubject = input.subject
    ? await renderTemplateString(input.subject, input)
    : null;
  const renderedContent = await renderTemplateString(input.content, input);

  return {
    subject: renderedSubject,
    content: renderedContent,
  };
}
