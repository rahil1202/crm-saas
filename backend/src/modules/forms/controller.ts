import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { formResponses, forms, leadActivities, leads } from "@/db/schema";
import { ok } from "@/lib/api";
import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { getCompanySettings } from "@/lib/company-settings";
import { consumeRateLimit, recordSecurityAuditLog, type RateLimitPolicy } from "@/lib/security";
import {
  formParamSchema,
  publicFormSlugSchema,
  type CreateFormInput,
  type ListFormResponsesQuery,
  type ListFormsQuery,
  type PublicFormSubmitInput,
  type UpdateFormInput,
} from "@/modules/forms/schema";
import { createNotification } from "@/lib/notifications";

const publicFormPerEntityPolicy: RateLimitPolicy = {
  name: "public_form_submit_entity",
  rules: [
    {
      scope: "public_form_submit:form_ip",
      limit: 5,
      windowSeconds: 60,
      resolveKey: ({ clientIp, body }) => {
        if (!body || typeof body !== "object" || !("formId" in body)) return null;
        const formId = typeof body.formId === "string" ? body.formId : null;
        return formId ? `${formId}:${clientIp || "unknown"}` : null;
      },
    },
    {
      scope: "public_form_submit:form_email",
      limit: 3,
      windowSeconds: 600,
      resolveKey: ({ body }) => {
        if (!body || typeof body !== "object") return null;
        const formId = "formId" in body && typeof body.formId === "string" ? body.formId : null;
        const email = "email" in body && typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
        return formId && email ? `${formId}:${email}` : null;
      },
    },
  ],
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "form";
}

async function uniqueSlug(base: string, excludeId?: string) {
  let candidate = base;
  let attempt = 1;

  while (true) {
    const existing = await db.select({ id: forms.id }).from(forms).where(and(eq(forms.slug, candidate), excludeId ? sql`${forms.id} <> ${excludeId}` : undefined, isNull(forms.deletedAt))).limit(1);
    if (existing.length === 0) {
      return candidate;
    }
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
}

function buildPublicUrl(slug: string) {
  return `${env.FRONTEND_URL.replace(/\/$/, "")}/forms/${slug}`;
}

function buildEmbedSnippet(slug: string) {
  const src = buildPublicUrl(slug);
  return `<iframe src="${src}" width="100%" height="720" frameborder="0" style="border:0;max-width:100%;"></iframe>`;
}

async function verifyTurnstile(input: { token: string; remoteIp?: string | null }) {
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: input.token,
      ...(input.remoteIp ? { remoteip: input.remoteIp } : {}),
    }),
  });

  const payload = await response.json() as { success?: boolean };
  return payload.success === true;
}

async function getFormOrThrow(companyId: string, formId: string) {
  const [item] = await db
    .select()
    .from(forms)
    .where(and(eq(forms.id, formId), eq(forms.companyId, companyId), isNull(forms.deletedAt)))
    .limit(1);

  if (!item) {
    throw AppError.notFound("Form not found");
  }

  return item;
}

function normalizeWebsiteDomain(value?: string | null) {
  if (!value) return null;
  return value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "") || null;
}

function readFieldValue(values: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const raw = values[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

function validateSubmission(formSchema: Array<{ name: string; label?: string; type: string; required: boolean; options?: string[] }>, values: Record<string, unknown>) {
  for (const field of formSchema) {
    const rawValue = values[field.name];
    if (field.required) {
      if (field.type === "checkbox") {
        if (typeof rawValue !== "boolean") throw AppError.badRequest(`Field ${field.label ?? field.name} is required`);
      } else if (Array.isArray(rawValue)) {
        if (rawValue.length === 0) throw AppError.badRequest(`Field ${field.name} is required`);
      } else if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
        throw AppError.badRequest(`Field ${field.name} is required`);
      }
    }

    if (rawValue === undefined || rawValue === null || rawValue === "") continue;

    if (field.type === "checkbox" && typeof rawValue !== "boolean") {
      throw AppError.badRequest(`Field ${field.name} must be boolean`);
    }
    if (field.type !== "checkbox" && field.type !== "select" && field.type !== "radio" && field.type !== "textarea" && field.type !== "phone" && field.type !== "url" && field.type !== "email" && field.type !== "text" && !Array.isArray(rawValue)) {
      continue;
    }
    if ((field.type === "select" || field.type === "radio") && typeof rawValue === "string" && field.options?.length && !field.options.includes(rawValue)) {
      throw AppError.badRequest(`Field ${field.name} has an invalid option`);
    }
    if (field.type === "email" && typeof rawValue === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawValue)) {
      throw AppError.badRequest(`Field ${field.name} must be a valid email`);
    }
    if (field.type === "url" && typeof rawValue === "string") {
      try {
        new URL(rawValue);
      } catch {
        throw AppError.badRequest(`Field ${field.name} must be a valid URL`);
      }
    }
  }
}

export async function listForms(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListFormsQuery;

  const where = and(
    eq(forms.companyId, tenant.companyId),
    isNull(forms.deletedAt),
    query.status ? eq(forms.status, query.status) : undefined,
    query.websiteDomain ? ilike(forms.websiteDomain, `%${query.websiteDomain}%`) : undefined,
    query.q ? or(ilike(forms.name, `%${query.q}%`), ilike(forms.slug, `%${query.q}%`), ilike(forms.description, `%${query.q}%`)) : undefined,
  );

  const [items, totalRows, responseCounts] = await Promise.all([
    db.select().from(forms).where(where).orderBy(desc(forms.updatedAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(forms).where(where),
    db
      .select({
        formId: formResponses.formId,
        submissions: count(),
        lastSubmissionAt: sql<string | null>`max(${formResponses.submittedAt})`,
      })
      .from(formResponses)
      .where(eq(formResponses.companyId, tenant.companyId))
      .groupBy(formResponses.formId),
  ]);

  const countsMap = new Map(responseCounts.map((row) => [row.formId, row]));

  return ok(c, {
    items: items.map((item) => ({
      ...item,
      publicUrl: buildPublicUrl(item.slug),
      embedSnippet: buildEmbedSnippet(item.slug),
      submissions: Number(countsMap.get(item.id)?.submissions ?? 0),
      lastSubmissionAt: countsMap.get(item.id)?.lastSubmissionAt ?? null,
    })),
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function createForm(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateFormInput;
  if (body.schema.length === 0) {
    throw AppError.badRequest("At least one field is required");
  }
  const slug = await uniqueSlug(slugify(body.name));

  const [created] = await db
    .insert(forms)
    .values({
      companyId: tenant.companyId,
      name: body.name,
      slug,
      websiteDomain: normalizeWebsiteDomain(body.websiteDomain),
      description: body.description ?? null,
      schema: body.schema,
      themeSettings: body.themeSettings,
      responseSettings: body.responseSettings,
      createdBy: user.id,
    })
    .returning();

  return ok(c, {
    ...created,
    publicUrl: buildPublicUrl(created.slug),
    embedSnippet: buildEmbedSnippet(created.slug),
  }, 201);
}

export async function getFormDetail(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const { formId } = formParamSchema.parse(c.req.param());
  const form = await getFormOrThrow(tenant.companyId, formId);

  const [stats] = await db
    .select({
      submissions: count(),
      lastSubmissionAt: sql<string | null>`max(${formResponses.submittedAt})`,
      conversions: sql<number>`count(${formResponses.linkedLeadId})`,
    })
    .from(formResponses)
    .where(eq(formResponses.formId, form.id));

  return ok(c, {
    ...form,
    publicUrl: buildPublicUrl(form.slug),
    embedSnippet: buildEmbedSnippet(form.slug),
    stats: {
      submissions: Number(stats?.submissions ?? 0),
      lastSubmissionAt: stats?.lastSubmissionAt ?? null,
      conversions: Number(stats?.conversions ?? 0),
    },
  });
}

export async function updateForm(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const { formId } = formParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateFormInput;
  const current = await getFormOrThrow(tenant.companyId, formId);

  const nextSlug = body.name && body.name !== current.name ? await uniqueSlug(slugify(body.name), current.id) : current.slug;

  const [updated] = await db
    .update(forms)
    .set({
      ...(body.name !== undefined ? { name: body.name, slug: nextSlug } : {}),
      ...(body.websiteDomain !== undefined ? { websiteDomain: normalizeWebsiteDomain(body.websiteDomain) } : {}),
      ...(body.description !== undefined ? { description: body.description ?? null } : {}),
      ...(body.schema !== undefined ? { schema: body.schema } : {}),
      ...(body.themeSettings !== undefined ? { themeSettings: body.themeSettings } : {}),
      ...(body.responseSettings !== undefined ? { responseSettings: body.responseSettings } : {}),
      updatedAt: new Date(),
    })
    .where(eq(forms.id, current.id))
    .returning();

  return ok(c, {
    ...updated,
    publicUrl: buildPublicUrl(updated.slug),
    embedSnippet: buildEmbedSnippet(updated.slug),
  });
}

export async function publishForm(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const { formId } = formParamSchema.parse(c.req.param());
  const current = await getFormOrThrow(tenant.companyId, formId);

  if ((current.schema as Array<unknown>).length === 0) {
    throw AppError.badRequest("Cannot publish a form without fields");
  }

  const [publishedCount] = await db
    .select({ count: count() })
    .from(forms)
    .where(and(eq(forms.companyId, tenant.companyId), eq(forms.status, "published"), isNull(forms.deletedAt)));

  if (current.status !== "published" && Number(publishedCount?.count ?? 0) >= 10) {
    throw AppError.badRequest("Only 10 active published forms are allowed at one time");
  }

  const [updated] = await db
    .update(forms)
    .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(forms.id, current.id))
    .returning();

  return ok(c, {
    ...updated,
    publicUrl: buildPublicUrl(updated.slug),
    embedSnippet: buildEmbedSnippet(updated.slug),
  });
}

export async function unpublishForm(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const { formId } = formParamSchema.parse(c.req.param());
  const current = await getFormOrThrow(tenant.companyId, formId);

  const [updated] = await db
    .update(forms)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(forms.id, current.id))
    .returning();

  return ok(c, {
    ...updated,
    publicUrl: buildPublicUrl(updated.slug),
    embedSnippet: buildEmbedSnippet(updated.slug),
  });
}

export async function listResponses(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const { formId } = formParamSchema.parse(c.req.param());
  const query = c.get("validatedQuery") as ListFormResponsesQuery;
  await getFormOrThrow(tenant.companyId, formId);

  const where = and(
    eq(formResponses.companyId, tenant.companyId),
    eq(formResponses.formId, formId),
    query.q ? or(ilike(formResponses.fullName, `%${query.q}%`), ilike(formResponses.email, `%${query.q}%`), ilike(formResponses.phone, `%${query.q}%`)) : undefined,
  );

  const [items, totalRows] = await Promise.all([
    db.select().from(formResponses).where(where).orderBy(desc(formResponses.submittedAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(formResponses).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function exportResponses(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const { formId } = formParamSchema.parse(c.req.param());
  await getFormOrThrow(tenant.companyId, formId);

  const items = await db
    .select()
    .from(formResponses)
    .where(and(eq(formResponses.companyId, tenant.companyId), eq(formResponses.formId, formId)))
    .orderBy(desc(formResponses.submittedAt));

  return ok(c, { items });
}

export async function getPublicForm(c: Context<AppEnv>) {
  const { slug } = publicFormSlugSchema.parse(c.req.param());
  const [item] = await db
    .select()
    .from(forms)
    .where(and(eq(forms.slug, slug), eq(forms.status, "published"), isNull(forms.deletedAt)))
    .limit(1);

  if (!item) {
    throw AppError.notFound("Published form not found");
  }

  return ok(c, {
    id: item.id,
    name: item.name,
    slug: item.slug,
    websiteDomain: item.websiteDomain,
    schema: item.schema,
    themeSettings: item.themeSettings,
    responseSettings: item.responseSettings,
  });
}

export async function submitPublicForm(c: Context<AppEnv>) {
  const { slug } = publicFormSlugSchema.parse(c.req.param());
  const body = c.get("validatedBody") as PublicFormSubmitInput;
  if (body.honey && body.honey.trim().length > 0) {
    await recordSecurityAuditLog({
      requestId: c.get("requestId"),
      route: c.req.path,
      action: "form_submit.honeypot",
      result: "blocked",
      ipAddress: c.get("clientIp") ?? null,
      userAgent: c.get("userAgent") ?? null,
      metadata: { slug },
    });
    throw AppError.badRequest("Submission rejected");
  }
  const [item] = await db
    .select()
    .from(forms)
    .where(and(eq(forms.slug, slug), eq(forms.status, "published"), isNull(forms.deletedAt)))
    .limit(1);

  if (!item) {
    throw AppError.notFound("Published form not found");
  }

  if (item.responseSettings.captchaEnabled) {
    if (!env.TURNSTILE_SECRET_KEY) {
      throw AppError.badRequest("Captcha is enabled for this form but the server captcha secret is not configured");
    }
    if (!body.captchaToken) {
      throw AppError.badRequest("Captcha verification is required");
    }
    const captchaValid = await verifyTurnstile({
      token: body.captchaToken,
      remoteIp: c.get("clientIp") ?? null,
    });
    if (!captchaValid) {
      await recordSecurityAuditLog({
        requestId: c.get("requestId"),
        route: c.req.path,
        action: "form_submit.captcha",
        result: "blocked",
        ipAddress: c.get("clientIp") ?? null,
        userAgent: c.get("userAgent") ?? null,
        metadata: { slug },
      });
      throw AppError.badRequest("Captcha verification failed");
    }
  }

  const origin = c.req.header("origin");
  const normalizedDomain = normalizeWebsiteDomain(item.websiteDomain);
  if (normalizedDomain && origin) {
    const originHost = normalizeWebsiteDomain(origin);
    if (originHost && originHost !== normalizedDomain && !originHost.endsWith(`.${normalizedDomain}`)) {
      throw AppError.forbidden("This domain is not allowed to submit the form");
    }
  }

  validateSubmission(item.schema as Array<{ name: string; type: string; required: boolean; label?: string; options?: string[] }>, body.values);
  if (Object.keys(body.values).length > (item.schema as Array<unknown>).length + 3) {
    throw AppError.badRequest("Unexpected extra form fields submitted");
  }

  const fullName = readFieldValue(body.values, "full_name", "fullName", "name");
  const email = readFieldValue(body.values, "email");
  const phone = readFieldValue(body.values, "phone", "mobile", "mobile_phone");
  const websiteDomain = normalizeWebsiteDomain(body.websiteDomain) ?? normalizeWebsiteDomain(body.sourceUrl) ?? normalizedDomain;

  await consumeRateLimit(publicFormPerEntityPolicy, {
    clientIp: c.get("clientIp") ?? "unknown",
    companyId: item.companyId,
    body: {
      formId: item.id,
      email,
    },
  });

  const settings = await getCompanySettings(item.companyId);
  const hasWebsiteLeadSource = settings.leadSources.some((source) => source.key === "website");
  if (!hasWebsiteLeadSource) {
    throw AppError.badRequest("Lead source is not configured for this company");
  }

  const leadTitle = `${item.name} submission`;
  const leadNotes = [
    `Form Name: ${item.name}`,
    `Form Slug: ${item.slug}`,
    `Website Domain: ${websiteDomain ?? normalizedDomain ?? "unknown"}`,
    fullName ? `Full Name: ${fullName}` : null,
    email ? `Email: ${email}` : null,
    phone ? `Phone: ${phone}` : null,
  ].filter(Boolean).join("\n");

  const [createdLead] = await db
    .insert(leads)
    .values({
      companyId: item.companyId,
      title: leadTitle,
      fullName,
      email,
      phone,
      source: "website",
      status: "new",
      score: 0,
      notes: leadNotes,
      tags: ["form"],
      createdBy: item.createdBy,
    })
    .returning();

  const [response] = await db
    .insert(formResponses)
    .values({
      formId: item.id,
      companyId: item.companyId,
      linkedLeadId: createdLead.id,
      payload: body.values,
      fullName,
      email,
      phone,
      websiteDomain: websiteDomain ?? normalizedDomain,
      sourceUrl: body.sourceUrl ?? null,
      referer: c.req.header("referer") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      ipHash: c.get("clientIp") ? await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(c.get("clientIp")))).then((b) => Buffer.from(b).toString("hex")) : null,
    })
    .returning();

  await recordSecurityAuditLog({
    requestId: c.get("requestId"),
    companyId: item.companyId,
    route: c.req.path,
    action: "form_submit.accepted",
    result: "accepted",
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
    metadata: {
      formId: item.id,
      responseId: response.id,
      leadId: createdLead.id,
      websiteDomain: websiteDomain ?? normalizedDomain,
    },
  });

  await db.insert(leadActivities).values({
    companyId: item.companyId,
    leadId: createdLead.id,
    actorUserId: item.createdBy,
    type: "lead_created",
    payload: {
      title: createdLead.title,
      status: createdLead.status,
      formId: item.id,
      responseId: response.id,
    },
  });

  await db
    .update(leads)
    .set({
      notes: `${leadNotes}\nResponse Id: ${response.id}\nForm Id: ${item.id}`,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, createdLead.id));

  await createNotification({
    companyId: item.companyId,
    type: "lead",
    title: `New form response: ${item.name}`,
    message: `${fullName ?? email ?? "A visitor"} submitted ${item.name}.`,
    entityId: createdLead.id,
    entityPath: "/dashboard/leads",
    payload: { formId: item.id, responseId: response.id },
  });

  return ok(c, {
    messageTitle: item.responseSettings.messageTitle,
    messageBody: item.responseSettings.messageBody,
    responseId: response.id,
    leadId: createdLead.id,
  }, 201);
}
