import { and, asc, count, desc, eq, ilike, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { recordTriggerEvent } from "@/lib/automation-runtime";
import { createNotification } from "@/lib/notifications";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { ingestMetaWhatsappWebhook, sendWhatsappMessage, verifyWhatsappWebhookChallenge } from "@/lib/whatsapp-runtime";
import { companyMemberships, leads, profiles, socialAccounts, socialConversations, socialMessages } from "@/db/schema";
import {
  socialAccountParamSchema,
  socialConversationParamSchema,
} from "@/modules/social/schema";
import type {
  CaptureSocialConversationInput,
  ConvertSocialConversationInput,
  CreateSocialAccountInput,
  CreateSocialMessageInput,
  ListSocialAccountsQuery,
  ListSocialInboxQuery,
  ListWhatsappLogQuery,
  UpdateSocialAccountInput,
  UpdateSocialConversationInput,
  SendWhatsappMessageInput,
} from "@/modules/social/schema";

async function assertSocialAccount(companyId: string, accountId: string) {
  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.companyId, companyId), isNull(socialAccounts.deletedAt)))
    .limit(1);

  if (!account) {
    throw AppError.notFound("Social account not found");
  }

  return account;
}

async function assertAssignableUser(companyId: string, assignedToUserId?: string | null) {
  if (!assignedToUserId) {
    return;
  }

  const [user] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .innerJoin(companyMemberships, eq(companyMemberships.userId, profiles.id))
    .where(
      and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.userId, assignedToUserId),
        isNull(companyMemberships.deletedAt),
      ),
    )
    .limit(1);

  if (!user) {
    throw AppError.badRequest("Assigned user is not available in this company");
  }
}

async function getConversation(companyId: string, conversationId: string) {
  const [conversation] = await db
    .select()
    .from(socialConversations)
    .where(and(eq(socialConversations.id, conversationId), eq(socialConversations.companyId, companyId), isNull(socialConversations.deletedAt)))
    .limit(1);

  if (!conversation) {
    throw AppError.notFound("Social conversation not found");
  }

  return conversation;
}

export function getSocialOverview(c: Parameters<typeof ok>[0]) {
  return ok(c, {
    module: "social",
    capabilities: ["connect-accounts", "capture-social-leads", "social-inbox", "assign-social-leads"],
  });
}

export async function listSocialAccounts(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListSocialAccountsQuery;

  const conditions = [eq(socialAccounts.companyId, tenant.companyId), isNull(socialAccounts.deletedAt)];
  if (query.platform) {
    conditions.push(eq(socialAccounts.platform, query.platform));
  }

  const items = await db
    .select()
    .from(socialAccounts)
    .where(and(...conditions))
    .orderBy(desc(socialAccounts.createdAt));

  return ok(c, { items });
}

export async function listWhatsappLog(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListWhatsappLogQuery;

  const items = await db
    .select({
      id: socialMessages.id,
      conversationId: socialMessages.conversationId,
      direction: socialMessages.direction,
      senderName: socialMessages.senderName,
      body: socialMessages.body,
      metadata: socialMessages.metadata,
      sentAt: socialMessages.sentAt,
      contactName: socialConversations.contactName,
      contactHandle: socialConversations.contactHandle,
      accountName: socialAccounts.accountName,
      accountHandle: socialAccounts.handle,
    })
    .from(socialMessages)
    .innerJoin(socialConversations, eq(socialConversations.id, socialMessages.conversationId))
    .innerJoin(socialAccounts, eq(socialAccounts.id, socialConversations.socialAccountId))
    .where(and(eq(socialMessages.companyId, tenant.companyId), eq(socialConversations.platform, "whatsapp")))
    .orderBy(desc(socialMessages.sentAt))
    .limit(query.limit);

  return ok(c, { items });
}

export async function createSocialAccount(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateSocialAccountInput;

  const [created] = await db
    .insert(socialAccounts)
    .values({
      companyId: tenant.companyId,
      platform: body.platform,
      accountName: body.accountName,
      handle: body.handle,
      status: body.status,
      accessMode: body.accessMode,
      metadata: body.metadata,
      createdBy: user.id,
    })
    .returning();

  return ok(c, created, 201);
}

export async function updateSocialAccount(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = socialAccountParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateSocialAccountInput;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one social account field is required");
  }

  const [updated] = await db
    .update(socialAccounts)
    .set({
      ...(body.platform !== undefined ? { platform: body.platform } : {}),
      ...(body.accountName !== undefined ? { accountName: body.accountName } : {}),
      ...(body.handle !== undefined ? { handle: body.handle } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.accessMode !== undefined ? { accessMode: body.accessMode } : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(socialAccounts.id, params.accountId), eq(socialAccounts.companyId, tenant.companyId), isNull(socialAccounts.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Social account not found");
  }

  return ok(c, updated);
}

export async function deleteSocialAccount(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = socialAccountParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(socialAccounts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(socialAccounts.id, params.accountId), eq(socialAccounts.companyId, tenant.companyId), isNull(socialAccounts.deletedAt)))
    .returning({ id: socialAccounts.id });

  if (!deleted) {
    throw AppError.notFound("Social account not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
}

export async function listSocialInbox(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListSocialInboxQuery;

  const conditions = [eq(socialConversations.companyId, tenant.companyId), isNull(socialConversations.deletedAt)];
  if (query.status) {
    conditions.push(eq(socialConversations.status, query.status));
  }
  if (query.platform) {
    conditions.push(eq(socialConversations.platform, query.platform));
  }
  if (query.assignedToUserId) {
    conditions.push(eq(socialConversations.assignedToUserId, query.assignedToUserId));
  }
  if (query.search) {
    conditions.push(ilike(socialConversations.contactHandle, `%${query.search}%`));
  }

  const where = and(...conditions);
  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: socialConversations.id,
        socialAccountId: socialConversations.socialAccountId,
        leadId: socialConversations.leadId,
        assignedToUserId: socialConversations.assignedToUserId,
        platform: socialConversations.platform,
        contactName: socialConversations.contactName,
        contactHandle: socialConversations.contactHandle,
        status: socialConversations.status,
        subject: socialConversations.subject,
        latestMessage: socialConversations.latestMessage,
        unreadCount: socialConversations.unreadCount,
        lastMessageAt: socialConversations.lastMessageAt,
        accountName: socialAccounts.accountName,
        accountHandle: socialAccounts.handle,
        leadTitle: leads.title,
      })
      .from(socialConversations)
      .innerJoin(socialAccounts, eq(socialAccounts.id, socialConversations.socialAccountId))
      .leftJoin(leads, eq(leads.id, socialConversations.leadId))
      .where(where)
      .orderBy(desc(socialConversations.lastMessageAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: count() }).from(socialConversations).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function captureSocialConversation(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CaptureSocialConversationInput;

  const account = await assertSocialAccount(tenant.companyId, body.socialAccountId);
  await assertAssignableUser(tenant.companyId, body.assignedToUserId);

  const [conversation] = await db
    .insert(socialConversations)
    .values({
      companyId: tenant.companyId,
      socialAccountId: account.id,
      assignedToUserId: body.assignedToUserId ?? null,
      platform: account.platform,
      contactName: body.contactName ?? null,
      contactHandle: body.contactHandle,
      status: body.assignedToUserId ? "assigned" : "open",
      subject: body.subject ?? null,
      latestMessage: body.message,
      unreadCount: 1,
      lastMessageAt: new Date(),
      createdBy: user.id,
    })
    .returning();

  await db.insert(socialMessages).values({
    companyId: tenant.companyId,
    conversationId: conversation.id,
    direction: "inbound",
    senderName: body.contactName ?? body.contactHandle,
    body: body.message,
    createdBy: user.id,
  });

  await createNotification({
    companyId: tenant.companyId,
    type: "lead",
    title: "New social conversation captured",
    message: `${body.contactHandle} sent a ${account.platform} inquiry`,
    entityPath: "/dashboard/social",
    payload: {
      conversationId: conversation.id,
      platform: account.platform,
    },
  });

  return ok(c, conversation, 201);
}

export async function getSocialMessages(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = socialConversationParamSchema.parse(c.req.param());
  await getConversation(tenant.companyId, params.conversationId);

  const items = await db
    .select()
    .from(socialMessages)
    .where(and(eq(socialMessages.companyId, tenant.companyId), eq(socialMessages.conversationId, params.conversationId)))
    .orderBy(asc(socialMessages.sentAt), asc(socialMessages.createdAt));

  return ok(c, { items });
}

export async function createSocialMessage(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = socialConversationParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as CreateSocialMessageInput;
  const conversation = await getConversation(tenant.companyId, params.conversationId);

  const [created] = await db
    .insert(socialMessages)
    .values({
      companyId: tenant.companyId,
      conversationId: conversation.id,
      direction: body.direction,
      senderName: body.senderName ?? (body.direction === "outbound" ? "Team" : conversation.contactName ?? conversation.contactHandle),
      body: body.body,
      createdBy: user.id,
    })
    .returning();

  const unreadCount = body.direction === "inbound" ? conversation.unreadCount + 1 : 0;
  await db
    .update(socialConversations)
    .set({
      latestMessage: body.body,
      unreadCount,
      lastMessageAt: new Date(created.sentAt),
      status: conversation.assignedToUserId ? "assigned" : conversation.status,
      updatedAt: new Date(),
    })
    .where(eq(socialConversations.id, conversation.id));

  return ok(c, created, 201);
}

export async function updateSocialConversation(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = socialConversationParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateSocialConversationInput;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one social conversation field is required");
  }

  await assertAssignableUser(tenant.companyId, body.assignedToUserId);

  const [updated] = await db
    .update(socialConversations)
    .set({
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.assignedToUserId !== undefined
        ? {
            assignedToUserId: body.assignedToUserId ?? null,
            status: body.assignedToUserId ? "assigned" : body.status ?? "open",
          }
        : {}),
      ...(body.unreadCount !== undefined ? { unreadCount: body.unreadCount } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(socialConversations.id, params.conversationId), eq(socialConversations.companyId, tenant.companyId), isNull(socialConversations.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Social conversation not found");
  }

  return ok(c, updated);
}

export async function convertSocialConversationToLead(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = socialConversationParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as ConvertSocialConversationInput;
  const conversation = await getConversation(tenant.companyId, params.conversationId);

  if (conversation.leadId) {
    throw AppError.conflict("Conversation has already been converted to a lead", { leadId: conversation.leadId });
  }

  const assignedToUserId = body.assignedToUserId ?? conversation.assignedToUserId ?? null;
  await assertAssignableUser(tenant.companyId, assignedToUserId);

  const [createdLead] = await db
    .insert(leads)
    .values({
      companyId: tenant.companyId,
      storeId: tenant.storeId ?? null,
      assignedToUserId,
      title: body.title ?? `${conversation.platform} lead: ${conversation.contactName ?? conversation.contactHandle}`,
      fullName: conversation.contactName ?? null,
      source: body.source,
      notes: `Imported from social inbox.\n\nLatest message: ${conversation.latestMessage ?? ""}`,
      score: body.score,
      createdBy: user.id,
    })
    .returning({ id: leads.id, title: leads.title });

  await db
    .update(socialConversations)
    .set({
      leadId: createdLead.id,
      assignedToUserId,
      status: assignedToUserId ? "assigned" : "closed",
      unreadCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(socialConversations.id, conversation.id));

  await createNotification({
    companyId: tenant.companyId,
    type: "lead",
    title: "Social conversation converted",
    message: `${createdLead.title} was created from ${conversation.platform}`,
    entityId: createdLead.id,
    entityPath: "/dashboard/leads",
    payload: {
      conversationId: conversation.id,
      source: body.source,
    },
  });

  return ok(c, {
    conversationId: conversation.id,
    leadId: createdLead.id,
    converted: true,
  });
}

export async function sendWhatsappConversationMessage(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as SendWhatsappMessageInput;

  const sent = await sendWhatsappMessage({
    companyId: tenant.companyId,
    accountId: body.accountId,
    contactHandle: body.contactHandle,
    contactName: body.contactName,
    messageTemplate: body.message,
    createdBy: user.id,
    leadId: body.leadId,
    customerId: body.customerId,
    variables: body.variables,
  });

  return ok(c, sent, 201);
}

export async function verifyWhatsappWebhook(c: Context) {
  const challenge = verifyWhatsappWebhookChallenge(c.req.query());
  return c.text(challenge, 200);
}

export async function ingestWhatsappProviderWebhook(c: Context) {
  const rawBody = await c.req.text();
  const ingested = await ingestMetaWhatsappWebhook(rawBody, c.req.header("x-hub-signature-256") ?? null);

  for (const item of ingested.ingested) {
    await recordTriggerEvent({
      companyId: item.companyId,
      triggerType: "whatsapp.replied",
      eventKey: `whatsapp.replied:${item.conversationId}:${item.messageId}`,
      entityType: "conversation",
      entityId: item.conversationId,
      payload: {
        conversationId: item.conversationId,
        messageId: item.messageId,
        leadId: item.leadId,
      },
    });
  }

  return c.json({ success: true, ingested: ingested.ingested.length }, 200);
}
