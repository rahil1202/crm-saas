import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { automations, conversationStates, socialAccounts, socialConversations, socialMessages } from "@/db/schema";
import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { renderTemplateContent } from "@/lib/template-renderer";
import crypto from "node:crypto";

function getWhatsappPhoneNumberId(account: typeof socialAccounts.$inferSelect) {
  const phoneNumberId = account.metadata?.phoneNumberId;
  return typeof phoneNumberId === "string" && phoneNumberId.length > 0 ? phoneNumberId : null;
}

function getWhatsappAccessToken(account: typeof socialAccounts.$inferSelect) {
  const metadataToken = account.metadata?.accessToken;
  if (typeof metadataToken === "string" && metadataToken.length > 0) {
    return metadataToken;
  }

  return env.WHATSAPP_ACCESS_TOKEN || null;
}

function getWhatsappApiBaseUrl() {
  return `https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}`;
}

async function sendWhatsappViaMeta(input: {
  account: typeof socialAccounts.$inferSelect;
  contactHandle: string;
  body: string;
}) {
  const phoneNumberId = getWhatsappPhoneNumberId(input.account);
  const accessToken = getWhatsappAccessToken(input.account);

  if (!phoneNumberId || !accessToken) {
    throw AppError.conflict("WhatsApp account is missing phoneNumberId or access token");
  }

  const response = await fetch(`${getWhatsappApiBaseUrl()}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.contactHandle,
      type: "text",
      text: {
        preview_url: false,
        body: input.body,
      },
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw AppError.conflict(`Meta WhatsApp send failed: ${response.status}`, details);
  }

  return (await response.json()) as {
    messages?: Array<{ id?: string }>;
  };
}

async function getWhatsappAccount(companyId: string, accountId?: string | null) {
  const conditions = [eq(socialAccounts.companyId, companyId), eq(socialAccounts.platform, "whatsapp"), isNull(socialAccounts.deletedAt)];
  if (accountId) {
    conditions.push(eq(socialAccounts.id, accountId));
  }

  const [account] = await db
    .select()
    .from(socialAccounts)
    .where(and(...conditions))
    .limit(1);

  return account ?? null;
}

export async function findOrCreateWhatsappConversation(input: {
  companyId: string;
  accountId?: string | null;
  contactHandle: string;
  contactName?: string | null;
  createdBy: string;
}) {
  const account = await getWhatsappAccount(input.companyId, input.accountId);
  if (!account) {
    throw AppError.conflict("No connected WhatsApp account is available");
  }

  const [existing] = await db
    .select()
    .from(socialConversations)
    .where(
      and(
        eq(socialConversations.companyId, input.companyId),
        eq(socialConversations.socialAccountId, account.id),
        eq(socialConversations.contactHandle, input.contactHandle),
        isNull(socialConversations.deletedAt),
      ),
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  const [conversation] = await db
    .insert(socialConversations)
    .values({
      companyId: input.companyId,
      socialAccountId: account.id,
      platform: "whatsapp",
      contactName: input.contactName ?? null,
      contactHandle: input.contactHandle,
      status: "open",
      latestMessage: null,
      unreadCount: 0,
      lastMessageAt: new Date(),
      createdBy: input.createdBy,
    })
    .returning();

  return conversation;
}

export async function syncConversationState(input: {
  companyId: string;
  socialConversationId: string;
  automationId?: string | null;
  automationRunId?: string | null;
  currentNode?: string;
  state?: Record<string, unknown>;
  expiresAt?: Date | null;
  status?: "active" | "paused" | "completed" | "expired";
}) {
  const sessionKey = `${input.socialConversationId}:${input.automationId ?? "manual"}`;

  const [state] = await db
    .insert(conversationStates)
    .values({
      companyId: input.companyId,
      socialConversationId: input.socialConversationId,
      automationId: input.automationId ?? null,
      automationRunId: input.automationRunId ?? null,
      sessionKey,
      currentNode: input.currentNode ?? "start",
      status: input.status ?? "active",
      state: input.state ?? {},
      expiresAt: input.expiresAt ?? null,
      lastMessageAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [conversationStates.companyId, conversationStates.sessionKey],
      set: {
        automationRunId: input.automationRunId ?? null,
        currentNode: input.currentNode ?? "start",
        status: input.status ?? "active",
        state: input.state ?? {},
        expiresAt: input.expiresAt ?? null,
        lastMessageAt: new Date(),
        resumedAt: new Date(),
        completedAt: input.status === "completed" ? new Date() : null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return state;
}

export async function sendWhatsappMessage(input: {
  companyId: string;
  accountId?: string | null;
  contactHandle: string;
  contactName?: string | null;
  messageTemplate: string;
  createdBy: string;
  automationId?: string | null;
  automationRunId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  variables?: Record<string, unknown>;
}) {
  const conversation = await findOrCreateWhatsappConversation({
    companyId: input.companyId,
    accountId: input.accountId,
    contactHandle: input.contactHandle,
    contactName: input.contactName,
    createdBy: input.createdBy,
  });
  const account = await getWhatsappAccount(input.companyId, conversation.socialAccountId);
  if (!account) {
    throw AppError.conflict("No connected WhatsApp account is available");
  }

  const rendered = await renderTemplateContent({
    companyId: input.companyId,
    content: input.messageTemplate,
    leadId: input.leadId,
    customerId: input.customerId,
    variables: input.variables,
  });

  const sendResponse = await sendWhatsappViaMeta({
    account,
    contactHandle: input.contactHandle,
    body: rendered.content,
  });
  const providerMessageId = sendResponse.messages?.[0]?.id ?? null;

  const [message] = await db
    .insert(socialMessages)
    .values({
      companyId: input.companyId,
      conversationId: conversation.id,
      direction: "outbound",
      senderName: "WhatsApp Automation",
      body: rendered.content,
      metadata: providerMessageId ? { provider: "meta_whatsapp", providerMessageId } : {},
      createdBy: input.createdBy,
    })
    .returning();

  await db
    .update(socialConversations)
    .set({
      latestMessage: rendered.content,
      unreadCount: 0,
      lastMessageAt: new Date(message.sentAt),
      updatedAt: new Date(),
    })
    .where(eq(socialConversations.id, conversation.id));

  await syncConversationState({
    companyId: input.companyId,
    socialConversationId: conversation.id,
    automationId: input.automationId ?? null,
    automationRunId: input.automationRunId ?? null,
    currentNode: "awaiting_reply",
    state: {
      contactHandle: input.contactHandle,
      outboundMessageId: message.id,
    },
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
  });

  return {
    conversation,
    message,
  };
}

export async function ingestWhatsappReply(input: {
  companyId: string;
  accountId?: string | null;
  contactHandle: string;
  contactName?: string | null;
  body: string;
  createdBy?: string | null;
}) {
  const account = await getWhatsappAccount(input.companyId, input.accountId);
  if (!account) {
    throw AppError.conflict("No connected WhatsApp account is available");
  }

  const conversation = await findOrCreateWhatsappConversation({
    companyId: input.companyId,
    accountId: account.id,
    contactHandle: input.contactHandle,
    contactName: input.contactName,
    createdBy: input.createdBy ?? account.createdBy,
  });

  const [message] = await db
    .insert(socialMessages)
    .values({
      companyId: input.companyId,
      conversationId: conversation.id,
      direction: "inbound",
      senderName: input.contactName ?? input.contactHandle,
      body: input.body,
      metadata: {
        provider: "meta_whatsapp",
      },
      createdBy: input.createdBy ?? null,
    })
    .returning();

  await db
    .update(socialConversations)
    .set({
      latestMessage: input.body,
      unreadCount: conversation.unreadCount + 1,
      lastMessageAt: new Date(message.sentAt),
      status: conversation.assignedToUserId ? "assigned" : "open",
      updatedAt: new Date(),
    })
    .where(eq(socialConversations.id, conversation.id));

  const [existingState] = await db
    .select()
    .from(conversationStates)
    .where(and(eq(conversationStates.companyId, input.companyId), eq(conversationStates.socialConversationId, conversation.id)))
    .limit(1);

  if (existingState) {
    await syncConversationState({
      companyId: input.companyId,
      socialConversationId: conversation.id,
      automationId: existingState.automationId,
      automationRunId: existingState.automationRunId,
      currentNode: "reply_received",
      state: {
        ...(existingState.state ?? {}),
        lastInboundMessageId: message.id,
        replyBody: input.body,
      },
      status: "active",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    });
  }

  return {
    conversation,
    message,
    state: existingState ?? null,
  };
}

export function verifyWhatsappWebhookSignature(rawBody: string, signatureHeader: string | null) {
  if (!env.WHATSAPP_APP_SECRET) {
    throw AppError.conflict("WHATSAPP_APP_SECRET is not configured");
  }
  if (!signatureHeader?.startsWith("sha256=")) {
    throw AppError.unauthorized("Missing Meta webhook signature");
  }

  const expected = `sha256=${crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET).update(rawBody).digest("hex")}`;
  const signatureBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw AppError.unauthorized("Invalid Meta webhook signature");
  }
}

export function verifyWhatsappWebhookChallenge(query: Record<string, string | undefined>) {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];

  if (mode !== "subscribe" || !challenge || token !== env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    throw AppError.unauthorized("Webhook verification failed");
  }

  return challenge;
}

async function findWhatsappAccountByPhoneNumberId(phoneNumberId: string) {
  const accounts = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.platform, "whatsapp"), isNull(socialAccounts.deletedAt)));

  return (
    accounts.find((account) => {
      const candidate = account.metadata?.phoneNumberId;
      return typeof candidate === "string" && candidate === phoneNumberId;
    }) ?? null
  );
}

export async function ingestMetaWhatsappWebhook(rawBody: string, signatureHeader: string | null) {
  verifyWhatsappWebhookSignature(rawBody, signatureHeader);
  const payload = JSON.parse(rawBody) as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string };
          contacts?: Array<{ profile?: { name?: string } }>;
          messages?: Array<{ from?: string; text?: { body?: string } }>;
        };
      }>;
    }>;
  };

  const ingested: Array<{ companyId: string; conversationId: string; messageId: string; leadId: string | null }> = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      const message = value?.messages?.[0];
      const contactName = value?.contacts?.[0]?.profile?.name;
      const contactHandle = message?.from;
      const body = message?.text?.body;

      if (!phoneNumberId || !contactHandle || !body) {
        continue;
      }

      const account = await findWhatsappAccountByPhoneNumberId(phoneNumberId);
      if (!account) {
        continue;
      }

      const received = await ingestWhatsappReply({
        companyId: account.companyId,
        accountId: account.id,
        contactHandle,
        contactName,
        body,
      });

      ingested.push({
        companyId: account.companyId,
        conversationId: received.conversation.id,
        messageId: received.message.id,
        leadId: received.conversation.leadId ?? null,
      });
    }
  }

  return {
    accepted: true,
    ingested,
  };
}

export async function expireConversationStates() {
  const now = new Date();
  const states = await db
    .select()
    .from(conversationStates)
    .where(and(eq(conversationStates.status, "active")));

  let expired = 0;
  for (const state of states) {
    if (!state.expiresAt || new Date(state.expiresAt) > now) {
      continue;
    }

    await db
      .update(conversationStates)
      .set({
        status: "expired",
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(conversationStates.id, state.id));
    expired += 1;
  }

  return expired;
}

export async function getConversationStateByRun(runId: string) {
  const [state] = await db
    .select()
    .from(conversationStates)
    .where(eq(conversationStates.automationRunId, runId))
    .limit(1);

  return state ?? null;
}
