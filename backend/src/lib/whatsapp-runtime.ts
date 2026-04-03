import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import {
  automations,
  conversationStates,
  socialAccounts,
  socialConversations,
  socialMessages,
  whatsappWebhookEvents,
  whatsappWorkspaces,
} from "@/db/schema";
import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { renderTemplateContent } from "@/lib/template-renderer";
import { getWhatsappWorkspaceByPhoneNumberId, normalizePhoneToE164, resolvePhoneMapping } from "@/lib/whatsapp-workspace";
import crypto from "node:crypto";

function getWhatsappPhoneNumberId(account: typeof socialAccounts.$inferSelect) {
  const phoneNumberId = account.metadata?.phoneNumberId;
  return typeof phoneNumberId === "string" && phoneNumberId.length > 0 ? phoneNumberId : null;
}

function getWhatsappWorkspaceId(account: typeof socialAccounts.$inferSelect) {
  const workspaceId = account.metadata?.workspaceId;
  return typeof workspaceId === "string" && workspaceId.length > 0 ? workspaceId : null;
}

function getWhatsappAccessToken(account: typeof socialAccounts.$inferSelect, workspace?: typeof whatsappWorkspaces.$inferSelect | null) {
  const metadataToken = account.metadata?.accessToken;
  if (typeof metadataToken === "string" && metadataToken.length > 0) {
    return metadataToken;
  }

  if (workspace?.accessToken) {
    return workspace.accessToken;
  }

  return env.WHATSAPP_ACCESS_TOKEN || null;
}

function getWhatsappApiBaseUrl() {
  return `https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}`;
}

async function sendWhatsappViaMeta(input: {
  account: typeof socialAccounts.$inferSelect;
  workspace?: typeof whatsappWorkspaces.$inferSelect | null;
  contactHandle: string;
  body?: string;
  messageType?: "text" | "template" | "interactive" | "media";
  template?: {
    name: string;
    language?: string;
    components?: Array<Record<string, unknown>>;
  };
  interactive?: Record<string, unknown>;
  media?: {
    mediaType?: "image" | "document" | "video" | "audio";
    link?: string;
    caption?: string;
  };
}) {
  const phoneNumberId = getWhatsappPhoneNumberId(input.account) ?? input.workspace?.phoneNumberId ?? null;
  const accessToken = getWhatsappAccessToken(input.account, input.workspace);

  if (!phoneNumberId || !accessToken) {
    throw AppError.conflict("WhatsApp account is missing phoneNumberId or access token");
  }

  const outboundType = input.messageType ?? "text";
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.contactHandle,
    type: outboundType,
  };

  if (outboundType === "template") {
    if (!input.template?.name) {
      throw AppError.badRequest("Template message requires template name");
    }
    payload.template = {
      name: input.template.name,
      language: {
        code: input.template.language ?? "en",
      },
      components: input.template.components ?? [],
    };
  } else if (outboundType === "interactive") {
    if (!input.interactive) {
      throw AppError.badRequest("Interactive message requires interactive payload");
    }
    payload.interactive = input.interactive;
  } else if (outboundType === "media") {
    const mediaType = input.media?.mediaType ?? "image";
    const mediaLink = input.media?.link;
    if (!mediaLink) {
      throw AppError.badRequest("Media message requires media link");
    }
    payload.type = mediaType;
    payload[mediaType] = {
      link: mediaLink,
      caption: input.media?.caption,
    };
  } else {
    payload.text = {
      preview_url: false,
      body: input.body ?? "",
    };
  }

  const response = await fetch(`${getWhatsappApiBaseUrl()}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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

async function getWhatsappWorkspaceForAccount(companyId: string, account: typeof socialAccounts.$inferSelect) {
  const workspaceId = getWhatsappWorkspaceId(account);
  if (!workspaceId) {
    return null;
  }

  const [workspace] = await db
    .select()
    .from(whatsappWorkspaces)
    .where(and(eq(whatsappWorkspaces.companyId, companyId), eq(whatsappWorkspaces.id, workspaceId), isNull(whatsappWorkspaces.deletedAt)))
    .limit(1);

  return workspace ?? null;
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
  messageTemplate?: string;
  messageType?: "text" | "template" | "interactive" | "media";
  template?: {
    name: string;
    language?: string;
    components?: Array<Record<string, unknown>>;
  };
  interactive?: Record<string, unknown>;
  media?: {
    mediaType?: "image" | "document" | "video" | "audio";
    link?: string;
    caption?: string;
  };
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
  const workspace = await getWhatsappWorkspaceForAccount(input.companyId, account);

  const rendered = await renderTemplateContent({
    companyId: input.companyId,
    content: input.messageTemplate ?? "",
    leadId: input.leadId,
    customerId: input.customerId,
    variables: input.variables,
  });

  const phoneE164 = normalizePhoneToE164(input.contactHandle);

  const sendResponse = await sendWhatsappViaMeta({
    account,
    workspace,
    contactHandle: phoneE164.replace("+", ""),
    body: rendered.content,
    messageType: input.messageType,
    template: input.template,
    interactive: input.interactive,
    media: input.media,
  });
  const providerMessageId = sendResponse.messages?.[0]?.id ?? null;

  const [message] = await db
    .insert(socialMessages)
    .values({
      companyId: input.companyId,
      conversationId: conversation.id,
      direction: "outbound",
      messageType: input.messageType ?? "text",
      deliveryStatus: providerMessageId ? "sent" : "failed",
      providerMessageId,
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
      lastOutboundAt: new Date(message.sentAt),
      messageStatusSummary: providerMessageId ? { lastProviderMessageId: providerMessageId, status: "sent" } : { status: "failed" },
      updatedAt: new Date(),
    })
    .where(eq(socialConversations.id, conversation.id));

  await resolvePhoneMapping({
    companyId: input.companyId,
    phoneRaw: phoneE164,
    leadId: input.leadId,
    customerId: input.customerId,
    socialConversationId: conversation.id,
    metadata: {
      direction: "outbound",
      providerMessageId,
    },
  });

  await syncConversationState({
    companyId: input.companyId,
    socialConversationId: conversation.id,
    automationId: input.automationId ?? null,
    automationRunId: input.automationRunId ?? null,
    currentNode: "awaiting_reply",
      state: {
      contactHandle: phoneE164,
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
  messageType?: string | null;
  providerMessageId?: string | null;
  createdBy?: string | null;
}) {
  const account = await getWhatsappAccount(input.companyId, input.accountId);
  if (!account) {
    throw AppError.conflict("No connected WhatsApp account is available");
  }
  const phoneE164 = normalizePhoneToE164(input.contactHandle);

  const conversation = await findOrCreateWhatsappConversation({
    companyId: input.companyId,
    accountId: account.id,
    contactHandle: phoneE164,
    contactName: input.contactName,
    createdBy: input.createdBy ?? account.createdBy,
  });

  const [message] = await db
    .insert(socialMessages)
    .values({
      companyId: input.companyId,
      conversationId: conversation.id,
      direction: "inbound",
      messageType: input.messageType ?? "text",
      deliveryStatus: "delivered",
      providerMessageId: input.providerMessageId ?? null,
      senderName: input.contactName ?? phoneE164,
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
      messageStatusSummary: {
        lastInboundMessageId: message.id,
        lastInboundStatus: "delivered",
      },
      updatedAt: new Date(),
    })
    .where(eq(socialConversations.id, conversation.id));

  await resolvePhoneMapping({
    companyId: input.companyId,
    phoneRaw: phoneE164,
    leadId: conversation.leadId,
    socialConversationId: conversation.id,
    metadata: {
      direction: "inbound",
      providerMessageId: input.providerMessageId ?? null,
    },
  });

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
          messages?: Array<{
            id?: string;
            from?: string;
            type?: string;
            text?: { body?: string };
            interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
            image?: { id?: string };
            document?: { id?: string };
            audio?: { id?: string };
            video?: { id?: string };
          }>;
        };
      }>;
    }>;
  };

  const ingested: Array<{ companyId: string; conversationId: string; messageId: string; leadId: string | null }> = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) {
        continue;
      }

      for (const message of value?.messages ?? []) {
        const contactName = value?.contacts?.[0]?.profile?.name;
        const contactHandle = message?.from;
        const messageType = message?.type ?? "text";
        const body =
          message?.text?.body ??
          message?.interactive?.button_reply?.title ??
          message?.interactive?.list_reply?.title ??
          (messageType === "image"
            ? "[media:image]"
            : messageType === "video"
              ? "[media:video]"
              : messageType === "audio"
                ? "[media:audio]"
                : messageType === "document"
                  ? "[media:document]"
                  : null);

        if (!contactHandle || !body) {
          continue;
        }

        const account = await findWhatsappAccountByPhoneNumberId(phoneNumberId);
        if (!account) {
          const workspace = await getWhatsappWorkspaceByPhoneNumberId(phoneNumberId);
          if (!workspace) {
            continue;
          }
          const fallbackAccount = await getWhatsappAccount(workspace.companyId);
          if (!fallbackAccount) {
            continue;
          }
          const eventKey = `meta:${phoneNumberId}:${message.id ?? crypto.randomUUID()}`;
          const [event] = await db
            .insert(whatsappWebhookEvents)
            .values({
              companyId: workspace.companyId,
              workspaceId: workspace.id,
              eventKey,
              payload: message as Record<string, unknown>,
            })
            .onConflictDoNothing({
              target: [whatsappWebhookEvents.companyId, whatsappWebhookEvents.eventKey],
            })
            .returning();

          if (!event) {
            continue;
          }

          const received = await ingestWhatsappReply({
            companyId: workspace.companyId,
            accountId: fallbackAccount.id,
            contactHandle,
            contactName,
            body,
            messageType,
            providerMessageId: message.id ?? null,
          });

          ingested.push({
            companyId: workspace.companyId,
            conversationId: received.conversation.id,
            messageId: received.message.id,
            leadId: received.conversation.leadId ?? null,
          });
          continue;
        }

        const eventKey = `meta:${phoneNumberId}:${message.id ?? crypto.randomUUID()}`;
        const [event] = await db
          .insert(whatsappWebhookEvents)
          .values({
            companyId: account.companyId,
            eventKey,
            payload: message as Record<string, unknown>,
          })
          .onConflictDoNothing({
            target: [whatsappWebhookEvents.companyId, whatsappWebhookEvents.eventKey],
          })
          .returning();

        if (!event) {
          continue;
        }

        const received = await ingestWhatsappReply({
          companyId: account.companyId,
          accountId: account.id,
          contactHandle,
          contactName,
          body,
          messageType,
          providerMessageId: message.id ?? null,
        });

        ingested.push({
          companyId: account.companyId,
          conversationId: received.conversation.id,
          messageId: received.message.id,
          leadId: received.conversation.leadId ?? null,
        });
      }
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
