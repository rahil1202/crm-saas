import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";

import { db } from "@/db/client";
import {
  automations,
  conversationStates,
  socialAccounts,
  socialConversations,
  socialMessages,
  whatsappContactProfiles,
  whatsappMediaAssets,
  whatsappMessageCosts,
  whatsappMessageEvents,
  whatsappMessageLinks,
  whatsappOutbox,
  whatsappSessions,
  whatsappTemplates,
  whatsappWebhookEvents,
  whatsappWorkspaces,
} from "@/db/schema";
import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { decryptIntegrationSecret } from "@/lib/integration-crypto";
import { safeExternalFetch } from "@/lib/safe-fetch";
import { guardWebhookReplay } from "@/lib/security";
import { renderTemplateContent } from "@/lib/template-renderer";
import { getWhatsappWorkspaceByPhoneNumberId, normalizePhoneToE164, resolvePhoneMapping } from "@/lib/whatsapp-workspace";
import {
  finalizeWhatsappMessageCost,
  inferWhatsappMessageCategory,
  recordEstimatedWhatsappMessageCost,
} from "@/lib/whatsapp-pricing";
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
    return decryptIntegrationSecret(metadataToken);
  }

  if (workspace?.accessToken) {
    return decryptIntegrationSecret(workspace.accessToken);
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
    id?: string;
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
    const mediaId = input.media?.id;
    if (!mediaLink && !mediaId) {
      throw AppError.badRequest("Media message requires media link or media id");
    }
    payload.type = mediaType;
    payload[mediaType] = {
      ...(mediaId ? { id: mediaId } : { link: mediaLink }),
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
    id?: string;
    link?: string;
    caption?: string;
  };
  createdBy: string;
  automationId?: string | null;
  automationRunId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  variables?: Record<string, unknown>;
  skipConversationStateSync?: boolean;
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

  if (!input.skipConversationStateSync) {
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
  }

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

  try {
    const { publishWhatsappEvent } = await import("@/lib/whatsapp-realtime");
    publishWhatsappEvent({
      type: "message.created",
      companyId: input.companyId,
      conversationId: conversation.id,
      messageId: message.id,
      direction: "inbound",
      body: message.body,
      messageType: message.messageType,
      deliveryStatus: message.deliveryStatus,
      contactHandle: conversation.contactHandle,
      contactName: conversation.contactName,
      sentAt: (message.sentAt as Date).toISOString(),
    });
  } catch {
    // Realtime publish is best-effort; never block webhook ingest.
  }

  // Best-effort contact profile upkeep so the Contacts list reflects engagement.
  try {
    const { upsertContactProfile } = await import("@/lib/whatsapp-inbox");
    await upsertContactProfile({
      companyId: input.companyId,
      phoneE164: conversation.contactHandle.startsWith("+") ? conversation.contactHandle : `+${conversation.contactHandle}`,
      patch: {
        displayName: conversation.contactName ?? input.contactName ?? null,
        engagementStatus: "warm",
      },
    });
    await db
      .update(whatsappContactProfiles)
      .set({ lastInboundAt: new Date(), updatedAt: new Date() })
      .where(and(eq(whatsappContactProfiles.companyId, input.companyId), eq(whatsappContactProfiles.phoneE164, conversation.contactHandle.startsWith("+") ? conversation.contactHandle : `+${conversation.contactHandle}`)));
  } catch {
    // Contact upkeep is best-effort.
  }

  // Phase 4: resume an active flow first, then evaluate keyword triggers and automation rules.
  try {
    const { evaluateKeywordTriggers, evaluateAutomationRules } = await import("@/lib/whatsapp-flow-automation");
    const { resumeActiveChatbotFlowForConversation } = await import("@/lib/chatbot-flow-engine");
    const ctx = {
      companyId: input.companyId,
      conversationId: conversation.id,
      contactHandle: conversation.contactHandle,
      contactName: conversation.contactName,
      messageBody: input.body,
      messageId: message.id,
      createdBy: input.createdBy ?? conversation.createdBy,
    };

    const resumed = await resumeActiveChatbotFlowForConversation({
      companyId: ctx.companyId,
      socialConversationId: ctx.conversationId,
      inboundMessageBody: ctx.messageBody,
      lastInboundMessageId: ctx.messageId,
    });

    if (resumed) {
      return {
        conversation,
        message,
        state: existingState ?? null,
      };
    }

    const keywordHandled = await evaluateKeywordTriggers(ctx);
    if (!keywordHandled) {
      await evaluateAutomationRules(ctx);
    }
  } catch {
    // Automation evaluation is best-effort; never block webhook ingest.
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

  const ingested: Array<{ companyId: string; conversationId: string; messageId: string; leadId: string | null; body: string }> = [];

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

          await guardWebhookReplay({
            provider: "whatsapp",
            replayKey: `meta:${phoneNumberId}:${message.id ?? eventKey}`,
            metadata: {
              phoneNumberId,
            },
          });

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
            body,
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

        await guardWebhookReplay({
          provider: "whatsapp",
          replayKey: `meta:${phoneNumberId}:${message.id ?? eventKey}`,
          metadata: {
            companyId: account.companyId,
            phoneNumberId,
          },
        });

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
          body,
        });
      }
    }
  }

  return {
    accepted: true,
    ingested,
  };
}

export type QueuedWhatsappMessageMode = "auto" | "freeform" | "template";

export interface QueueWhatsappApiMessageInput {
  companyId: string;
  createdBy: string;
  workspaceId?: string | null;
  to: string;
  contactName?: string | null;
  crmRef?: {
    leadId?: string | null;
    customerId?: string | null;
    conversationId?: string | null;
  };
  mode?: QueuedWhatsappMessageMode;
  text?: string | null;
  template?: {
    name: string;
    language?: string;
    components?: Array<Record<string, unknown>>;
  } | null;
  media?: {
    mediaAssetId?: string | null;
    mediaType: "image" | "document" | "video" | "audio";
    link?: string | null;
    caption?: string | null;
  } | null;
  interactive?: Record<string, unknown> | null;
  contextMessageId?: string | null;
  idempotencyKey?: string | null;
  priority?: number;
  sendAt?: Date | null;
  variables?: Record<string, unknown>;
}

export interface WhatsappIngestedItem {
  companyId: string;
  conversationId: string;
  messageId: string;
  leadId: string | null;
  body: string;
}

export type WhatsappWebhookIngestCallback = (items: WhatsappIngestedItem[]) => Promise<void>;

const STATUS_PRECEDENCE: Record<string, number> = {
  queued: 0,
  accepted: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: -1,
};

function hashWhatsappSecret(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function constantTimeEquals(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}

function getWorkspaceAppSecret(workspace?: typeof whatsappWorkspaces.$inferSelect | null) {
  return workspace?.appSecret ? decryptIntegrationSecret(workspace.appSecret) : env.WHATSAPP_APP_SECRET || null;
}

async function getWhatsappWorkspaceById(companyId: string, workspaceId?: string | null) {
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

async function getDefaultWhatsappWorkspace(companyId: string) {
  const [workspace] = await db
    .select()
    .from(whatsappWorkspaces)
    .where(and(eq(whatsappWorkspaces.companyId, companyId), eq(whatsappWorkspaces.isActive, true), isNull(whatsappWorkspaces.deletedAt)))
    .orderBy(desc(whatsappWorkspaces.isVerified), desc(whatsappWorkspaces.updatedAt))
    .limit(1);

  return workspace ?? null;
}

async function getWhatsappWorkspaceByWebhookKey(webhookKey: string) {
  const [workspace] = await db
    .select()
    .from(whatsappWorkspaces)
    .where(and(eq(whatsappWorkspaces.webhookKey, webhookKey), eq(whatsappWorkspaces.isActive, true), isNull(whatsappWorkspaces.deletedAt)))
    .limit(1);

  return workspace ?? null;
}

function getPayloadPhoneNumberIds(payload: {
  entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }>;
}) {
  const ids = new Set<string>();
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (phoneNumberId) {
        ids.add(phoneNumberId);
      }
    }
  }
  return [...ids];
}

async function resolveWebhookWorkspace(rawBody: string, webhookKey?: string | null) {
  if (webhookKey) {
    return getWhatsappWorkspaceByWebhookKey(webhookKey);
  }

  const payload = JSON.parse(rawBody) as { entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }> };
  for (const phoneNumberId of getPayloadPhoneNumberIds(payload)) {
    const workspace = await getWhatsappWorkspaceByPhoneNumberId(phoneNumberId);
    if (workspace) {
      return workspace;
    }
  }

  return null;
}

export async function verifyWhatsappWebhookChallengeForWorkspace(webhookKey: string | null, query: Record<string, string | undefined>) {
  if (!webhookKey) {
    return verifyWhatsappWebhookChallenge(query);
  }

  const workspace = await getWhatsappWorkspaceByWebhookKey(webhookKey);
  if (!workspace) {
    throw AppError.unauthorized("Webhook verification failed");
  }

  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  const tokenHash = token ? hashWhatsappSecret(token) : null;
  const expectedHash = workspace.verifyTokenHash || (workspace.verifyToken ? hashWhatsappSecret(decryptIntegrationSecret(workspace.verifyToken)) : null);

  if (mode !== "subscribe" || !challenge || !tokenHash || !expectedHash || !constantTimeEquals(tokenHash, expectedHash)) {
    throw AppError.unauthorized("Webhook verification failed");
  }

  return challenge;
}

export function verifyWhatsappWebhookSignatureForWorkspace(rawBody: string, signatureHeader: string | null, workspace?: typeof whatsappWorkspaces.$inferSelect | null) {
  const appSecret = getWorkspaceAppSecret(workspace);
  if (!appSecret) {
    throw AppError.conflict("WhatsApp app secret is not configured");
  }
  if (!signatureHeader?.startsWith("sha256=")) {
    throw AppError.unauthorized("Missing Meta webhook signature");
  }

  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const signatureBuffer = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw AppError.unauthorized("Invalid Meta webhook signature");
  }
}

export async function enqueueMetaWhatsappWebhook(rawBody: string, signatureHeader: string | null, webhookKey?: string | null) {
  const workspace = await resolveWebhookWorkspace(rawBody, webhookKey);
  verifyWhatsappWebhookSignatureForWorkspace(rawBody, signatureHeader, workspace);

  const payload = JSON.parse(rawBody) as Record<string, unknown>;
  const phoneNumberIds = getPayloadPhoneNumberIds(payload as { entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }> });
  const companyId = workspace?.companyId ?? (phoneNumberIds[0] ? (await getWhatsappWorkspaceByPhoneNumberId(phoneNumberIds[0]))?.companyId : null);
  if (!companyId) {
    throw AppError.conflict("Unable to resolve WhatsApp workspace for webhook");
  }

  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const eventKey = `raw:${webhookKey ?? (phoneNumberIds.join(",") || "unknown")}:${payloadHash}`;
  const [event] = await db
    .insert(whatsappWebhookEvents)
    .values({
      companyId,
      workspaceId: workspace?.id ?? null,
      eventKey,
      eventType: "raw",
      status: "queued",
      rawBody,
      payload,
    })
    .onConflictDoNothing({
      target: [whatsappWebhookEvents.companyId, whatsappWebhookEvents.eventKey],
    })
    .returning();

  return {
    accepted: true,
    duplicate: !event,
    eventId: event?.id ?? null,
  };
}

function extractWhatsappMessageBody(message: {
  type?: string;
  text?: { body?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  image?: { id?: string; caption?: string };
  document?: { id?: string; caption?: string; filename?: string };
  audio?: { id?: string };
  video?: { id?: string; caption?: string };
}) {
  const messageType = message.type ?? "text";
  return (
    message.text?.body ??
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title ??
    message.image?.caption ??
    message.video?.caption ??
    message.document?.caption ??
    (messageType === "image"
      ? "[media:image]"
      : messageType === "video"
        ? "[media:video]"
        : messageType === "audio"
          ? "[media:audio]"
          : messageType === "document"
            ? `[media:document${message.document?.filename ? `:${message.document.filename}` : ""}]`
            : null)
  );
}

async function upsertWhatsappSession(input: {
  companyId: string;
  workspaceId?: string | null;
  conversationId: string;
  phoneE164: string;
  lastInboundAt?: Date | null;
  lastOutboundAt?: Date | null;
  lastTemplateAt?: Date | null;
  metadata?: Record<string, unknown>;
}) {
  const serviceWindowExpiresAt = input.lastInboundAt ? new Date(input.lastInboundAt.getTime() + 1000 * 60 * 60 * 24) : undefined;
  const [session] = await db
    .insert(whatsappSessions)
    .values({
      companyId: input.companyId,
      workspaceId: input.workspaceId ?? null,
      conversationId: input.conversationId,
      phoneE164: input.phoneE164,
      lastInboundAt: input.lastInboundAt ?? null,
      serviceWindowExpiresAt: serviceWindowExpiresAt ?? null,
      state: serviceWindowExpiresAt && serviceWindowExpiresAt > new Date() ? "open" : "closed",
      lastOutboundAt: input.lastOutboundAt ?? null,
      lastTemplateAt: input.lastTemplateAt ?? null,
      metadata: input.metadata ?? {},
    })
    .onConflictDoUpdate({
      target: [whatsappSessions.companyId, whatsappSessions.conversationId],
      set: {
        workspaceId: input.workspaceId ?? null,
        phoneE164: input.phoneE164,
        ...(input.lastInboundAt
          ? {
              lastInboundAt: input.lastInboundAt,
              serviceWindowExpiresAt,
              state: "open",
            }
          : {}),
        ...(input.lastOutboundAt ? { lastOutboundAt: input.lastOutboundAt } : {}),
        ...(input.lastTemplateAt ? { lastTemplateAt: input.lastTemplateAt } : {}),
        metadata: input.metadata ?? {},
        updatedAt: new Date(),
      },
    })
    .returning();

  return session;
}

export async function getWhatsappSession(companyId: string, conversationId: string) {
  const [session] = await db
    .select()
    .from(whatsappSessions)
    .where(and(eq(whatsappSessions.companyId, companyId), eq(whatsappSessions.conversationId, conversationId)))
    .limit(1);

  if (!session) {
    return null;
  }

  const isOpen = Boolean(session.serviceWindowExpiresAt && session.serviceWindowExpiresAt > new Date());
  if ((isOpen && session.state !== "open") || (!isOpen && session.state === "open")) {
    const [updated] = await db
      .update(whatsappSessions)
      .set({ state: isOpen ? "open" : "closed", updatedAt: new Date() })
      .where(eq(whatsappSessions.id, session.id))
      .returning();
    return updated;
  }

  return session;
}

async function getApprovedWhatsappTemplate(input: { companyId: string; workspaceId?: string | null; name: string; language?: string | null }) {
  const conditions = [
    eq(whatsappTemplates.companyId, input.companyId),
    eq(whatsappTemplates.name, input.name),
    eq(whatsappTemplates.language, input.language ?? "en"),
    eq(whatsappTemplates.status, "approved"),
    isNull(whatsappTemplates.deletedAt),
  ];
  if (input.workspaceId) {
    conditions.push(or(eq(whatsappTemplates.workspaceId, input.workspaceId), isNull(whatsappTemplates.workspaceId))!);
  }

  const [template] = await db
    .select()
    .from(whatsappTemplates)
    .where(and(...conditions))
    .orderBy(desc(whatsappTemplates.updatedAt))
    .limit(1);

  if (!template?.providerTemplateId) {
    return null;
  }

  return template;
}

async function resolveMediaForQueue(input: {
  companyId: string;
  workspaceId?: string | null;
  media?: QueueWhatsappApiMessageInput["media"];
}) {
  if (!input.media?.mediaAssetId) {
    return input.media ?? null;
  }

  const [asset] = await db
    .select()
    .from(whatsappMediaAssets)
    .where(and(eq(whatsappMediaAssets.companyId, input.companyId), eq(whatsappMediaAssets.id, input.media.mediaAssetId)))
    .limit(1);

  if (!asset) {
    throw AppError.notFound("WhatsApp media asset not found");
  }

  return {
    mediaType: input.media.mediaType ?? (asset.mediaType as "image" | "document" | "video" | "audio"),
    link: input.media.link ?? asset.sourceUrl,
    id: asset.providerMediaId,
    caption: input.media.caption ?? asset.caption,
  };
}

function buildWhatsappMetaPayload(input: {
  toPhoneE164: string;
  messageType: "text" | "template" | "interactive" | "media";
  text?: string | null;
  template?: QueueWhatsappApiMessageInput["template"];
  interactive?: Record<string, unknown> | null;
  media?: Awaited<ReturnType<typeof resolveMediaForQueue>>;
  contextMessageId?: string | null;
}) {
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.toPhoneE164,
    type: input.messageType === "media" ? input.media?.mediaType ?? "image" : input.messageType,
  };

  if (input.contextMessageId && input.messageType !== "template") {
    payload.context = { message_id: input.contextMessageId };
  }

  if (input.messageType === "template") {
    payload.template = {
      name: input.template?.name,
      language: { code: input.template?.language ?? "en" },
      components: input.template?.components ?? [],
    };
  } else if (input.messageType === "interactive") {
    payload.interactive = input.interactive;
  } else if (input.messageType === "media") {
    const mediaType = input.media?.mediaType ?? "image";
    payload[mediaType] = {
      ...(input.media && "id" in input.media && input.media.id ? { id: input.media.id } : { link: input.media?.link }),
      ...(input.media?.caption ? { caption: input.media.caption } : {}),
    };
  } else {
    payload.text = {
      preview_url: false,
      body: input.text ?? "",
    };
  }

  return payload;
}

async function resolveQueueMode(input: {
  companyId: string;
  workspaceId?: string | null;
  mode: QueuedWhatsappMessageMode;
  session: typeof whatsappSessions.$inferSelect | null;
  text?: string | null;
  template?: QueueWhatsappApiMessageInput["template"];
  media?: QueueWhatsappApiMessageInput["media"];
  interactive?: Record<string, unknown> | null;
}) {
  const windowOpen = Boolean(input.session?.serviceWindowExpiresAt && input.session.serviceWindowExpiresAt > new Date());
  const hasFreeform = Boolean(input.text || input.media || input.interactive);

  if (input.mode === "template" || (!hasFreeform && input.template)) {
    if (!input.template?.name) {
      return { status: "blocked" as const, resolvedMode: "template", reason: "template_required" };
    }
    const approved = await getApprovedWhatsappTemplate({
      companyId: input.companyId,
      workspaceId: input.workspaceId,
      name: input.template.name,
      language: input.template.language,
    });
    return approved
      ? { status: "queued" as const, resolvedMode: "template", messageType: "template" as const }
      : { status: "blocked" as const, resolvedMode: "template", reason: "template_not_approved" };
  }

  if (input.mode === "freeform") {
    return windowOpen
      ? {
          status: "queued" as const,
          resolvedMode: "freeform",
          messageType: input.media ? ("media" as const) : input.interactive ? ("interactive" as const) : ("text" as const),
        }
      : { status: "blocked" as const, resolvedMode: "template_required", reason: "blocked_template_required" };
  }

  if (windowOpen && hasFreeform) {
    return {
      status: "queued" as const,
      resolvedMode: "freeform",
      messageType: input.media ? ("media" as const) : input.interactive ? ("interactive" as const) : ("text" as const),
    };
  }

  if (input.template?.name) {
    const approved = await getApprovedWhatsappTemplate({
      companyId: input.companyId,
      workspaceId: input.workspaceId,
      name: input.template.name,
      language: input.template.language,
    });
    return approved
      ? { status: "queued" as const, resolvedMode: "template", messageType: "template" as const }
      : { status: "blocked" as const, resolvedMode: "template", reason: "template_not_approved" };
  }

  return { status: "blocked" as const, resolvedMode: "template_required", reason: "blocked_template_required" };
}

export async function queueWhatsappMessage(input: QueueWhatsappApiMessageInput) {
  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(whatsappOutbox)
      .where(and(eq(whatsappOutbox.companyId, input.companyId), eq(whatsappOutbox.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing) {
      const session = existing.conversationId ? await getWhatsappSession(input.companyId, existing.conversationId) : null;
      return {
        outbox: existing,
        message: existing.socialMessageId ? (await db.select().from(socialMessages).where(eq(socialMessages.id, existing.socialMessageId)).limit(1))[0] ?? null : null,
        conversation: existing.conversationId ? (await db.select().from(socialConversations).where(eq(socialConversations.id, existing.conversationId)).limit(1))[0] ?? null : null,
        session,
        duplicate: true,
      };
    }
  }

  const workspace = (await getWhatsappWorkspaceById(input.companyId, input.workspaceId)) ?? (await getDefaultWhatsappWorkspace(input.companyId));
  if (!workspace) {
    throw AppError.conflict("No WhatsApp workspace is available");
  }

  const account = await getWhatsappAccount(input.companyId);
  if (!account) {
    throw AppError.conflict("No connected WhatsApp account is available");
  }

  const phoneE164 = normalizePhoneToE164(input.to);
  const existingConversation = input.crmRef?.conversationId
    ? (await db.select().from(socialConversations).where(and(eq(socialConversations.companyId, input.companyId), eq(socialConversations.id, input.crmRef.conversationId))).limit(1))[0] ?? null
    : null;
  const conversation =
    existingConversation ??
    (await findOrCreateWhatsappConversation({
      companyId: input.companyId,
      accountId: account.id,
      contactHandle: phoneE164,
      contactName: input.contactName,
      createdBy: input.createdBy,
    }));

  const session = await getWhatsappSession(input.companyId, conversation.id);
  const resolvedMedia = await resolveMediaForQueue({ companyId: input.companyId, workspaceId: workspace.id, media: input.media ?? null });
  const mode = await resolveQueueMode({
    companyId: input.companyId,
    workspaceId: workspace.id,
    mode: input.mode ?? "auto",
    session,
    text: input.text,
    template: input.template,
    media: input.media ?? null,
    interactive: input.interactive,
  });

  const serviceWindowOpen = Boolean(session?.serviceWindowExpiresAt && session.serviceWindowExpiresAt > new Date());
  const category = inferWhatsappMessageCategory({
    resolvedMode: mode.resolvedMode,
    templateCategory: input.template?.name ? (await getApprovedWhatsappTemplate({
      companyId: input.companyId,
      workspaceId: workspace.id,
      name: input.template.name,
      language: input.template.language,
    }))?.category ?? null : null,
    serviceWindowOpen,
  });
  const body = input.text ?? (input.template ? `[template:${input.template.name}]` : input.media ? `[media:${input.media.mediaType}]` : input.interactive ? "[interactive]" : "");
  const [message] = await db
    .insert(socialMessages)
    .values({
      companyId: input.companyId,
      conversationId: conversation.id,
      direction: "outbound",
      messageType: mode.messageType ?? "template",
      deliveryStatus: mode.status === "blocked" ? "blocked" : "queued",
      providerMessageId: null,
      senderName: "WhatsApp",
      body,
      metadata: {
        provider: "meta_whatsapp",
        outboxStatus: mode.status,
        resolvedMode: mode.resolvedMode,
        pricingCategory: category,
        reason: "reason" in mode ? mode.reason : null,
      },
      createdBy: input.createdBy,
    })
    .returning();

  const metaPayload =
    mode.status === "queued"
      ? buildWhatsappMetaPayload({
          toPhoneE164: phoneE164,
          messageType: mode.messageType,
          text: input.text,
          template: input.template,
          interactive: input.interactive,
          media: resolvedMedia,
          contextMessageId: input.contextMessageId,
        })
      : {};

  const [outbox] = await db
    .insert(whatsappOutbox)
    .values({
      companyId: input.companyId,
      workspaceId: workspace.id,
      conversationId: conversation.id,
      socialMessageId: message.id,
      leadId: input.crmRef?.leadId ?? conversation.leadId ?? null,
      customerId: input.crmRef?.customerId ?? null,
      toPhoneE164: phoneE164,
      mode: input.mode ?? "auto",
      resolvedMode: mode.resolvedMode,
      messageType: mode.messageType ?? "template",
      status: mode.status,
      priority: input.priority ?? 100,
      idempotencyKey: input.idempotencyKey ?? null,
      requestPayload: {
        text: input.text ?? null,
        template: input.template ?? null,
        media: input.media ?? null,
        interactive: input.interactive ?? null,
        crmRef: input.crmRef ?? {},
      },
      metaPayload,
      nextAttemptAt: input.sendAt ?? new Date(),
      lastError: "reason" in mode ? mode.reason : null,
      createdBy: input.createdBy,
    })
    .returning();

  await db
    .update(socialConversations)
    .set({
      latestMessage: body,
      unreadCount: 0,
      lastMessageAt: new Date(message.sentAt),
      lastOutboundAt: new Date(message.sentAt),
      messageStatusSummary: {
        lastOutboundMessageId: message.id,
        outboxId: outbox.id,
        status: outbox.status,
        resolvedMode: outbox.resolvedMode,
      },
      updatedAt: new Date(),
    })
    .where(eq(socialConversations.id, conversation.id));

  await resolvePhoneMapping({
    companyId: input.companyId,
    phoneRaw: phoneE164,
    leadId: input.crmRef?.leadId ?? conversation.leadId ?? null,
    customerId: input.crmRef?.customerId ?? null,
    socialConversationId: conversation.id,
    metadata: {
      direction: "outbound",
      outboxId: outbox.id,
    },
  });

  await upsertWhatsappSession({
    companyId: input.companyId,
    workspaceId: workspace.id,
    conversationId: conversation.id,
    phoneE164,
    lastOutboundAt: new Date(),
    lastTemplateAt: outbox.resolvedMode === "template" ? new Date() : null,
    metadata: {
      lastOutboxId: outbox.id,
      lastResolvedMode: outbox.resolvedMode,
    },
  });

  await recordEstimatedWhatsappMessageCost({
    companyId: input.companyId,
    workspaceId: workspace.id,
    outboxId: outbox.id,
    socialMessageId: message.id,
    toPhoneE164: phoneE164,
    category,
    serviceWindowOpen,
    metadata: {
      resolvedMode: outbox.resolvedMode,
      messageType: outbox.messageType,
    },
  });

  return {
    outbox,
    message,
    conversation,
    session: await getWhatsappSession(input.companyId, conversation.id),
    duplicate: false,
  };
}

async function sendOutboxToMeta(item: typeof whatsappOutbox.$inferSelect) {
  const workspace = item.workspaceId ? (await db.select().from(whatsappWorkspaces).where(eq(whatsappWorkspaces.id, item.workspaceId)).limit(1))[0] ?? null : null;
  const phoneNumberId = workspace?.phoneNumberId;
  const accessToken = workspace?.accessToken ? decryptIntegrationSecret(workspace.accessToken) : env.WHATSAPP_ACCESS_TOKEN || null;
  if (!phoneNumberId || !accessToken) {
    throw AppError.conflict("WhatsApp workspace is missing phoneNumberId or access token");
  }

  const response = await fetch(`${getWhatsappApiBaseUrl()}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(item.metaPayload),
  });

  if (!response.ok) {
    const details = await response.text();
    const error = AppError.conflict(`Meta WhatsApp send failed: ${response.status}`, details);
    (error as AppError & { providerStatus?: number }).providerStatus = response.status;
    throw error;
  }

  return (await response.json()) as {
    contacts?: Array<{ wa_id?: string; input?: string }>;
    messages?: Array<{ id?: string; message_status?: string }>;
  };
}

async function shouldDelayForPairRateLimit(item: typeof whatsappOutbox.$inferSelect) {
  if (!item.workspaceId) {
    return null;
  }

  const [lastSent] = await db
    .select({ sentAt: whatsappOutbox.sentAt })
    .from(whatsappOutbox)
    .where(
      and(
        eq(whatsappOutbox.workspaceId, item.workspaceId),
        eq(whatsappOutbox.toPhoneE164, item.toPhoneE164),
        eq(whatsappOutbox.status, "sent"),
      ),
    )
    .orderBy(desc(whatsappOutbox.sentAt))
    .limit(1);

  if (!lastSent?.sentAt) {
    return null;
  }

  const earliest = new Date(lastSent.sentAt.getTime() + env.WHATSAPP_PAIR_INTERVAL_SECONDS * 1000);
  return earliest > new Date() ? earliest : null;
}

async function shouldDelayForPhoneThroughput(item: typeof whatsappOutbox.$inferSelect) {
  if (!item.workspaceId) {
    return null;
  }
  const since = new Date(Date.now() - 1000);
  const recent = await db
    .select({ id: whatsappOutbox.id })
    .from(whatsappOutbox)
    .where(and(eq(whatsappOutbox.workspaceId, item.workspaceId), eq(whatsappOutbox.status, "sent"), gte(whatsappOutbox.sentAt, since)))
    .limit(Math.ceil(env.WHATSAPP_PHONE_MPS));

  return recent.length >= env.WHATSAPP_PHONE_MPS ? new Date(Date.now() + 1000) : null;
}

function retryDelayMs(attempts: number, message: string) {
  const rateLimited = message.includes("130429") || message.includes("131056") || message.includes("rate");
  const baseSeconds = rateLimited ? 4 : 30;
  return Math.min(1000 * 60 * 30, baseSeconds * 1000 * 2 ** Math.max(0, attempts - 1));
}

async function recordWhatsappAcceptedEvent(input: {
  item: typeof whatsappOutbox.$inferSelect;
  providerMessageId: string;
  phoneNumberId?: string | null;
  waId?: string | null;
  rawPayload: Record<string, unknown>;
}) {
  await db
    .insert(whatsappMessageLinks)
    .values({
      companyId: input.item.companyId,
      workspaceId: input.item.workspaceId,
      outboxId: input.item.id,
      socialMessageId: input.item.socialMessageId,
      conversationId: input.item.conversationId,
      providerMessageId: input.providerMessageId,
      phoneNumberId: input.phoneNumberId ?? null,
      waId: input.waId ?? null,
      direction: "outbound",
    })
    .onConflictDoNothing({
      target: whatsappMessageLinks.providerMessageId,
    });

  await db
    .insert(whatsappMessageEvents)
    .values({
      companyId: input.item.companyId,
      workspaceId: input.item.workspaceId,
      outboxId: input.item.id,
      socialMessageId: input.item.socialMessageId,
      providerMessageId: input.providerMessageId,
      eventType: "accepted",
      eventKey: `accepted:${input.providerMessageId}`,
      rawPayload: input.rawPayload,
    })
    .onConflictDoNothing({
      target: [whatsappMessageEvents.companyId, whatsappMessageEvents.eventKey],
    });
}

export async function processQueuedWhatsappOutbox(limit = 20) {
  const now = new Date();
  const due = await db
    .select()
    .from(whatsappOutbox)
    .where(and(inArray(whatsappOutbox.status, ["queued", "retrying"]), lte(whatsappOutbox.nextAttemptAt, now)))
    .orderBy(asc(whatsappOutbox.priority), asc(whatsappOutbox.createdAt))
    .limit(limit);

  let processed = 0;
  for (const item of due) {
    const [claimed] = await db
      .update(whatsappOutbox)
      .set({ status: "sending", lockedAt: new Date(), attempts: item.attempts + 1, updatedAt: new Date() })
      .where(and(eq(whatsappOutbox.id, item.id), inArray(whatsappOutbox.status, ["queued", "retrying"])))
      .returning();

    if (!claimed) {
      continue;
    }

    const pairDelay = await shouldDelayForPairRateLimit(claimed);
    const throughputDelay = await shouldDelayForPhoneThroughput(claimed);
    const delayUntil = pairDelay && throughputDelay ? (pairDelay > throughputDelay ? pairDelay : throughputDelay) : pairDelay ?? throughputDelay;
    if (delayUntil) {
      await db
        .update(whatsappOutbox)
        .set({ status: "retrying", nextAttemptAt: delayUntil, lockedAt: null, updatedAt: new Date(), lastError: "rate_limited_locally" })
        .where(eq(whatsappOutbox.id, claimed.id));
      continue;
    }

    try {
      const result = await sendOutboxToMeta(claimed);
      const providerMessageId = result.messages?.[0]?.id ?? crypto.randomUUID();
      const waId = result.contacts?.[0]?.wa_id ?? null;
      const workspace = claimed.workspaceId ? (await db.select().from(whatsappWorkspaces).where(eq(whatsappWorkspaces.id, claimed.workspaceId)).limit(1))[0] ?? null : null;
      await recordWhatsappAcceptedEvent({
        item: claimed,
        providerMessageId,
        phoneNumberId: workspace?.phoneNumberId ?? null,
        waId,
        rawPayload: result as Record<string, unknown>,
      });

      await db
        .update(whatsappOutbox)
        .set({ status: "sent", providerMessageId, sentAt: new Date(), lockedAt: null, lastError: null, updatedAt: new Date() })
        .where(eq(whatsappOutbox.id, claimed.id));

      if (claimed.socialMessageId) {
        await db
          .update(socialMessages)
          .set({ deliveryStatus: "sent", providerMessageId, metadata: { provider: "meta_whatsapp", providerMessageId, outboxId: claimed.id } })
          .where(eq(socialMessages.id, claimed.socialMessageId));
      }
      await db
        .update(whatsappMessageCosts)
        .set({ providerMessageId, updatedAt: new Date() })
        .where(and(eq(whatsappMessageCosts.companyId, claimed.companyId), eq(whatsappMessageCosts.outboxId, claimed.id)));

      if (claimed.conversationId) {
        await db
          .update(socialConversations)
          .set({
            messageStatusSummary: { lastProviderMessageId: providerMessageId, status: "sent", outboxId: claimed.id },
            lastOutboundAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(socialConversations.id, claimed.conversationId));
      }

      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = claimed.attempts;
      const retryable = attempts < env.WHATSAPP_OUTBOX_MAX_ATTEMPTS;
      await db
        .update(whatsappOutbox)
        .set({
          status: retryable ? "retrying" : "failed",
          nextAttemptAt: retryable ? new Date(Date.now() + retryDelayMs(attempts, message)) : new Date(),
          failedAt: retryable ? null : new Date(),
          lockedAt: null,
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(whatsappOutbox.id, claimed.id));

      if (!retryable && claimed.socialMessageId) {
        await db.update(socialMessages).set({ deliveryStatus: "failed", metadata: { provider: "meta_whatsapp", outboxId: claimed.id, error: message } }).where(eq(socialMessages.id, claimed.socialMessageId));
      }
    }
  }

  return processed;
}

function providerTimestampToDate(timestampValue?: string | number | null) {
  if (!timestampValue) {
    return new Date();
  }
  const seconds = typeof timestampValue === "string" ? Number(timestampValue) : timestampValue;
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
}

async function ingestWhatsappInboundMessage(input: {
  workspace: typeof whatsappWorkspaces.$inferSelect;
  phoneNumberId: string;
  message: {
    id?: string;
    from?: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
    interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
    image?: { id?: string; caption?: string };
    document?: { id?: string; caption?: string; filename?: string };
    audio?: { id?: string };
    video?: { id?: string; caption?: string };
  };
  contactName?: string | null;
}) {
  if (!input.message.from) {
    return null;
  }

  const body = extractWhatsappMessageBody(input.message);
  if (!body) {
    return null;
  }

  if (input.message.id) {
    const [existing] = await db
      .select()
      .from(socialMessages)
      .where(and(eq(socialMessages.companyId, input.workspace.companyId), eq(socialMessages.providerMessageId, input.message.id)))
      .limit(1);
    if (existing) {
      return null;
    }
  }

  const account = (await findWhatsappAccountByPhoneNumberId(input.phoneNumberId)) ?? (await getWhatsappAccount(input.workspace.companyId));
  if (!account) {
    return null;
  }

  const phoneE164 = normalizePhoneToE164(input.message.from);
  const received = await ingestWhatsappReply({
    companyId: input.workspace.companyId,
    accountId: account.id,
    contactHandle: phoneE164,
    contactName: input.contactName,
    body,
    messageType: input.message.type ?? "text",
    providerMessageId: input.message.id ?? null,
    createdBy: account.createdBy,
  });

  const providerTimestamp = providerTimestampToDate(input.message.timestamp);
  await upsertWhatsappSession({
    companyId: input.workspace.companyId,
    workspaceId: input.workspace.id,
    conversationId: received.conversation.id,
    phoneE164,
    lastInboundAt: providerTimestamp,
    metadata: {
      lastInboundProviderMessageId: input.message.id ?? null,
      phoneNumberId: input.phoneNumberId,
    },
  });

  if (input.message.id) {
    await db
      .insert(whatsappMessageLinks)
      .values({
        companyId: input.workspace.companyId,
        workspaceId: input.workspace.id,
        socialMessageId: received.message.id,
        conversationId: received.conversation.id,
        providerMessageId: input.message.id,
        phoneNumberId: input.phoneNumberId,
        direction: "inbound",
      })
      .onConflictDoNothing({
        target: whatsappMessageLinks.providerMessageId,
      });
  }

  return {
    companyId: input.workspace.companyId,
    conversationId: received.conversation.id,
    messageId: received.message.id,
    leadId: received.conversation.leadId ?? null,
    body,
  } satisfies WhatsappIngestedItem;
}

function mapWhatsappStatus(status: string): "sent" | "delivered" | "read" | "failed" {
  if (status === "read") return "read";
  if (status === "delivered") return "delivered";
  if (status === "failed") return "failed";
  return "sent";
}

async function recomputeMessageDeliveryStatus(companyId: string, socialMessageId: string) {
  const events = await db
    .select({ eventType: whatsappMessageEvents.eventType })
    .from(whatsappMessageEvents)
    .where(and(eq(whatsappMessageEvents.companyId, companyId), eq(whatsappMessageEvents.socialMessageId, socialMessageId)));

  if (events.length === 0) {
    return;
  }

  const best = events.reduce((current, event) => {
    const currentRank = STATUS_PRECEDENCE[current] ?? 0;
    const eventRank = STATUS_PRECEDENCE[event.eventType] ?? 0;
    return eventRank > currentRank ? event.eventType : current;
  }, events[0]!.eventType);

  await db.update(socialMessages).set({ deliveryStatus: best }).where(eq(socialMessages.id, socialMessageId));
}

async function ingestWhatsappStatus(input: {
  workspace: typeof whatsappWorkspaces.$inferSelect;
  phoneNumberId: string;
  status: {
    id?: string;
    status?: string;
    timestamp?: string;
    recipient_id?: string;
    conversation?: Record<string, unknown>;
    pricing?: Record<string, unknown>;
    errors?: Array<{ code?: number | string; title?: string; message?: string; error_data?: { details?: string } }>;
  };
}) {
  const providerMessageId = input.status.id;
  if (!providerMessageId || !input.status.status) {
    return;
  }

  const eventType = mapWhatsappStatus(input.status.status);
  const providerTimestamp = providerTimestampToDate(input.status.timestamp);
  const eventKey = `status:${providerMessageId}:${eventType}:${input.status.timestamp ?? providerTimestamp.getTime()}`;

  const [link] = await db.select().from(whatsappMessageLinks).where(eq(whatsappMessageLinks.providerMessageId, providerMessageId)).limit(1);
  const [event] = await db
    .insert(whatsappMessageEvents)
    .values({
      companyId: input.workspace.companyId,
      workspaceId: input.workspace.id,
      outboxId: link?.outboxId ?? null,
      socialMessageId: link?.socialMessageId ?? null,
      providerMessageId,
      eventType,
      eventKey,
      providerTimestamp,
      errorCode: input.status.errors?.[0]?.code ? String(input.status.errors[0].code) : null,
      errorMessage: input.status.errors?.[0]?.message ?? input.status.errors?.[0]?.title ?? input.status.errors?.[0]?.error_data?.details ?? null,
      pricing: input.status.pricing ?? {},
      conversation: input.status.conversation ?? {},
      rawPayload: input.status as Record<string, unknown>,
    })
    .onConflictDoNothing({
      target: [whatsappMessageEvents.companyId, whatsappMessageEvents.eventKey],
    })
    .returning();

  if (!event) {
    return;
  }

  if (link?.socialMessageId) {
    await recomputeMessageDeliveryStatus(input.workspace.companyId, link.socialMessageId);
  }
  if (link && (eventType === "delivered" || eventType === "read" || eventType === "failed")) {
    await finalizeWhatsappMessageCost({
      companyId: input.workspace.companyId,
      outboxId: link.outboxId,
      socialMessageId: link.socialMessageId,
      providerMessageId,
      sourceEventId: event.id,
      providerPricing: input.status.pricing ?? null,
      delivered: eventType === "delivered" || eventType === "read",
    });
  }
  if (link?.outboxId && eventType === "failed") {
    await db
      .update(whatsappOutbox)
      .set({ status: "failed", failedAt: new Date(), lastError: event.errorMessage ?? "Provider reported failure", updatedAt: new Date() })
      .where(eq(whatsappOutbox.id, link.outboxId));
  }
  if (link?.conversationId) {
    await db
      .update(socialConversations)
      .set({
        messageStatusSummary: {
          lastProviderMessageId: providerMessageId,
          status: eventType,
          error: event.errorMessage ?? null,
        },
        updatedAt: new Date(),
      })
      .where(eq(socialConversations.id, link.conversationId));
  }
}

async function processStoredWhatsappWebhookEvent(event: typeof whatsappWebhookEvents.$inferSelect) {
  const payload = (event.rawBody ? JSON.parse(event.rawBody) : event.payload) as {
    entry?: Array<{
      changes?: Array<{
        field?: string;
        value?: {
          metadata?: { phone_number_id?: string };
          contacts?: Array<{ profile?: { name?: string } }>;
          messages?: Array<Record<string, unknown>>;
          statuses?: Array<Record<string, unknown>>;
        };
      }>;
    }>;
  };
  const ingested: WhatsappIngestedItem[] = [];
  let handled = 0;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) {
        continue;
      }
      const workspace = event.workspaceId
        ? (await db.select().from(whatsappWorkspaces).where(eq(whatsappWorkspaces.id, event.workspaceId)).limit(1))[0] ?? null
        : await getWhatsappWorkspaceByPhoneNumberId(phoneNumberId);
      if (!workspace) {
        continue;
      }

      const contactName = value?.contacts?.[0]?.profile?.name ?? null;
      for (const message of value?.messages ?? []) {
        const item = await ingestWhatsappInboundMessage({
          workspace,
          phoneNumberId,
          message: message as Parameters<typeof ingestWhatsappInboundMessage>[0]["message"],
          contactName,
        });
        if (item) {
          ingested.push(item);
          handled += 1;
        }
      }

      for (const status of value?.statuses ?? []) {
        await ingestWhatsappStatus({
          workspace,
          phoneNumberId,
          status: status as Parameters<typeof ingestWhatsappStatus>[0]["status"],
        });
        handled += 1;
      }
    }
  }

  return { ingested, handled };
}

export async function processQueuedWhatsappWebhookEvents(limit = 20, onIngested?: WhatsappWebhookIngestCallback) {
  const due = await db
    .select()
    .from(whatsappWebhookEvents)
    .where(inArray(whatsappWebhookEvents.status, ["queued", "failed"]))
    .orderBy(asc(whatsappWebhookEvents.receivedAt))
    .limit(limit);

  let processed = 0;
  for (const event of due) {
    const [claimed] = await db
      .update(whatsappWebhookEvents)
      .set({ status: "processing", lockedAt: new Date(), attempts: event.attempts + 1 })
      .where(and(eq(whatsappWebhookEvents.id, event.id), inArray(whatsappWebhookEvents.status, ["queued", "failed"])))
      .returning();
    if (!claimed) {
      continue;
    }

    try {
      const result = await processStoredWhatsappWebhookEvent(claimed);
      if (result.ingested.length > 0 && onIngested) {
        await onIngested(result.ingested);
      }
      await db
        .update(whatsappWebhookEvents)
        .set({
          status: result.handled > 0 ? "processed" : "ignored",
          eventType: result.ingested.length > 0 ? "message.received" : result.handled > 0 ? "message.status" : "unknown",
          processedAt: new Date(),
          lockedAt: null,
          lastError: null,
        })
        .where(eq(whatsappWebhookEvents.id, claimed.id));
      processed += 1;
    } catch (error) {
      await db
        .update(whatsappWebhookEvents)
        .set({
          status: "failed",
          lockedAt: null,
          lastError: error instanceof Error ? error.message : String(error),
        })
        .where(eq(whatsappWebhookEvents.id, claimed.id));
    }
  }

  return processed;
}

export async function getWhatsappMessageState(companyId: string, messageId: string) {
  const [outbox] = await db.select().from(whatsappOutbox).where(and(eq(whatsappOutbox.companyId, companyId), eq(whatsappOutbox.id, messageId))).limit(1);
  if (!outbox) {
    throw AppError.notFound("WhatsApp message not found");
  }

  const events = outbox.providerMessageId
    ? await db
        .select()
        .from(whatsappMessageEvents)
        .where(and(eq(whatsappMessageEvents.companyId, companyId), eq(whatsappMessageEvents.providerMessageId, outbox.providerMessageId)))
        .orderBy(asc(whatsappMessageEvents.createdAt))
    : [];

  const socialMessage = outbox.socialMessageId ? (await db.select().from(socialMessages).where(eq(socialMessages.id, outbox.socialMessageId)).limit(1))[0] ?? null : null;
  const costs = await db
    .select()
    .from(whatsappMessageCosts)
    .where(and(eq(whatsappMessageCosts.companyId, companyId), eq(whatsappMessageCosts.outboxId, outbox.id)));

  return {
    outbox,
    socialMessage,
    events,
    costs,
  };
}

function fallbackMimeType(mediaType: "image" | "document" | "video" | "audio") {
  if (mediaType === "image") return "image/jpeg";
  if (mediaType === "video") return "video/mp4";
  if (mediaType === "audio") return "audio/mpeg";
  return "application/octet-stream";
}

// Meta WhatsApp Cloud API caps a single media upload at 100 MB; we stay below that.
const WHATSAPP_MEDIA_MAX_BYTES = 95 * 1024 * 1024;
const WHATSAPP_MEDIA_FETCH_TIMEOUT_MS = 30_000;

async function uploadWhatsappMediaFromUrl(input: {
  workspaceId?: string | null;
  sourceUrl?: string | null;
  mediaType: "image" | "document" | "video" | "audio";
}) {
  if (!input.workspaceId || !input.sourceUrl) {
    return null;
  }

  const [workspace] = await db.select().from(whatsappWorkspaces).where(eq(whatsappWorkspaces.id, input.workspaceId)).limit(1);
  const accessToken = workspace?.accessToken ? decryptIntegrationSecret(workspace.accessToken) : env.WHATSAPP_ACCESS_TOKEN || null;
  if (!workspace?.phoneNumberId || !accessToken) {
    return null;
  }

  // SSRF guard: sourceUrl is tenant-controlled. safeExternalFetch enforces
  // https-only, blocks loopback / RFC1918 / link-local / cloud-metadata
  // ranges, follows redirects manually with re-validation, and caps the
  // response body so a hostile origin cannot exhaust memory.
  const mediaResponse = await safeExternalFetch(input.sourceUrl, {}, {
    maxBytes: WHATSAPP_MEDIA_MAX_BYTES,
    timeoutMs: WHATSAPP_MEDIA_FETCH_TIMEOUT_MS,
  });
  if (!mediaResponse.ok) {
    throw AppError.conflict(`Unable to fetch media source: ${mediaResponse.status}`);
  }

  const contentType = mediaResponse.headers.get("content-type") ?? fallbackMimeType(input.mediaType);
  // Copy into a fresh ArrayBuffer so Blob's type contract is satisfied across the
  // Bun / Node typings boundary (Buffer's underlying buffer can be SharedArrayBuffer-typed).
  const bodyCopy = new ArrayBuffer(mediaResponse.body.byteLength);
  new Uint8Array(bodyCopy).set(mediaResponse.body);
  const blob = new Blob([bodyCopy], { type: contentType });
  const filename = new URL(mediaResponse.finalUrl).pathname.split("/").filter(Boolean).pop() ?? `whatsapp-media-${Date.now()}`;
  const form = new FormData();
  form.set("messaging_product", "whatsapp");
  form.set("file", blob, filename);

  const uploadResponse = await fetch(`${getWhatsappApiBaseUrl()}/${workspace.phoneNumberId}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!uploadResponse.ok) {
    const details = await uploadResponse.text();
    throw AppError.conflict(`Meta WhatsApp media upload failed: ${uploadResponse.status}`, details);
  }

  const payload = (await uploadResponse.json()) as { id?: string };
  if (!payload.id) {
    throw AppError.internal("Meta WhatsApp media upload response did not include media id");
  }

  return payload.id;
}

export async function createWhatsappMediaAsset(input: {
  companyId: string;
  workspaceId?: string | null;
  mediaType: "image" | "document" | "video" | "audio";
  sourceUrl?: string | null;
  providerMediaId?: string | null;
  caption?: string | null;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
}) {
  const checksum = input.sourceUrl || input.providerMediaId ? hashWhatsappSecret(`${input.mediaType}:${input.sourceUrl ?? ""}:${input.providerMediaId ?? ""}`) : null;
  if (checksum) {
    const workspaceCondition = input.workspaceId ? eq(whatsappMediaAssets.workspaceId, input.workspaceId) : isNull(whatsappMediaAssets.workspaceId);
    const [existing] = await db
      .select()
      .from(whatsappMediaAssets)
      .where(and(eq(whatsappMediaAssets.companyId, input.companyId), workspaceCondition, eq(whatsappMediaAssets.checksum, checksum)))
      .limit(1);
    if (existing) {
      return existing;
    }
  }

  const providerMediaId =
    input.providerMediaId ??
    (await uploadWhatsappMediaFromUrl({
      workspaceId: input.workspaceId,
      sourceUrl: input.sourceUrl,
      mediaType: input.mediaType,
    }));

  const [asset] = await db
    .insert(whatsappMediaAssets)
    .values({
      companyId: input.companyId,
      workspaceId: input.workspaceId ?? null,
      mediaType: input.mediaType,
      sourceUrl: input.sourceUrl ?? null,
      providerMediaId: providerMediaId ?? null,
      checksum,
      caption: input.caption ?? null,
      metadata: input.metadata ?? {},
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return asset;
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
