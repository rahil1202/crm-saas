import { and, asc, desc, eq, gt, gte, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  contactTags,
  conversationNotes,
  conversationParticipants,
  conversationTags,
  leads,
  messageAttachments,
  messageStatusLogs,
  profiles,
  socialAccounts,
  socialConversations,
  socialMessages,
  whatsappContactProfiles,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { publishWhatsappEvent } from "@/lib/whatsapp-realtime";

/**
 * WhatsApp CRM — Phase 2 inbox service.
 *
 * This file is the single source of truth for Phase 2 business logic. The HTTP
 * controller at modules/whatsapp-inbox/controller.ts is a thin translator from
 * Hono context to these functions. Keeping logic here means:
 *
 *   - the webhook worker (lib/whatsapp-runtime.ts) can call the same helpers
 *     to emit realtime events and mutate inbox state,
 *   - future MCP/CLI tools can reuse the same surface, and
 *   - unit tests can cover the service without spinning up HTTP.
 *
 * Every helper is tenant-scoped: every query carries `companyId` so the
 * module is safe under multi-tenant isolation.
 */

export interface ConversationRow {
  id: string;
  socialAccountId: string;
  leadId: string | null;
  assignedToUserId: string | null;
  platform: string;
  contactName: string | null;
  contactHandle: string;
  status: "open" | "assigned" | "closed";
  humanTakeoverEnabled: boolean;
  botState: string;
  subject: string | null;
  latestMessage: string | null;
  resolvedAt: string | null;
  lastOutboundAt: string | null;
  lastMessageAt: string;
  unreadCount: number;
  pinnedAt: string | null;
  archivedAt: string | null;
  priority: string;
  agentLastReadAt: string | null;
  tagIds: string[];
  accountName: string;
  accountHandle: string;
  leadTitle: string | null;
  assignedToName: string | null;
  assignedToEmail: string | null;
}

export interface ListInboxOptions {
  companyId: string;
  status?: "open" | "assigned" | "closed";
  assignedToUserId?: string | null;
  unassigned?: boolean;
  assignedToMe?: string | null;
  tagId?: string;
  pinned?: boolean;
  archived?: boolean;
  priority?: "low" | "normal" | "high" | "urgent";
  search?: string;
  limit?: number;
  cursor?: string;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function listInboxConversations(options: ListInboxOptions) {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const conditions = [
    eq(socialConversations.companyId, options.companyId),
    eq(socialConversations.platform, "whatsapp"),
    isNull(socialConversations.deletedAt),
  ];

  if (options.status) {
    conditions.push(eq(socialConversations.status, options.status));
  }
  if (options.assignedToMe) {
    conditions.push(eq(socialConversations.assignedToUserId, options.assignedToMe));
  } else if (options.assignedToUserId) {
    conditions.push(eq(socialConversations.assignedToUserId, options.assignedToUserId));
  } else if (options.unassigned) {
    conditions.push(isNull(socialConversations.assignedToUserId));
  }
  if (options.priority) {
    conditions.push(eq(socialConversations.priority, options.priority));
  }
  if (options.pinned) {
    conditions.push(sql`${socialConversations.pinnedAt} is not null`);
  }
  if (options.archived === true) {
    conditions.push(sql`${socialConversations.archivedAt} is not null`);
  } else if (options.archived === false) {
    conditions.push(isNull(socialConversations.archivedAt));
  }
  if (options.tagId) {
    conditions.push(sql`${socialConversations.tagIds} @> ${JSON.stringify([options.tagId])}::jsonb`);
  }
  if (options.search) {
    const like = `%${options.search.trim()}%`;
    conditions.push(
      or(
        ilike(socialConversations.contactHandle, like),
        ilike(socialConversations.contactName, like),
        ilike(socialConversations.latestMessage, like),
      )!,
    );
  }
  if (options.cursor) {
    const cursorDate = new Date(options.cursor);
    if (!Number.isNaN(cursorDate.getTime())) {
      conditions.push(lt(socialConversations.lastMessageAt, cursorDate));
    }
  }

  const rows = await db
    .select({
      id: socialConversations.id,
      socialAccountId: socialConversations.socialAccountId,
      leadId: socialConversations.leadId,
      assignedToUserId: socialConversations.assignedToUserId,
      platform: socialConversations.platform,
      contactName: socialConversations.contactName,
      contactHandle: socialConversations.contactHandle,
      status: socialConversations.status,
      humanTakeoverEnabled: socialConversations.humanTakeoverEnabled,
      botState: socialConversations.botState,
      subject: socialConversations.subject,
      latestMessage: socialConversations.latestMessage,
      resolvedAt: socialConversations.resolvedAt,
      lastOutboundAt: socialConversations.lastOutboundAt,
      lastMessageAt: socialConversations.lastMessageAt,
      unreadCount: socialConversations.unreadCount,
      pinnedAt: socialConversations.pinnedAt,
      archivedAt: socialConversations.archivedAt,
      priority: socialConversations.priority,
      agentLastReadAt: socialConversations.agentLastReadAt,
      tagIds: socialConversations.tagIds,
      accountName: socialAccounts.accountName,
      accountHandle: socialAccounts.handle,
      leadTitle: leads.title,
      assignedToName: profiles.fullName,
      assignedToEmail: profiles.email,
    })
    .from(socialConversations)
    .innerJoin(socialAccounts, eq(socialAccounts.id, socialConversations.socialAccountId))
    .leftJoin(leads, eq(leads.id, socialConversations.leadId))
    .leftJoin(profiles, eq(profiles.id, socialConversations.assignedToUserId))
    .where(and(...conditions))
    .orderBy(
      desc(sql`CASE WHEN ${socialConversations.pinnedAt} IS NOT NULL THEN 1 ELSE 0 END`),
      desc(socialConversations.lastMessageAt),
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    ...row,
    resolvedAt: toIso(row.resolvedAt),
    lastOutboundAt: toIso(row.lastOutboundAt),
    lastMessageAt: toIso(row.lastMessageAt) ?? new Date().toISOString(),
    pinnedAt: toIso(row.pinnedAt),
    archivedAt: toIso(row.archivedAt),
    agentLastReadAt: toIso(row.agentLastReadAt),
  })) as ConversationRow[];

  const nextCursor = hasMore ? toIso(items[items.length - 1]?.lastMessageAt ?? null) : null;
  return { items, nextCursor };
}

export async function getConversationOrThrow(companyId: string, conversationId: string) {
  const [row] = await db
    .select()
    .from(socialConversations)
    .where(
      and(
        eq(socialConversations.companyId, companyId),
        eq(socialConversations.id, conversationId),
        isNull(socialConversations.deletedAt),
      ),
    )
    .limit(1);
  if (!row) {
    throw AppError.notFound("WhatsApp conversation not found");
  }
  return row;
}

export interface ListMessagesOptions {
  companyId: string;
  conversationId: string;
  limit?: number;
  before?: string; // ISO timestamp
}

export async function listConversationMessages(options: ListMessagesOptions) {
  await getConversationOrThrow(options.companyId, options.conversationId);
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 200);

  const conditions = [
    eq(socialMessages.companyId, options.companyId),
    eq(socialMessages.conversationId, options.conversationId),
    isNull(socialMessages.deletedAt),
  ];
  if (options.before) {
    const parsed = new Date(options.before);
    if (!Number.isNaN(parsed.getTime())) {
      conditions.push(lt(socialMessages.sentAt, parsed));
    }
  }

  const rows = await db
    .select()
    .from(socialMessages)
    .where(and(...conditions))
    .orderBy(desc(socialMessages.sentAt), desc(socialMessages.createdAt))
    .limit(limit + 1);

  const attachmentIds = rows.map((row) => row.id);
  const attachments = attachmentIds.length
    ? await db
        .select()
        .from(messageAttachments)
        .where(
          and(
            eq(messageAttachments.companyId, options.companyId),
            inArray(messageAttachments.messageId, attachmentIds),
            isNull(messageAttachments.deletedAt),
          ),
        )
    : [];

  const attachmentsByMessage = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    if (!attachment.messageId) continue;
    const bucket = attachmentsByMessage.get(attachment.messageId) ?? [];
    bucket.push(attachment);
    attachmentsByMessage.set(attachment.messageId, bucket);
  }

  const hasMore = rows.length > limit;
  const trimmed = rows.slice(0, limit).reverse();
  return {
    items: trimmed.map((row) => ({
      ...row,
      attachments: attachmentsByMessage.get(row.id) ?? [],
    })),
    hasMore,
    nextBefore: hasMore ? toIso(rows[limit - 1]?.sentAt ?? null) : null,
  };
}

export async function markConversationRead(companyId: string, conversationId: string, userId: string) {
  const conversation = await getConversationOrThrow(companyId, conversationId);
  const now = new Date();

  const [updated] = await db
    .update(socialConversations)
    .set({
      unreadCount: 0,
      agentLastReadAt: now,
      updatedAt: now,
    })
    .where(and(eq(socialConversations.id, conversation.id), eq(socialConversations.companyId, companyId)))
    .returning();

  // Participant read cursor (upsert)
  await db
    .insert(conversationParticipants)
    .values({
      companyId,
      conversationId: conversation.id,
      userId,
      role: "watcher",
      lastReadAt: now,
    })
    .onConflictDoUpdate({
      target: [conversationParticipants.conversationId, conversationParticipants.userId],
      set: { lastReadAt: now },
    });

  publishWhatsappEvent({
    type: "conversation.updated",
    companyId,
    conversationId: conversation.id,
    patch: { unreadCount: 0, agentLastReadAt: now.toISOString() },
  });

  return updated;
}

export interface PatchConversationInput {
  status?: "open" | "assigned" | "closed";
  assignedToUserId?: string | null;
  humanTakeoverEnabled?: boolean;
  pinned?: boolean;
  archived?: boolean;
  priority?: "low" | "normal" | "high" | "urgent";
  tagIds?: string[];
  subject?: string | null;
}

export async function patchConversation(companyId: string, conversationId: string, patch: PatchConversationInput) {
  const conversation = await getConversationOrThrow(companyId, conversationId);
  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  if (patch.status !== undefined) {
    updates.status = patch.status;
    if (patch.status === "closed" && !conversation.resolvedAt) {
      updates.resolvedAt = now;
    }
    if (patch.status !== "closed") {
      updates.resolvedAt = null;
    }
  }
  if (patch.assignedToUserId !== undefined) {
    updates.assignedToUserId = patch.assignedToUserId ?? null;
    if (patch.assignedToUserId) {
      updates.status = "assigned";
    }
  }
  if (patch.humanTakeoverEnabled !== undefined) {
    updates.humanTakeoverEnabled = patch.humanTakeoverEnabled;
    updates.botState = patch.humanTakeoverEnabled ? "human_takeover" : "bot_active";
  }
  if (patch.pinned !== undefined) {
    updates.pinnedAt = patch.pinned ? now : null;
  }
  if (patch.archived !== undefined) {
    updates.archivedAt = patch.archived ? now : null;
  }
  if (patch.priority !== undefined) {
    updates.priority = patch.priority;
  }
  if (patch.tagIds !== undefined) {
    // Guard that all tagIds belong to company
    if (patch.tagIds.length > 0) {
      const existing = await db
        .select({ id: conversationTags.id })
        .from(conversationTags)
        .where(
          and(
            eq(conversationTags.companyId, companyId),
            inArray(conversationTags.id, patch.tagIds),
            isNull(conversationTags.deletedAt),
          ),
        );
      if (existing.length !== patch.tagIds.length) {
        throw AppError.badRequest("One or more tags are invalid for this company");
      }
    }
    updates.tagIds = patch.tagIds;
  }
  if (patch.subject !== undefined) {
    updates.subject = patch.subject;
  }

  const [updated] = await db
    .update(socialConversations)
    .set(updates)
    .where(
      and(
        eq(socialConversations.id, conversation.id),
        eq(socialConversations.companyId, companyId),
      ),
    )
    .returning();

  publishWhatsappEvent({
    type: "conversation.updated",
    companyId,
    conversationId: conversation.id,
    patch: updates as Record<string, unknown>,
  });

  if (patch.assignedToUserId !== undefined) {
    publishWhatsappEvent({
      type: "conversation.assigned",
      companyId,
      conversationId: conversation.id,
      assignedToUserId: patch.assignedToUserId ?? null,
    });
  }

  return updated;
}

// -----------------------------------------------------------------
// Notes + mentions
// -----------------------------------------------------------------

export async function listConversationNotes(companyId: string, conversationId: string) {
  await getConversationOrThrow(companyId, conversationId);
  return db
    .select({
      id: conversationNotes.id,
      conversationId: conversationNotes.conversationId,
      authorId: conversationNotes.authorId,
      body: conversationNotes.body,
      mentions: conversationNotes.mentions,
      createdAt: conversationNotes.createdAt,
      updatedAt: conversationNotes.updatedAt,
      authorName: profiles.fullName,
      authorEmail: profiles.email,
    })
    .from(conversationNotes)
    .leftJoin(profiles, eq(profiles.id, conversationNotes.authorId))
    .where(
      and(
        eq(conversationNotes.companyId, companyId),
        eq(conversationNotes.conversationId, conversationId),
        isNull(conversationNotes.deletedAt),
      ),
    )
    .orderBy(asc(conversationNotes.createdAt));
}

export async function createConversationNote(params: {
  companyId: string;
  conversationId: string;
  authorId: string;
  body: string;
  mentions?: string[];
}) {
  await getConversationOrThrow(params.companyId, params.conversationId);
  const mentions = params.mentions ?? [];

  const [note] = await db
    .insert(conversationNotes)
    .values({
      companyId: params.companyId,
      conversationId: params.conversationId,
      authorId: params.authorId,
      body: params.body,
      mentions,
    })
    .returning();

  publishWhatsappEvent({
    type: "conversation.note",
    companyId: params.companyId,
    conversationId: params.conversationId,
    noteId: note.id,
    authorId: note.authorId,
    body: note.body,
    mentions: note.mentions,
    createdAt: (note.createdAt as Date).toISOString(),
  });

  return note;
}

export async function deleteConversationNote(companyId: string, noteId: string) {
  const [deleted] = await db
    .update(conversationNotes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(conversationNotes.id, noteId), eq(conversationNotes.companyId, companyId)))
    .returning({ id: conversationNotes.id, conversationId: conversationNotes.conversationId });

  if (!deleted) {
    throw AppError.notFound("Note not found");
  }
  return deleted;
}

// -----------------------------------------------------------------
// Tags
// -----------------------------------------------------------------

export async function listTags(companyId: string) {
  return db
    .select()
    .from(conversationTags)
    .where(and(eq(conversationTags.companyId, companyId), isNull(conversationTags.deletedAt)))
    .orderBy(asc(conversationTags.name));
}

export async function upsertTag(params: {
  companyId: string;
  id?: string;
  name: string;
  color?: string;
  description?: string | null;
  createdBy?: string | null;
}) {
  if (params.id) {
    const [updated] = await db
      .update(conversationTags)
      .set({
        name: params.name,
        ...(params.color !== undefined ? { color: params.color } : {}),
        ...(params.description !== undefined ? { description: params.description } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(conversationTags.id, params.id), eq(conversationTags.companyId, params.companyId), isNull(conversationTags.deletedAt)))
      .returning();
    if (!updated) {
      throw AppError.notFound("Tag not found");
    }
    return updated;
  }

  const [created] = await db
    .insert(conversationTags)
    .values({
      companyId: params.companyId,
      name: params.name,
      color: params.color ?? "emerald",
      description: params.description ?? null,
      createdBy: params.createdBy ?? null,
    })
    .returning();
  return created;
}

export async function deleteTag(companyId: string, tagId: string) {
  const [deleted] = await db
    .update(conversationTags)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(conversationTags.id, tagId), eq(conversationTags.companyId, companyId), isNull(conversationTags.deletedAt)))
    .returning({ id: conversationTags.id });
  if (!deleted) {
    throw AppError.notFound("Tag not found");
  }
  // Clear any conversation tagIds containing this id + unlink contact tags
  await db
    .update(socialConversations)
    .set({
      tagIds: sql`coalesce((select jsonb_agg(elem) from jsonb_array_elements_text(${socialConversations.tagIds}) elem where elem != ${tagId}), '[]'::jsonb)`,
      updatedAt: new Date(),
    })
    .where(eq(socialConversations.companyId, companyId));
  await db.delete(contactTags).where(and(eq(contactTags.companyId, companyId), eq(contactTags.tagId, tagId)));
  return deleted;
}

// -----------------------------------------------------------------
// Contact profiles
// -----------------------------------------------------------------

export interface ListContactsOptions {
  companyId: string;
  limit?: number;
  cursor?: string;
  search?: string;
  tagId?: string;
  engagementStatus?: "hot" | "warm" | "cold" | "dormant";
  optInStatus?: "opted_in" | "opted_out" | "unknown";
}

export async function listContacts(options: ListContactsOptions) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const conditions = [
    eq(whatsappContactProfiles.companyId, options.companyId),
    isNull(whatsappContactProfiles.deletedAt),
  ];

  if (options.search) {
    const like = `%${options.search.trim()}%`;
    conditions.push(
      or(
        ilike(whatsappContactProfiles.displayName, like),
        ilike(whatsappContactProfiles.phoneE164, like),
      )!,
    );
  }
  if (options.engagementStatus) {
    conditions.push(eq(whatsappContactProfiles.engagementStatus, options.engagementStatus));
  }
  if (options.optInStatus) {
    conditions.push(eq(whatsappContactProfiles.optInStatus, options.optInStatus));
  }
  if (options.cursor) {
    conditions.push(lt(whatsappContactProfiles.phoneE164, options.cursor));
  }

  let tagFilterHandles: string[] | null = null;
  if (options.tagId) {
    const tagged = await db
      .select({ handle: contactTags.contactHandle })
      .from(contactTags)
      .where(and(eq(contactTags.companyId, options.companyId), eq(contactTags.tagId, options.tagId)));
    tagFilterHandles = tagged.map((row) => row.handle);
    if (tagFilterHandles.length === 0) {
      return { items: [], nextCursor: null };
    }
    conditions.push(inArray(whatsappContactProfiles.phoneE164, tagFilterHandles));
  }

  const rows = await db
    .select()
    .from(whatsappContactProfiles)
    .where(and(...conditions))
    .orderBy(desc(whatsappContactProfiles.lastInboundAt), asc(whatsappContactProfiles.phoneE164))
    .limit(limit + 1);

  const handles = rows.slice(0, limit).map((row) => row.phoneE164);
  const tags = handles.length
    ? await db
        .select({
          contactHandle: contactTags.contactHandle,
          tagId: contactTags.tagId,
          tagName: conversationTags.name,
          tagColor: conversationTags.color,
        })
        .from(contactTags)
        .innerJoin(conversationTags, eq(conversationTags.id, contactTags.tagId))
        .where(
          and(
            eq(contactTags.companyId, options.companyId),
            inArray(contactTags.contactHandle, handles),
            isNull(conversationTags.deletedAt),
          ),
        )
    : [];
  const tagsByHandle = new Map<string, Array<{ id: string; name: string; color: string }>>();
  for (const tag of tags) {
    const bucket = tagsByHandle.get(tag.contactHandle) ?? [];
    bucket.push({ id: tag.tagId, name: tag.tagName, color: tag.tagColor });
    tagsByHandle.set(tag.contactHandle, bucket);
  }

  const hasMore = rows.length > limit;
  return {
    items: rows.slice(0, limit).map((row) => ({
      ...row,
      tags: tagsByHandle.get(row.phoneE164) ?? [],
    })),
    nextCursor: hasMore ? rows[limit - 1]?.phoneE164 : null,
  };
}

export async function upsertContactProfile(params: {
  companyId: string;
  phoneE164: string;
  patch: {
    displayName?: string | null;
    optInStatus?: "opted_in" | "opted_out" | "unknown";
    optInSource?: string | null;
    engagementStatus?: "hot" | "warm" | "cold" | "dormant";
    customFields?: Record<string, unknown>;
    avatarUrl?: string | null;
    locale?: string | null;
  };
}) {
  const now = new Date();
  const [row] = await db
    .insert(whatsappContactProfiles)
    .values({
      companyId: params.companyId,
      phoneE164: params.phoneE164,
      displayName: params.patch.displayName ?? null,
      optInStatus: params.patch.optInStatus ?? "unknown",
      optInSource: params.patch.optInSource ?? null,
      engagementStatus: params.patch.engagementStatus ?? "cold",
      customFields: params.patch.customFields ?? {},
      avatarUrl: params.patch.avatarUrl ?? null,
      locale: params.patch.locale ?? null,
      optInAt: params.patch.optInStatus === "opted_in" ? now : null,
      optOutAt: params.patch.optInStatus === "opted_out" ? now : null,
    })
    .onConflictDoUpdate({
      target: [whatsappContactProfiles.companyId, whatsappContactProfiles.phoneE164],
      set: {
        ...(params.patch.displayName !== undefined ? { displayName: params.patch.displayName } : {}),
        ...(params.patch.optInStatus !== undefined ? { optInStatus: params.patch.optInStatus } : {}),
        ...(params.patch.optInSource !== undefined ? { optInSource: params.patch.optInSource } : {}),
        ...(params.patch.engagementStatus !== undefined ? { engagementStatus: params.patch.engagementStatus } : {}),
        ...(params.patch.customFields !== undefined ? { customFields: params.patch.customFields } : {}),
        ...(params.patch.avatarUrl !== undefined ? { avatarUrl: params.patch.avatarUrl } : {}),
        ...(params.patch.locale !== undefined ? { locale: params.patch.locale } : {}),
        ...(params.patch.optInStatus === "opted_in" ? { optInAt: now } : {}),
        ...(params.patch.optInStatus === "opted_out" ? { optOutAt: now } : {}),
        updatedAt: now,
      },
    })
    .returning();

  publishWhatsappEvent({
    type: "contact.updated",
    companyId: params.companyId,
    phoneE164: params.phoneE164,
  });

  return row;
}

export async function setContactTags(params: {
  companyId: string;
  contactHandle: string;
  tagIds: string[];
}) {
  const validTagIds = params.tagIds.length
    ? (
        await db
          .select({ id: conversationTags.id })
          .from(conversationTags)
          .where(
            and(
              eq(conversationTags.companyId, params.companyId),
              inArray(conversationTags.id, params.tagIds),
              isNull(conversationTags.deletedAt),
            ),
          )
      ).map((row) => row.id)
    : [];

  await db
    .delete(contactTags)
    .where(and(eq(contactTags.companyId, params.companyId), eq(contactTags.contactHandle, params.contactHandle)));
  if (validTagIds.length) {
    await db.insert(contactTags).values(
      validTagIds.map((tagId) => ({
        companyId: params.companyId,
        contactHandle: params.contactHandle,
        tagId,
      })),
    );
  }
  return validTagIds;
}

// -----------------------------------------------------------------
// Message lifecycle events (internal)
// -----------------------------------------------------------------

export async function recordMessageStatus(params: {
  companyId: string;
  messageId: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  occurredAt?: Date;
  source?: string;
  metadata?: Record<string, unknown>;
}) {
  const occurredAt = params.occurredAt ?? new Date();
  await db.insert(messageStatusLogs).values({
    companyId: params.companyId,
    messageId: params.messageId,
    status: params.status,
    occurredAt,
    source: params.source ?? "provider",
    metadata: params.metadata ?? {},
  });

  const updates: Record<string, unknown> = { deliveryStatus: params.status };
  if (params.status === "delivered") {
    updates.deliveredAt = occurredAt;
  }
  if (params.status === "read") {
    updates.readAt = occurredAt;
    updates.deliveredAt = occurredAt; // read implies delivered
  }
  if (params.status === "failed") {
    updates.failedAt = occurredAt;
  }

  const [message] = await db
    .update(socialMessages)
    .set(updates)
    .where(and(eq(socialMessages.id, params.messageId), eq(socialMessages.companyId, params.companyId)))
    .returning({
      id: socialMessages.id,
      conversationId: socialMessages.conversationId,
    });

  if (message) {
    publishWhatsappEvent({
      type: "message.status",
      companyId: params.companyId,
      conversationId: message.conversationId,
      messageId: message.id,
      status: params.status,
      at: occurredAt.toISOString(),
    });
  }
}
