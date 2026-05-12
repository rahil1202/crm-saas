import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import crypto from "node:crypto";

import { db } from "@/db/client";
import {
  whatsappAnalyticsSnapshots,
  whatsappCampaignContacts,
  whatsappCampaignLogs,
  whatsappCampaigns,
  whatsappContactProfiles,
  whatsappOutbox,
  whatsappTemplates,
} from "@/db/schema";
import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { queueWhatsappMessage } from "@/lib/whatsapp-runtime";

/**
 * WhatsApp CRM — Campaign Engine.
 *
 * Architecture:
 *   Campaign → Fan-out into whatsapp_campaign_contacts → Queue into whatsapp_outbox
 *   → Existing outbox worker (processQueuedWhatsappOutbox) handles rate-limited delivery
 *   → Message events (webhook) update campaign_contacts delivery state
 *
 * This engine does NOT send messages in a loop. It enqueues them into the existing
 * outbox with throttle-aware scheduling (nextAttemptAt staggered by MPS). The outbox
 * worker handles actual Meta API calls with exponential backoff.
 *
 * Campaign lifecycle:
 *   draft → scheduled → sending → completed
 *   draft → sending → paused → sending → completed
 *   draft → canceled
 */

export type CampaignStatus = "draft" | "scheduled" | "sending" | "paused" | "completed" | "canceled";

export interface CreateCampaignInput {
  companyId: string;
  createdBy: string;
  workspaceId?: string | null;
  templateId?: string | null;
  name: string;
  description?: string | null;
  audienceType?: "manual" | "segment" | "all_contacts";
  audienceFilter?: Record<string, unknown>;
  templateName?: string | null;
  templateLanguage?: string;
  templateVariables?: Record<string, unknown>;
  scheduleType?: "immediate" | "scheduled" | "recurring";
  scheduledAt?: Date | null;
  recurringCron?: string | null;
  recurringUntil?: Date | null;
  throttleMps?: number;
  retryMaxAttempts?: number;
  retryBackoffSeconds?: number;
}

export async function createCampaign(input: CreateCampaignInput) {
  // Resolve template name from templateId if provided
  let templateName = input.templateName ?? null;
  let templateLanguage = input.templateLanguage ?? "en";
  if (input.templateId && !templateName) {
    const [template] = await db
      .select({ name: whatsappTemplates.name, language: whatsappTemplates.language })
      .from(whatsappTemplates)
      .where(and(eq(whatsappTemplates.id, input.templateId), eq(whatsappTemplates.companyId, input.companyId)))
      .limit(1);
    if (template) {
      templateName = template.name;
      templateLanguage = template.language;
    }
  }

  const [campaign] = await db
    .insert(whatsappCampaigns)
    .values({
      companyId: input.companyId,
      workspaceId: input.workspaceId ?? null,
      templateId: input.templateId ?? null,
      name: input.name,
      description: input.description ?? null,
      status: "draft",
      audienceType: input.audienceType ?? "manual",
      audienceFilter: input.audienceFilter ?? {},
      templateName,
      templateLanguage,
      templateVariables: input.templateVariables ?? {},
      scheduleType: input.scheduleType ?? "immediate",
      scheduledAt: input.scheduledAt ?? null,
      recurringCron: input.recurringCron ?? null,
      recurringUntil: input.recurringUntil ?? null,
      throttleMps: input.throttleMps ?? 30,
      retryMaxAttempts: input.retryMaxAttempts ?? 3,
      retryBackoffSeconds: input.retryBackoffSeconds ?? 60,
      createdBy: input.createdBy,
    })
    .returning();

  await logCampaignEvent(campaign.companyId, campaign.id, "created", `Campaign "${campaign.name}" created`);
  return campaign;
}

export async function addCampaignAudience(params: {
  companyId: string;
  campaignId: string;
  contacts: Array<{ phoneE164: string; contactName?: string | null; variables?: Record<string, unknown> }>;
}) {
  const campaign = await getCampaignOrThrow(params.companyId, params.campaignId);
  if (campaign.status !== "draft") {
    throw AppError.conflict("Audience can only be modified while campaign is in draft");
  }

  const rows = params.contacts.map((contact) => ({
    companyId: params.companyId,
    campaignId: params.campaignId,
    phoneE164: contact.phoneE164.startsWith("+") ? contact.phoneE164 : `+${contact.phoneE164}`,
    contactName: contact.contactName ?? null,
    variables: contact.variables ?? {},
    status: "pending" as const,
  }));

  let inserted = 0;
  // Batch insert with conflict ignore (dedup by campaign+phone)
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const result = await db
      .insert(whatsappCampaignContacts)
      .values(batch)
      .onConflictDoNothing({ target: [whatsappCampaignContacts.campaignId, whatsappCampaignContacts.phoneE164] })
      .returning({ id: whatsappCampaignContacts.id });
    inserted += result.length;
  }

  // Update total audience count
  const [total] = await db
    .select({ count: count() })
    .from(whatsappCampaignContacts)
    .where(eq(whatsappCampaignContacts.campaignId, params.campaignId));

  await db
    .update(whatsappCampaigns)
    .set({ totalAudience: total?.count ?? 0, updatedAt: new Date() })
    .where(eq(whatsappCampaigns.id, params.campaignId));

  return { inserted, total: total?.count ?? 0 };
}

export async function addAudienceFromSegment(params: {
  companyId: string;
  campaignId: string;
  filter: {
    engagementStatus?: string;
    optInStatus?: string;
    tagId?: string;
  };
}) {
  const campaign = await getCampaignOrThrow(params.companyId, params.campaignId);
  if (campaign.status !== "draft") {
    throw AppError.conflict("Audience can only be modified while campaign is in draft");
  }

  const conditions = [
    eq(whatsappContactProfiles.companyId, params.companyId),
    isNull(whatsappContactProfiles.deletedAt),
  ];
  if (params.filter.engagementStatus) {
    conditions.push(eq(whatsappContactProfiles.engagementStatus, params.filter.engagementStatus));
  }
  if (params.filter.optInStatus) {
    conditions.push(eq(whatsappContactProfiles.optInStatus, params.filter.optInStatus));
  }

  const contacts = await db
    .select({ phoneE164: whatsappContactProfiles.phoneE164, displayName: whatsappContactProfiles.displayName })
    .from(whatsappContactProfiles)
    .where(and(...conditions))
    .limit(10_000);

  if (contacts.length === 0) {
    return { inserted: 0, total: 0 };
  }

  return addCampaignAudience({
    companyId: params.companyId,
    campaignId: params.campaignId,
    contacts: contacts.map((c) => ({ phoneE164: c.phoneE164, contactName: c.displayName })),
  });
}

export async function startCampaign(companyId: string, campaignId: string) {
  const campaign = await getCampaignOrThrow(companyId, campaignId);
  if (campaign.status !== "draft" && campaign.status !== "scheduled" && campaign.status !== "paused") {
    throw AppError.conflict(`Campaign cannot be started from status "${campaign.status}"`);
  }
  if (campaign.totalAudience === 0) {
    throw AppError.badRequest("Campaign has no audience. Add contacts before starting.");
  }
  if (!campaign.templateName) {
    throw AppError.badRequest("Campaign requires a template name.");
  }

  const now = new Date();
  await db
    .update(whatsappCampaigns)
    .set({
      status: "sending",
      startedAt: campaign.startedAt ?? now,
      pausedAt: null,
      updatedAt: now,
    })
    .where(eq(whatsappCampaigns.id, campaignId));

  await logCampaignEvent(companyId, campaignId, "started", "Campaign sending started");

  // Fan out pending contacts into the outbox with staggered scheduling
  await fanOutCampaignBatch(companyId, campaignId, campaign.throttleMps);

  return { status: "sending" };
}

export async function pauseCampaign(companyId: string, campaignId: string) {
  const campaign = await getCampaignOrThrow(companyId, campaignId);
  if (campaign.status !== "sending") {
    throw AppError.conflict("Only a sending campaign can be paused");
  }

  await db
    .update(whatsappCampaigns)
    .set({ status: "paused", pausedAt: new Date(), updatedAt: new Date() })
    .where(eq(whatsappCampaigns.id, campaignId));

  // Cancel queued outbox items for this campaign
  await db
    .update(whatsappOutbox)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(and(eq(whatsappOutbox.campaignId, campaignId), eq(whatsappOutbox.status, "queued")));

  await logCampaignEvent(companyId, campaignId, "paused", "Campaign paused");
  return { status: "paused" };
}

export async function cancelCampaign(companyId: string, campaignId: string) {
  const campaign = await getCampaignOrThrow(companyId, campaignId);
  if (campaign.status === "completed" || campaign.status === "canceled") {
    throw AppError.conflict("Campaign is already finished");
  }

  await db
    .update(whatsappCampaigns)
    .set({ status: "canceled", canceledAt: new Date(), updatedAt: new Date() })
    .where(eq(whatsappCampaigns.id, campaignId));

  await db
    .update(whatsappOutbox)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(and(eq(whatsappOutbox.campaignId, campaignId), inArray(whatsappOutbox.status, ["queued", "retrying"])));

  await logCampaignEvent(companyId, campaignId, "canceled", "Campaign canceled");
  return { status: "canceled" };
}

export async function duplicateCampaign(companyId: string, campaignId: string, createdBy: string) {
  const campaign = await getCampaignOrThrow(companyId, campaignId);
  const [copy] = await db
    .insert(whatsappCampaigns)
    .values({
      companyId,
      workspaceId: campaign.workspaceId,
      templateId: campaign.templateId,
      name: `${campaign.name} (copy)`,
      description: campaign.description,
      status: "draft",
      audienceType: campaign.audienceType,
      audienceFilter: campaign.audienceFilter,
      templateName: campaign.templateName,
      templateLanguage: campaign.templateLanguage,
      templateVariables: campaign.templateVariables,
      scheduleType: campaign.scheduleType,
      throttleMps: campaign.throttleMps,
      retryMaxAttempts: campaign.retryMaxAttempts,
      retryBackoffSeconds: campaign.retryBackoffSeconds,
      createdBy,
    })
    .returning();

  await logCampaignEvent(companyId, copy.id, "duplicated", `Duplicated from campaign ${campaignId}`);
  return copy;
}

/**
 * Fan out pending campaign contacts into the whatsapp_outbox with staggered
 * nextAttemptAt to respect the workspace MPS (messages per second) limit.
 *
 * This is the core of the campaign queue system. It NEVER sends messages in a
 * loop — it enqueues them with time-staggered scheduling so the existing outbox
 * worker picks them up at the correct rate.
 */
async function fanOutCampaignBatch(companyId: string, campaignId: string, throttleMps: number) {
  const batchSize = 500;
  const mps = Math.max(1, throttleMps);
  const intervalMs = Math.ceil(1000 / mps);

  const pending = await db
    .select()
    .from(whatsappCampaignContacts)
    .where(
      and(
        eq(whatsappCampaignContacts.campaignId, campaignId),
        eq(whatsappCampaignContacts.status, "pending"),
      ),
    )
    .orderBy(asc(whatsappCampaignContacts.createdAt))
    .limit(batchSize);

  if (pending.length === 0) {
    // All contacts processed — mark campaign complete
    await db
      .update(whatsappCampaigns)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(whatsappCampaigns.id, campaignId));
    await logCampaignEvent(companyId, campaignId, "completed", "All contacts processed");
    return;
  }

  const campaign = await getCampaignOrThrow(companyId, campaignId);
  const baseTime = Date.now();

  for (let i = 0; i < pending.length; i++) {
    const contact = pending[i]!;
    const scheduledAt = new Date(baseTime + i * intervalMs);
    const idempotencyKey = `campaign:${campaignId}:${contact.phoneE164}`;

    try {
      const queued = await queueWhatsappMessage({
        companyId,
        createdBy: campaign.createdBy ?? companyId,
        workspaceId: campaign.workspaceId,
        to: contact.phoneE164,
        contactName: contact.contactName,
        mode: "template",
        template: {
          name: campaign.templateName!,
          language: campaign.templateLanguage,
          components: [],
        },
        variables: { ...(campaign.templateVariables as Record<string, unknown>), ...(contact.variables as Record<string, unknown>) },
        idempotencyKey,
        priority: 200, // lower priority than inbox messages
        sendAt: scheduledAt,
      });

      await db
        .update(whatsappCampaignContacts)
        .set({
          status: "queued",
          outboxId: queued.outbox.id,
          updatedAt: new Date(),
        })
        .where(eq(whatsappCampaignContacts.id, contact.id));

      // Tag the outbox item with the campaign
      await db
        .update(whatsappOutbox)
        .set({ campaignId })
        .where(eq(whatsappOutbox.id, queued.outbox.id));
    } catch {
      await db
        .update(whatsappCampaignContacts)
        .set({
          status: "failed",
          errorMessage: "Failed to enqueue",
          failedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(whatsappCampaignContacts.id, contact.id));
    }
  }
}

/**
 * Called by the runtime worker to continue fan-out for campaigns in "sending" state.
 * This processes the next batch of pending contacts for each active campaign.
 */
export async function processCampaignQueue() {
  const activeCampaigns = await db
    .select({ id: whatsappCampaigns.id, companyId: whatsappCampaigns.companyId, throttleMps: whatsappCampaigns.throttleMps })
    .from(whatsappCampaigns)
    .where(eq(whatsappCampaigns.status, "sending"))
    .limit(10);

  for (const campaign of activeCampaigns) {
    await fanOutCampaignBatch(campaign.companyId, campaign.id, campaign.throttleMps);
  }
}

/**
 * Called by the runtime worker to start scheduled campaigns whose time has arrived.
 */
export async function processScheduledCampaigns() {
  const now = new Date();
  const due = await db
    .select({ id: whatsappCampaigns.id, companyId: whatsappCampaigns.companyId })
    .from(whatsappCampaigns)
    .where(
      and(
        eq(whatsappCampaigns.status, "scheduled"),
        lte(whatsappCampaigns.scheduledAt, now),
      ),
    )
    .limit(5);

  for (const campaign of due) {
    await startCampaign(campaign.companyId, campaign.id);
  }
}

/**
 * Update campaign contact delivery state from webhook message events.
 * Called by the existing message event processor.
 */
export async function updateCampaignContactStatus(params: {
  companyId: string;
  outboxId: string;
  status: "sent" | "delivered" | "read" | "failed";
  providerMessageId?: string | null;
  errorMessage?: string | null;
}) {
  const [contact] = await db
    .select()
    .from(whatsappCampaignContacts)
    .where(
      and(
        eq(whatsappCampaignContacts.companyId, params.companyId),
        eq(whatsappCampaignContacts.outboxId, params.outboxId),
      ),
    )
    .limit(1);

  if (!contact) return;

  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (params.status === "sent" && !contact.sentAt) {
    updates.status = "sent";
    updates.sentAt = now;
    updates.providerMessageId = params.providerMessageId ?? contact.providerMessageId;
  } else if (params.status === "delivered" && !contact.deliveredAt) {
    updates.status = "delivered";
    updates.deliveredAt = now;
    updates.sentAt = contact.sentAt ?? now;
  } else if (params.status === "read" && !contact.readAt) {
    updates.status = "read";
    updates.readAt = now;
    updates.deliveredAt = contact.deliveredAt ?? now;
  } else if (params.status === "failed") {
    updates.status = "failed";
    updates.failedAt = now;
    updates.errorMessage = params.errorMessage ?? null;
  }

  await db
    .update(whatsappCampaignContacts)
    .set(updates)
    .where(eq(whatsappCampaignContacts.id, contact.id));

  // Increment campaign counters
  const counterField =
    params.status === "sent" ? "sentCount" :
    params.status === "delivered" ? "deliveredCount" :
    params.status === "read" ? "readCount" :
    "failedCount";

  await db
    .update(whatsappCampaigns)
    .set({
      [counterField]: sql`${whatsappCampaigns[counterField]} + 1`,
      updatedAt: now,
    })
    .where(eq(whatsappCampaigns.id, contact.campaignId));
}

// -----------------------------------------------------------------
// Analytics
// -----------------------------------------------------------------

export async function getCampaignAnalytics(companyId: string, campaignId: string) {
  const campaign = await getCampaignOrThrow(companyId, campaignId);

  const [statusCounts] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${whatsappCampaignContacts.status} = 'pending')`,
      queued: sql<number>`count(*) filter (where ${whatsappCampaignContacts.status} = 'queued')`,
      sent: sql<number>`count(*) filter (where ${whatsappCampaignContacts.status} = 'sent')`,
      delivered: sql<number>`count(*) filter (where ${whatsappCampaignContacts.status} = 'delivered')`,
      read: sql<number>`count(*) filter (where ${whatsappCampaignContacts.status} = 'read')`,
      replied: sql<number>`count(*) filter (where ${whatsappCampaignContacts.status} = 'replied')`,
      failed: sql<number>`count(*) filter (where ${whatsappCampaignContacts.status} = 'failed')`,
    })
    .from(whatsappCampaignContacts)
    .where(eq(whatsappCampaignContacts.campaignId, campaignId));

  const total = campaign.totalAudience || 1;
  const sent = Number(statusCounts?.sent ?? 0) + Number(statusCounts?.delivered ?? 0) + Number(statusCounts?.read ?? 0) + Number(statusCounts?.replied ?? 0);
  const delivered = Number(statusCounts?.delivered ?? 0) + Number(statusCounts?.read ?? 0) + Number(statusCounts?.replied ?? 0);
  const read = Number(statusCounts?.read ?? 0) + Number(statusCounts?.replied ?? 0);

  return {
    campaign,
    funnel: {
      total: campaign.totalAudience,
      pending: Number(statusCounts?.pending ?? 0),
      queued: Number(statusCounts?.queued ?? 0),
      sent,
      delivered,
      read,
      replied: Number(statusCounts?.replied ?? 0),
      failed: Number(statusCounts?.failed ?? 0),
    },
    rates: {
      deliveryRate: total > 0 ? Math.round((delivered / total) * 10000) / 100 : 0,
      readRate: total > 0 ? Math.round((read / total) * 10000) / 100 : 0,
      replyRate: total > 0 ? Math.round((Number(statusCounts?.replied ?? 0) / total) * 10000) / 100 : 0,
      failRate: total > 0 ? Math.round((Number(statusCounts?.failed ?? 0) / total) * 10000) / 100 : 0,
    },
    cost: {
      estimated: campaign.estimatedCost,
      actual: campaign.actualCost,
    },
  };
}

export async function getGlobalAnalytics(companyId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [totals] = await db
    .select({
      totalCampaigns: count(),
      totalSent: sql<number>`coalesce(sum(${whatsappCampaigns.sentCount}), 0)`,
      totalDelivered: sql<number>`coalesce(sum(${whatsappCampaigns.deliveredCount}), 0)`,
      totalRead: sql<number>`coalesce(sum(${whatsappCampaigns.readCount}), 0)`,
      totalReplied: sql<number>`coalesce(sum(${whatsappCampaigns.repliedCount}), 0)`,
      totalFailed: sql<number>`coalesce(sum(${whatsappCampaigns.failedCount}), 0)`,
      totalCost: sql<string>`coalesce(sum(${whatsappCampaigns.actualCost}::numeric), 0)`,
    })
    .from(whatsappCampaigns)
    .where(
      and(
        eq(whatsappCampaigns.companyId, companyId),
        gte(whatsappCampaigns.createdAt, since),
        isNull(whatsappCampaigns.deletedAt),
      ),
    );

  // Daily series
  const dailySeries = await db
    .select({
      day: sql<string>`to_char(${whatsappCampaignContacts.sentAt} at time zone 'UTC', 'YYYY-MM-DD')`.as("day"),
      sent: count(),
    })
    .from(whatsappCampaignContacts)
    .where(
      and(
        eq(whatsappCampaignContacts.companyId, companyId),
        gte(whatsappCampaignContacts.sentAt, since),
      ),
    )
    .groupBy(sql`to_char(${whatsappCampaignContacts.sentAt} at time zone 'UTC', 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${whatsappCampaignContacts.sentAt} at time zone 'UTC', 'YYYY-MM-DD')`);

  // Template performance
  const templatePerformance = await db
    .select({
      templateName: whatsappCampaigns.templateName,
      campaigns: count(),
      sent: sql<number>`coalesce(sum(${whatsappCampaigns.sentCount}), 0)`,
      delivered: sql<number>`coalesce(sum(${whatsappCampaigns.deliveredCount}), 0)`,
      read: sql<number>`coalesce(sum(${whatsappCampaigns.readCount}), 0)`,
      failed: sql<number>`coalesce(sum(${whatsappCampaigns.failedCount}), 0)`,
    })
    .from(whatsappCampaigns)
    .where(
      and(
        eq(whatsappCampaigns.companyId, companyId),
        gte(whatsappCampaigns.createdAt, since),
        isNull(whatsappCampaigns.deletedAt),
      ),
    )
    .groupBy(whatsappCampaigns.templateName)
    .orderBy(desc(sql`coalesce(sum(${whatsappCampaigns.sentCount}), 0)`))
    .limit(20);

  return {
    totals: {
      campaigns: Number(totals?.totalCampaigns ?? 0),
      sent: Number(totals?.totalSent ?? 0),
      delivered: Number(totals?.totalDelivered ?? 0),
      read: Number(totals?.totalRead ?? 0),
      replied: Number(totals?.totalReplied ?? 0),
      failed: Number(totals?.totalFailed ?? 0),
      cost: totals?.totalCost ?? "0",
    },
    dailySeries: dailySeries.map((row) => ({ day: row.day, sent: Number(row.sent) })),
    templatePerformance: templatePerformance.map((row) => ({
      templateName: row.templateName,
      campaigns: Number(row.campaigns),
      sent: Number(row.sent),
      delivered: Number(row.delivered),
      read: Number(row.read),
      failed: Number(row.failed),
      deliveryRate: Number(row.sent) > 0 ? Math.round((Number(row.delivered) / Number(row.sent)) * 10000) / 100 : 0,
      readRate: Number(row.sent) > 0 ? Math.round((Number(row.read) / Number(row.sent)) * 10000) / 100 : 0,
    })),
  };
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

async function getCampaignOrThrow(companyId: string, campaignId: string) {
  const [campaign] = await db
    .select()
    .from(whatsappCampaigns)
    .where(
      and(
        eq(whatsappCampaigns.id, campaignId),
        eq(whatsappCampaigns.companyId, companyId),
        isNull(whatsappCampaigns.deletedAt),
      ),
    )
    .limit(1);
  if (!campaign) {
    throw AppError.notFound("WhatsApp campaign not found");
  }
  return campaign;
}

async function logCampaignEvent(companyId: string, campaignId: string, eventType: string, message: string, metadata: Record<string, unknown> = {}) {
  await db.insert(whatsappCampaignLogs).values({
    companyId,
    campaignId,
    eventType,
    message,
    metadata,
  });
}

export { getCampaignOrThrow };
