import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import {
  socialAccounts,
  socialConversations,
  socialMessages,
  whatsappTemplates,
  whatsappWebhookEvents,
  whatsappWorkspaces,
} from "@/db/schema";
import { ok } from "@/lib/api";

/**
 * WhatsApp CRM — Dashboard endpoints.
 *
 * All queries are tenant-scoped through the requireTenant middleware.
 * This controller is read-only and aggregates already-persisted data from the
 * core WhatsApp runtime tables (workspaces, webhook events, social messages
 * and conversations). It powers the Phase 1 dashboard UI (stat cards,
 * connection status, recent activity, recent webhook events).
 */

const recentEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  workspaceId: z.string().uuid().optional(),
});

const recentActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(15),
});

export const whatsappDashboardSchemas = {
  recentEventsQuerySchema,
  recentActivityQuerySchema,
};

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function startOfDaysAgo(days: number) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - days);
  return now;
}

export async function getWhatsappDashboardStats(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const companyId = tenant.companyId;

  const dayStart = startOfToday();
  const weekStart = startOfDaysAgo(6);

  const [
    workspacesConnectedRow,
    workspacesActiveRow,
    workspacesVerifiedRow,
    messagesSentTodayRow,
    messagesReceivedTodayRow,
    messagesFailedTodayRow,
    messagesSentWeekRow,
    activeConversationsRow,
    openConversationsRow,
    unreadConversationsRow,
    approvedTemplatesRow,
    webhookEventsTodayRow,
    webhookEventsFailedRow,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(whatsappWorkspaces)
      .where(and(eq(whatsappWorkspaces.companyId, companyId), isNull(whatsappWorkspaces.deletedAt))),
    db
      .select({ value: count() })
      .from(whatsappWorkspaces)
      .where(
        and(
          eq(whatsappWorkspaces.companyId, companyId),
          eq(whatsappWorkspaces.isActive, true),
          isNull(whatsappWorkspaces.deletedAt),
        ),
      ),
    db
      .select({ value: count() })
      .from(whatsappWorkspaces)
      .where(
        and(
          eq(whatsappWorkspaces.companyId, companyId),
          eq(whatsappWorkspaces.isVerified, true),
          isNull(whatsappWorkspaces.deletedAt),
        ),
      ),
    db
      .select({ value: count() })
      .from(socialMessages)
      .innerJoin(socialConversations, eq(socialConversations.id, socialMessages.conversationId))
      .where(
        and(
          eq(socialMessages.companyId, companyId),
          eq(socialConversations.platform, "whatsapp"),
          eq(socialMessages.direction, "outbound"),
          gte(socialMessages.sentAt, dayStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(socialMessages)
      .innerJoin(socialConversations, eq(socialConversations.id, socialMessages.conversationId))
      .where(
        and(
          eq(socialMessages.companyId, companyId),
          eq(socialConversations.platform, "whatsapp"),
          eq(socialMessages.direction, "inbound"),
          gte(socialMessages.sentAt, dayStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(socialMessages)
      .innerJoin(socialConversations, eq(socialConversations.id, socialMessages.conversationId))
      .where(
        and(
          eq(socialMessages.companyId, companyId),
          eq(socialConversations.platform, "whatsapp"),
          eq(socialMessages.deliveryStatus, "failed"),
          gte(socialMessages.sentAt, dayStart),
        ),
      ),
    db
      .select({
        day: sql<string>`to_char(${socialMessages.sentAt} at time zone 'UTC', 'YYYY-MM-DD')`.as("day"),
        value: count(),
      })
      .from(socialMessages)
      .innerJoin(socialConversations, eq(socialConversations.id, socialMessages.conversationId))
      .where(
        and(
          eq(socialMessages.companyId, companyId),
          eq(socialConversations.platform, "whatsapp"),
          eq(socialMessages.direction, "outbound"),
          gte(socialMessages.sentAt, weekStart),
        ),
      )
      .groupBy(sql`to_char(${socialMessages.sentAt} at time zone 'UTC', 'YYYY-MM-DD')`),
    db
      .select({ value: count() })
      .from(socialConversations)
      .where(
        and(
          eq(socialConversations.companyId, companyId),
          eq(socialConversations.platform, "whatsapp"),
          isNull(socialConversations.deletedAt),
          gte(socialConversations.lastMessageAt, startOfDaysAgo(1)),
        ),
      ),
    db
      .select({ value: count() })
      .from(socialConversations)
      .where(
        and(
          eq(socialConversations.companyId, companyId),
          eq(socialConversations.platform, "whatsapp"),
          eq(socialConversations.status, "open"),
          isNull(socialConversations.deletedAt),
        ),
      ),
    db
      .select({ value: sql<number>`COALESCE(sum(${socialConversations.unreadCount}), 0)`.as("value") })
      .from(socialConversations)
      .where(
        and(
          eq(socialConversations.companyId, companyId),
          eq(socialConversations.platform, "whatsapp"),
          isNull(socialConversations.deletedAt),
        ),
      ),
    db
      .select({ value: count() })
      .from(whatsappTemplates)
      .where(
        and(
          eq(whatsappTemplates.companyId, companyId),
          eq(whatsappTemplates.status, "approved"),
          isNull(whatsappTemplates.deletedAt),
        ),
      ),
    db
      .select({ value: count() })
      .from(whatsappWebhookEvents)
      .where(and(eq(whatsappWebhookEvents.companyId, companyId), gte(whatsappWebhookEvents.receivedAt, dayStart))),
    db
      .select({ value: count() })
      .from(whatsappWebhookEvents)
      .where(
        and(
          eq(whatsappWebhookEvents.companyId, companyId),
          eq(whatsappWebhookEvents.status, "failed"),
          gte(whatsappWebhookEvents.receivedAt, startOfDaysAgo(6)),
        ),
      ),
  ]);

  const weekMap = new Map<string, number>();
  for (const row of messagesSentWeekRow) {
    weekMap.set(row.day, Number(row.value ?? 0));
  }

  const messagesSentSeries: Array<{ day: string; count: number }> = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = startOfDaysAgo(offset);
    const key = date.toISOString().slice(0, 10);
    messagesSentSeries.push({ day: key, count: weekMap.get(key) ?? 0 });
  }

  return ok(c, {
    workspaces: {
      total: workspacesConnectedRow[0]?.value ?? 0,
      active: workspacesActiveRow[0]?.value ?? 0,
      verified: workspacesVerifiedRow[0]?.value ?? 0,
    },
    messagesToday: {
      sent: messagesSentTodayRow[0]?.value ?? 0,
      received: messagesReceivedTodayRow[0]?.value ?? 0,
      failed: messagesFailedTodayRow[0]?.value ?? 0,
    },
    messagesSentSeries,
    conversations: {
      active24h: activeConversationsRow[0]?.value ?? 0,
      open: openConversationsRow[0]?.value ?? 0,
      unread: Number(unreadConversationsRow[0]?.value ?? 0),
    },
    templates: {
      approved: approvedTemplatesRow[0]?.value ?? 0,
    },
    webhooks: {
      eventsToday: webhookEventsTodayRow[0]?.value ?? 0,
      failedLast7d: webhookEventsFailedRow[0]?.value ?? 0,
    },
  });
}

export async function getWhatsappDashboardConnections(c: Context<AppEnv>) {
  const tenant = c.get("tenant");

  const rows = await db
    .select({
      id: whatsappWorkspaces.id,
      name: whatsappWorkspaces.name,
      phoneNumberId: whatsappWorkspaces.phoneNumberId,
      businessAccountId: whatsappWorkspaces.businessAccountId,
      isActive: whatsappWorkspaces.isActive,
      isVerified: whatsappWorkspaces.isVerified,
      webhookKey: whatsappWorkspaces.webhookKey,
      metadata: whatsappWorkspaces.metadata,
      updatedAt: whatsappWorkspaces.updatedAt,
    })
    .from(whatsappWorkspaces)
    .where(and(eq(whatsappWorkspaces.companyId, tenant.companyId), isNull(whatsappWorkspaces.deletedAt)))
    .orderBy(desc(whatsappWorkspaces.isVerified), desc(whatsappWorkspaces.updatedAt))
    .limit(20);

  const items = rows.map((workspace) => {
    const metadata = (workspace.metadata ?? {}) as Record<string, unknown>;
    const phoneRegistrationStatus = typeof metadata.phoneRegistrationStatus === "string" ? metadata.phoneRegistrationStatus : null;
    const connected = workspace.isActive && (phoneRegistrationStatus === null || /connected|verified|registered|approved|live/i.test(phoneRegistrationStatus));
    return {
      id: workspace.id,
      name: workspace.name,
      phoneNumberId: workspace.phoneNumberId,
      businessAccountId: workspace.businessAccountId,
      webhookKey: workspace.webhookKey,
      isActive: workspace.isActive,
      isVerified: workspace.isVerified,
      status: connected ? (workspace.isVerified ? "ready" : "limited") : "blocked",
      displayPhoneNumber: typeof metadata.displayPhoneNumber === "string" ? metadata.displayPhoneNumber : null,
      verifiedName: typeof metadata.verifiedName === "string" ? metadata.verifiedName : null,
      qualityRating: typeof metadata.qualityRating === "string" ? metadata.qualityRating : null,
      messagingLimit: typeof metadata.messagingLimit === "string" ? metadata.messagingLimit : null,
      phoneRegistrationStatus,
      lastMetaSyncAt: typeof metadata.lastMetaSyncAt === "string" ? metadata.lastMetaSyncAt : null,
      updatedAt: workspace.updatedAt,
    };
  });

  return ok(c, { items });
}

export async function getWhatsappRecentWebhookEvents(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as z.infer<typeof recentEventsQuerySchema>;

  const conditions = [eq(whatsappWebhookEvents.companyId, tenant.companyId)];
  if (query.workspaceId) {
    conditions.push(eq(whatsappWebhookEvents.workspaceId, query.workspaceId));
  }

  const rows = await db
    .select({
      id: whatsappWebhookEvents.id,
      workspaceId: whatsappWebhookEvents.workspaceId,
      eventKey: whatsappWebhookEvents.eventKey,
      eventType: whatsappWebhookEvents.eventType,
      status: whatsappWebhookEvents.status,
      attempts: whatsappWebhookEvents.attempts,
      lastError: whatsappWebhookEvents.lastError,
      receivedAt: whatsappWebhookEvents.receivedAt,
      processedAt: whatsappWebhookEvents.processedAt,
    })
    .from(whatsappWebhookEvents)
    .where(and(...conditions))
    .orderBy(desc(whatsappWebhookEvents.receivedAt))
    .limit(query.limit);

  return ok(c, { items: rows });
}

export async function getWhatsappRecentActivity(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as z.infer<typeof recentActivityQuerySchema>;

  const rows = await db
    .select({
      id: socialMessages.id,
      conversationId: socialMessages.conversationId,
      direction: socialMessages.direction,
      deliveryStatus: socialMessages.deliveryStatus,
      messageType: socialMessages.messageType,
      body: socialMessages.body,
      senderName: socialMessages.senderName,
      sentAt: socialMessages.sentAt,
      contactName: socialConversations.contactName,
      contactHandle: socialConversations.contactHandle,
      accountId: socialConversations.socialAccountId,
      accountName: socialAccounts.accountName,
    })
    .from(socialMessages)
    .innerJoin(socialConversations, eq(socialConversations.id, socialMessages.conversationId))
    .innerJoin(socialAccounts, eq(socialAccounts.id, socialConversations.socialAccountId))
    .where(and(eq(socialMessages.companyId, tenant.companyId), eq(socialConversations.platform, "whatsapp")))
    .orderBy(desc(socialMessages.sentAt))
    .limit(query.limit);

  return ok(
    c,
    {
      items: rows.map((row) => ({
        ...row,
        // Trim long bodies for list rendering
        body: typeof row.body === "string" && row.body.length > 240 ? `${row.body.slice(0, 237)}…` : row.body,
      })),
    },
  );
}
