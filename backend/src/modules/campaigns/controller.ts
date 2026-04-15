import { and, count, desc, eq, ilike, inArray, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { campaignCustomers, campaigns, customers, emailAccounts, emailMessages, emailTrackingEvents } from "@/db/schema";
import { ok } from "@/lib/api";
import { recordTriggerEvent } from "@/lib/automation-runtime";
import {
  ensureEmailAccount,
  handleResendWebhook,
  queueLeadEmail,
  queueCampaignDelivery,
  recordEmailClick,
  recordEmailOpen,
  recordEmailReply,
} from "@/lib/email-runtime";
import { AppError } from "@/lib/errors";
import { recordLeadScoringEvent } from "@/lib/lead-intelligence";
import { createNotification } from "@/lib/notifications";
import { guardWebhookReplay } from "@/lib/security";
import { campaignParamSchema } from "@/modules/campaigns/schema";
import type { CreateCampaignInput, CreateEmailAccountInput, EmailReplyWebhookInput, ListCampaignsQuery, ListDeliveryLogQuery, TestEmailInput, UpdateCampaignInput } from "@/modules/campaigns/schema";

export function getCampaignOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "campaigns",
    capabilities: ["create-campaign", "audience-selection", "email-campaigns", "scheduling", "analytics"],
  });
}

async function loadCampaignAudience(companyId: string, campaignIds: string[]) {
  if (campaignIds.length === 0) {
    return new Map<string, Array<{ customerId: string; fullName: string; email: string | null }>>();
  }

  const rows = await db
    .select({
      campaignId: campaignCustomers.campaignId,
      customerId: customers.id,
      fullName: customers.fullName,
      email: customers.email,
    })
    .from(campaignCustomers)
    .innerJoin(customers, eq(customers.id, campaignCustomers.customerId))
    .where(and(eq(campaignCustomers.companyId, companyId), inArray(campaignCustomers.campaignId, campaignIds), isNull(customers.deletedAt)));

  const audienceByCampaign = new Map<string, Array<{ customerId: string; fullName: string; email: string | null }>>();

  for (const row of rows) {
    const audience = audienceByCampaign.get(row.campaignId) ?? [];
    audience.push({
      customerId: row.customerId,
      fullName: row.fullName,
      email: row.email,
    });
    audienceByCampaign.set(row.campaignId, audience);
  }

  return audienceByCampaign;
}

async function assertValidCustomers(companyId: string, customerIds: string[]) {
  if (customerIds.length === 0) {
    return;
  }

  const uniqueCustomerIds = Array.from(new Set(customerIds));
  const rows = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.companyId, companyId), inArray(customers.id, uniqueCustomerIds), isNull(customers.deletedAt)));

  if (rows.length !== uniqueCustomerIds.length) {
    throw AppError.badRequest("One or more selected customers are not available in this company");
  }
}

async function replaceCampaignAudience(input: { companyId: string; campaignId: string; customerIds: string[] }) {
  await db.delete(campaignCustomers).where(eq(campaignCustomers.campaignId, input.campaignId));

  const uniqueCustomerIds = Array.from(new Set(input.customerIds));
  if (uniqueCustomerIds.length === 0) {
    return;
  }

  await db.insert(campaignCustomers).values(
    uniqueCustomerIds.map((customerId) => ({
      companyId: input.companyId,
      campaignId: input.campaignId,
      customerId,
    })),
  );
}

export async function listCampaigns(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListCampaignsQuery;

  const conditions = [eq(campaigns.companyId, tenant.companyId), isNull(campaigns.deletedAt)];
  if (query.q) {
    conditions.push(ilike(campaigns.name, `%${query.q}%`));
  }
  if (query.status) {
    conditions.push(eq(campaigns.status, query.status));
  }
  if (query.createdBy) {
    conditions.push(eq(campaigns.createdBy, query.createdBy));
  }

  const where = and(...conditions);
  const [items, totalRows] = await Promise.all([
    db.select().from(campaigns).where(where).orderBy(desc(campaigns.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(campaigns).where(where),
  ]);

  const audienceByCampaign = await loadCampaignAudience(
    tenant.companyId,
    items.map((item) => item.id),
  );

  return ok(c, {
    items: items.map((item) => {
      const linkedCustomers = audienceByCampaign.get(item.id) ?? [];
      return {
        ...item,
        audienceCount: linkedCustomers.length,
        linkedCustomers,
      };
    }),
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function createCampaign(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateCampaignInput;
  await assertValidCustomers(tenant.companyId, body.customerIds);

  const [created] = await db
    .insert(campaigns)
    .values({
      companyId: tenant.companyId,
      name: body.name,
      channel: body.channel,
      status: body.status,
      audienceDescription: body.audienceDescription ?? null,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      launchedAt: body.launchedAt ? new Date(body.launchedAt) : null,
      completedAt: body.completedAt ? new Date(body.completedAt) : null,
      sentCount: body.sentCount,
      deliveredCount: body.deliveredCount,
      openedCount: body.openedCount,
      clickedCount: body.clickedCount,
      notes: body.notes ?? null,
      createdBy: user.id,
    })
    .returning();

  await replaceCampaignAudience({
    companyId: tenant.companyId,
    campaignId: created.id,
    customerIds: body.customerIds,
  });

  await createNotification({
    companyId: tenant.companyId,
    type: "campaign",
    title: "Campaign created",
    message: `${created.name} is ${created.status} with ${body.customerIds.length} linked customers`,
    entityId: created.id,
    entityPath: `/dashboard/campaigns`,
    payload: {
      status: created.status,
      audienceCount: body.customerIds.length,
    },
  });

  return ok(c, created, 201);
}

export async function updateCampaign(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateCampaignInput;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  if (body.customerIds !== undefined) {
    await assertValidCustomers(tenant.companyId, body.customerIds);
  }

  const [updated] = await db
    .update(campaigns)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.channel !== undefined ? { channel: body.channel } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.customerIds !== undefined ? {} : {}),
      ...(body.audienceDescription !== undefined ? { audienceDescription: body.audienceDescription ?? null } : {}),
      ...(body.scheduledAt !== undefined ? { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null } : {}),
      ...(body.launchedAt !== undefined ? { launchedAt: body.launchedAt ? new Date(body.launchedAt) : null } : {}),
      ...(body.completedAt !== undefined ? { completedAt: body.completedAt ? new Date(body.completedAt) : null } : {}),
      ...(body.sentCount !== undefined ? { sentCount: body.sentCount } : {}),
      ...(body.deliveredCount !== undefined ? { deliveredCount: body.deliveredCount } : {}),
      ...(body.openedCount !== undefined ? { openedCount: body.openedCount } : {}),
      ...(body.clickedCount !== undefined ? { clickedCount: body.clickedCount } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(campaigns.id, params.campaignId), eq(campaigns.companyId, tenant.companyId), isNull(campaigns.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Campaign not found");
  }

  if (body.customerIds !== undefined) {
    await replaceCampaignAudience({
      companyId: tenant.companyId,
      campaignId: updated.id,
      customerIds: body.customerIds,
    });
  }

  return ok(c, updated);
}

export async function deleteCampaign(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = campaignParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(campaigns)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(campaigns.id, params.campaignId), eq(campaigns.companyId, tenant.companyId), isNull(campaigns.deletedAt)))
    .returning({ id: campaigns.id });

  if (!deleted) {
    throw AppError.notFound("Campaign not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
}

export async function listEmailAccounts(c: Context<AppEnv>) {
  const tenant = c.get("tenant");

  const items = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.companyId, tenant.companyId), isNull(emailAccounts.deletedAt)))
    .orderBy(desc(emailAccounts.isDefault), desc(emailAccounts.createdAt));

  return ok(c, { items });
}

export async function listDeliveryLog(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListDeliveryLogQuery;

  const items = await db
    .select({
      id: emailMessages.id,
      campaignId: emailMessages.campaignId,
      recipientEmail: emailMessages.recipientEmail,
      recipientName: emailMessages.recipientName,
      subject: emailMessages.subject,
      status: emailMessages.status,
      provider: emailMessages.provider,
      providerMessageId: emailMessages.providerMessageId,
      sentAt: emailMessages.sentAt,
      deliveredAt: emailMessages.deliveredAt,
      failedAt: emailMessages.failedAt,
      lastError: emailMessages.lastError,
      queuedAt: emailMessages.queuedAt,
      campaignName: campaigns.name,
    })
    .from(emailMessages)
    .leftJoin(campaigns, eq(campaigns.id, emailMessages.campaignId))
    .where(eq(emailMessages.companyId, tenant.companyId))
    .orderBy(desc(emailMessages.createdAt))
    .limit(query.limit);

  const messageIds = items.map((item) => item.id);
  const events = messageIds.length
    ? await db
        .select({
          emailMessageId: emailTrackingEvents.emailMessageId,
          eventType: emailTrackingEvents.eventType,
          occurredAt: emailTrackingEvents.occurredAt,
          url: emailTrackingEvents.url,
        })
        .from(emailTrackingEvents)
        .where(inArray(emailTrackingEvents.emailMessageId, messageIds))
        .orderBy(desc(emailTrackingEvents.occurredAt))
    : [];

  const eventsByMessage = new Map<string, Array<(typeof events)[number]>>();
  for (const event of events) {
    const bucket = eventsByMessage.get(event.emailMessageId) ?? [];
    bucket.push(event);
    eventsByMessage.set(event.emailMessageId, bucket);
  }

  return ok(c, {
    items: items.map((item) => ({
      ...item,
      recentEvents: (eventsByMessage.get(item.id) ?? []).slice(0, 5),
    })),
  });
}

export async function createEmailAccount(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateEmailAccountInput;

  const account = await ensureEmailAccount({
    companyId: tenant.companyId,
    userId: user.id,
    createdBy: user.id,
    label: body.label,
    provider: body.provider,
    fromName: body.fromName ?? null,
    fromEmail: body.fromEmail,
    isDefault: body.isDefault,
    credentials: body.credentials,
    metadata: body.metadata,
  });

  return ok(c, account, 201);
}

export async function sendTestEmail(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as TestEmailInput;

  const queued = await queueLeadEmail({
    companyId: tenant.companyId,
    recipientEmail: body.recipientEmail,
    recipientName: body.recipientName ?? null,
    subjectTemplate: body.subject,
    bodyTemplate: body.body,
    createdBy: user.id,
    variables: {
      company: {
        id: tenant.companyId,
      },
    },
  });

  return ok(
    c,
    {
      queued: true,
      messageId: queued.id,
      recipientEmail: queued.recipientEmail,
      status: queued.status,
    },
    202,
  );
}

export async function launchCampaign(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = campaignParamSchema.parse(c.req.param());

  const result = await queueCampaignDelivery({
    companyId: tenant.companyId,
    campaignId: params.campaignId,
    createdBy: user.id,
  });

  return ok(c, result, 202);
}

export async function trackEmailOpen(c: Context) {
  const token = c.req.param("token");
  if (!token) {
    throw AppError.badRequest("Tracking token is required");
  }
  const tracked = await recordEmailOpen(token);
  if (tracked?.message) {
    await recordTriggerEvent({
      companyId: tracked.message.companyId,
      triggerType: "email.opened",
      eventKey: `email.opened:${tracked.message.id}:${new Date().toISOString().slice(0, 16)}`,
      entityType: tracked.message.customerId ? "customer" : tracked.message.leadId ? "lead" : "email_message",
      entityId: tracked.message.customerId ?? tracked.message.leadId ?? tracked.message.id,
      payload: {
        messageId: tracked.message.id,
        customerId: tracked.message.customerId,
        leadId: tracked.message.leadId,
      },
    });
    if (tracked.message.leadId) {
      await recordLeadScoringEvent({
        companyId: tracked.message.companyId,
        leadId: tracked.message.leadId,
        eventType: "email.opened",
        channel: "email",
        sourceId: tracked.message.id,
        payload: { customerId: tracked.message.customerId },
      });
    }
  }

  const pixel = Uint8Array.from([
    71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 255, 255, 255, 0, 0, 0, 33, 249, 4, 1, 0, 0, 1, 0, 44,
    0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
  ]);
  c.header("Content-Type", "image/gif");
  c.header("Cache-Control", "no-store");
  return c.body(pixel);
}

export async function trackEmailClick(c: Context) {
  const token = c.req.param("token");
  const rawUrl = c.req.query("url");
  if (!token || !rawUrl) {
    throw AppError.badRequest("url query parameter is required");
  }

  const tracked = await recordEmailClick(token, rawUrl);
  if (tracked?.message) {
    await recordTriggerEvent({
      companyId: tracked.message.companyId,
      triggerType: "email.clicked",
      eventKey: `email.clicked:${tracked.message.id}:${rawUrl}`,
      entityType: tracked.message.customerId ? "customer" : tracked.message.leadId ? "lead" : "email_message",
      entityId: tracked.message.customerId ?? tracked.message.leadId ?? tracked.message.id,
      payload: {
        messageId: tracked.message.id,
        customerId: tracked.message.customerId,
        leadId: tracked.message.leadId,
        url: rawUrl,
      },
    });
    if (tracked.message.leadId) {
      await recordLeadScoringEvent({
        companyId: tracked.message.companyId,
        leadId: tracked.message.leadId,
        eventType: "email.clicked",
        channel: "email",
        sourceId: tracked.message.id,
        payload: { customerId: tracked.message.customerId, url: rawUrl },
      });
    }
  }

  return c.redirect(rawUrl);
}

export async function handleEmailReplyWebhook(c: Context) {
  const body = c.get("validatedBody") as EmailReplyWebhookInput;
  const tracked = await recordEmailReply(body);
  await recordTriggerEvent({
    companyId: tracked.message.companyId,
    triggerType: "email.replied",
    eventKey: `email.replied:${tracked.message.id}:${body.fromEmail}:${Date.now()}`,
    entityType: tracked.message.customerId ? "customer" : tracked.message.leadId ? "lead" : "email_message",
    entityId: tracked.message.customerId ?? tracked.message.leadId ?? tracked.message.id,
    payload: {
      messageId: tracked.message.id,
      customerId: tracked.message.customerId,
      leadId: tracked.message.leadId,
      body: body.body,
      fromEmail: body.fromEmail,
    },
  });
  if (tracked.message.leadId) {
    await recordLeadScoringEvent({
      companyId: tracked.message.companyId,
      leadId: tracked.message.leadId,
      eventType: "email.replied",
      channel: "email",
      sourceId: tracked.message.id,
      payload: { fromEmail: body.fromEmail },
    });
  }

  return c.json({ success: true }, 200);
}

export async function handleResendWebhookRequest(c: Context) {
  const rawBody = (c.get("rawBody") as string | undefined) ?? (await c.req.text());
  const svixId = c.req.header("svix-id");
  if (!svixId) {
    throw AppError.unauthorized("Missing Resend webhook signature headers");
  }
  await guardWebhookReplay({
    provider: "resend",
    replayKey: svixId,
    metadata: {
      path: c.req.path,
    },
  });
  const tracked = await handleResendWebhook(rawBody, c.req.raw.headers);

  if ("ignored" in tracked) {
    return c.json({ success: true, ignored: true }, 200);
  }

  if (tracked.eventType === "opened" || tracked.eventType === "clicked" || tracked.eventType === "replied") {
    await recordTriggerEvent({
      companyId: tracked.message.companyId,
      triggerType: `email.${tracked.eventType}`,
      eventKey: `email.${tracked.eventType}:${tracked.message.id}:${Date.now()}`,
      entityType: tracked.message.customerId ? "customer" : tracked.message.leadId ? "lead" : "email_message",
      entityId: tracked.message.customerId ?? tracked.message.leadId ?? tracked.message.id,
      payload: {
        messageId: tracked.message.id,
        customerId: tracked.message.customerId,
        leadId: tracked.message.leadId,
      },
    });
    if (tracked.message.leadId) {
      await recordLeadScoringEvent({
        companyId: tracked.message.companyId,
        leadId: tracked.message.leadId,
        eventType: `email.${tracked.eventType}`,
        channel: "email",
        sourceId: tracked.message.id,
        payload: {
          customerId: tracked.message.customerId,
        },
      });
    }
  }

  return c.json({ success: true, eventType: tracked.eventType }, 200);
}
