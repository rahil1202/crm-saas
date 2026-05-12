import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { whatsappCampaignContacts, whatsappCampaignLogs, whatsappCampaigns, whatsappTemplates } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import {
  addAudienceFromSegment,
  addCampaignAudience,
  cancelCampaign,
  createCampaign,
  duplicateCampaign,
  getCampaignAnalytics,
  getCampaignOrThrow,
  getGlobalAnalytics,
  pauseCampaign,
  startCampaign,
} from "@/lib/whatsapp-campaign-engine";
import { queueWhatsappMessage } from "@/lib/whatsapp-runtime";
import {
  addAudienceFromSegmentSchema,
  addAudienceSchema,
  analyticsQuerySchema,
  campaignParamSchema,
  createCampaignSchema,
  listCampaignsSchema,
  testSendSchema,
  updateCampaignSchema,
} from "@/modules/whatsapp-campaigns/schema";
import type {
  AddAudienceFromSegmentInput,
  AddAudienceInput,
  AnalyticsQuery,
  CreateCampaignInput,
  ListCampaignsQuery,
  TestSendInput,
  UpdateCampaignInput,
} from "@/modules/whatsapp-campaigns/schema";

// -----------------------------------------------------------------
// Campaigns CRUD
// -----------------------------------------------------------------

export async function listCampaigns(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListCampaignsQuery;

  const conditions = [eq(whatsappCampaigns.companyId, tenant.companyId), isNull(whatsappCampaigns.deletedAt)];
  if (query.status) {
    conditions.push(eq(whatsappCampaigns.status, query.status));
  }

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(whatsappCampaigns)
      .where(and(...conditions))
      .orderBy(desc(whatsappCampaigns.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: count() }).from(whatsappCampaigns).where(and(...conditions)),
  ]);

  return ok(c, { items, total: totalRows[0]?.count ?? 0 });
}

export async function getCampaign(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());
  const campaign = await getCampaignOrThrow(tenant.companyId, params.campaignId);
  return ok(c, campaign);
}

export async function createCampaignController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateCampaignInput;

  const campaign = await createCampaign({
    companyId: tenant.companyId,
    createdBy: user.id,
    ...body,
    scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    recurringUntil: body.recurringUntil ? new Date(body.recurringUntil) : null,
  });

  // If scheduled, set status to "scheduled"
  if (body.scheduleType === "scheduled" && body.scheduledAt) {
    await db
      .update(whatsappCampaigns)
      .set({ status: "scheduled", updatedAt: new Date() })
      .where(eq(whatsappCampaigns.id, campaign.id));
  }

  return ok(c, campaign, 201);
}

export async function updateCampaignController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateCampaignInput;

  const campaign = await getCampaignOrThrow(tenant.companyId, params.campaignId);
  if (campaign.status !== "draft") {
    throw AppError.conflict("Only draft campaigns can be edited");
  }

  const [updated] = await db
    .update(whatsappCampaigns)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.workspaceId !== undefined ? { workspaceId: body.workspaceId } : {}),
      ...(body.templateId !== undefined ? { templateId: body.templateId } : {}),
      ...(body.templateName !== undefined ? { templateName: body.templateName } : {}),
      ...(body.templateLanguage !== undefined ? { templateLanguage: body.templateLanguage } : {}),
      ...(body.templateVariables !== undefined ? { templateVariables: body.templateVariables } : {}),
      ...(body.audienceType !== undefined ? { audienceType: body.audienceType } : {}),
      ...(body.audienceFilter !== undefined ? { audienceFilter: body.audienceFilter } : {}),
      ...(body.scheduleType !== undefined ? { scheduleType: body.scheduleType } : {}),
      ...(body.scheduledAt !== undefined ? { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null } : {}),
      ...(body.recurringCron !== undefined ? { recurringCron: body.recurringCron } : {}),
      ...(body.recurringUntil !== undefined ? { recurringUntil: body.recurringUntil ? new Date(body.recurringUntil) : null } : {}),
      ...(body.throttleMps !== undefined ? { throttleMps: body.throttleMps } : {}),
      ...(body.retryMaxAttempts !== undefined ? { retryMaxAttempts: body.retryMaxAttempts } : {}),
      ...(body.retryBackoffSeconds !== undefined ? { retryBackoffSeconds: body.retryBackoffSeconds } : {}),
      updatedAt: new Date(),
    })
    .where(eq(whatsappCampaigns.id, campaign.id))
    .returning();

  return ok(c, updated);
}

export async function deleteCampaignController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());
  const campaign = await getCampaignOrThrow(tenant.companyId, params.campaignId);

  if (campaign.status === "sending") {
    throw AppError.conflict("Pause or cancel the campaign before deleting");
  }

  await db
    .update(whatsappCampaigns)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(whatsappCampaigns.id, campaign.id));

  return ok(c, { deleted: true, id: campaign.id });
}

// -----------------------------------------------------------------
// Audience
// -----------------------------------------------------------------

export async function addAudienceController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as AddAudienceInput;

  const result = await addCampaignAudience({
    companyId: tenant.companyId,
    campaignId: params.campaignId,
    contacts: body.contacts,
  });

  return ok(c, result);
}

export async function addAudienceFromSegmentController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as AddAudienceFromSegmentInput;

  const result = await addAudienceFromSegment({
    companyId: tenant.companyId,
    campaignId: params.campaignId,
    filter: body,
  });

  return ok(c, result);
}

export async function listAudienceController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());
  await getCampaignOrThrow(tenant.companyId, params.campaignId);

  const items = await db
    .select()
    .from(whatsappCampaignContacts)
    .where(eq(whatsappCampaignContacts.campaignId, params.campaignId))
    .orderBy(desc(whatsappCampaignContacts.createdAt))
    .limit(200);

  return ok(c, { items });
}

// -----------------------------------------------------------------
// Lifecycle
// -----------------------------------------------------------------

export async function startCampaignController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());
  const result = await startCampaign(tenant.companyId, params.campaignId);
  return ok(c, result);
}

export async function pauseCampaignController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());
  const result = await pauseCampaign(tenant.companyId, params.campaignId);
  return ok(c, result);
}

export async function cancelCampaignController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());
  const result = await cancelCampaign(tenant.companyId, params.campaignId);
  return ok(c, result);
}

export async function duplicateCampaignController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = campaignParamSchema.parse(c.req.param());
  const copy = await duplicateCampaign(tenant.companyId, params.campaignId, user.id);
  return ok(c, copy, 201);
}

// -----------------------------------------------------------------
// Analytics
// -----------------------------------------------------------------

export async function getCampaignAnalyticsController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());
  const analytics = await getCampaignAnalytics(tenant.companyId, params.campaignId);
  return ok(c, analytics);
}

export async function getGlobalAnalyticsController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as AnalyticsQuery;
  const analytics = await getGlobalAnalytics(tenant.companyId, query.days);
  return ok(c, analytics);
}

export async function getCampaignLogs(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());
  await getCampaignOrThrow(tenant.companyId, params.campaignId);

  const items = await db
    .select()
    .from(whatsappCampaignLogs)
    .where(eq(whatsappCampaignLogs.campaignId, params.campaignId))
    .orderBy(desc(whatsappCampaignLogs.createdAt))
    .limit(100);

  return ok(c, { items });
}

// -----------------------------------------------------------------
// Template test send
// -----------------------------------------------------------------

export async function testTemplateSend(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as TestSendInput;

  const queued = await queueWhatsappMessage({
    companyId: tenant.companyId,
    createdBy: user.id,
    to: body.to,
    mode: "template",
    template: {
      name: body.templateName,
      language: body.language,
      components: [],
    },
    variables: body.variables,
    priority: 50, // high priority for test sends
  });

  return ok(c, { outboxId: queued.outbox.id, status: queued.outbox.status }, 202);
}
