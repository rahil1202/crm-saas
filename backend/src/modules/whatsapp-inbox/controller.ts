import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import {
  messageAttachments,
  whatsappContactProfiles,
  conversationTags,
} from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import {
  createConversationNote,
  deleteConversationNote,
  deleteTag,
  getConversationOrThrow,
  listContacts,
  listConversationMessages,
  listConversationNotes,
  listInboxConversations,
  listTags,
  markConversationRead,
  patchConversation,
  setContactTags,
  upsertContactProfile,
  upsertTag,
} from "@/lib/whatsapp-inbox";
import {
  inferMediaTypeFromMime,
  persistWhatsappMedia,
  readWhatsappMedia,
} from "@/lib/whatsapp-media";
import { publishWhatsappEvent, whatsappRealtimeStream } from "@/lib/whatsapp-realtime";
import { queueWhatsappMessage } from "@/lib/whatsapp-runtime";
import {
  attachmentParamSchema,
  bulkImportContactsSchema,
  contactParamSchema,
  conversationParamSchema,
  createNoteSchema,
  listContactsSchema,
  listInboxSchema,
  listMessagesSchema,
  markReadSchema,
  mediaUploadFieldsSchema,
  noteParamSchema,
  patchConversationSchema,
  sendInteractiveMessageSchema,
  sendMediaMessageSchema,
  sendTemplateMessageSchema,
  sendTextMessageSchema,
  setContactTagsSchema,
  tagParamSchema,
  tagSchema,
  typingIndicatorSchema,
  upsertContactSchema,
} from "@/modules/whatsapp-inbox/schema";
import type {
  BulkImportContactsInput,
  CreateNoteInput,
  ListContactsQuery,
  ListInboxQuery,
  ListMessagesQuery,
  PatchConversationInput,
  SetContactTagsInput,
  TagInput,
  UpsertContactInput,
} from "@/modules/whatsapp-inbox/schema";

// -----------------------------------------------------------------
// Inbox
// -----------------------------------------------------------------

export async function getInbox(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const query = c.get("validatedQuery") as ListInboxQuery;

  const payload = await listInboxConversations({
    companyId: tenant.companyId,
    status: query.status,
    assignedToUserId: query.assignedTo === "me" ? user.id : query.assignedTo,
    assignedToMe: query.assignedToMe ? user.id : null,
    unassigned: query.unassigned,
    priority: query.priority,
    tagId: query.tagId,
    pinned: query.pinned,
    archived: query.archived,
    search: query.search,
    cursor: query.cursor,
    limit: query.limit,
  });

  return ok(c, payload);
}

export async function getConversation(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = conversationParamSchema.parse(c.req.param());
  const conversation = await getConversationOrThrow(tenant.companyId, params.conversationId);
  return ok(c, conversation);
}

export async function getMessages(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = conversationParamSchema.parse(c.req.param());
  const query = c.get("validatedQuery") as ListMessagesQuery;

  const payload = await listConversationMessages({
    companyId: tenant.companyId,
    conversationId: params.conversationId,
    before: query.before,
    limit: query.limit,
  });

  return ok(c, payload);
}

export async function patchConversationController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = conversationParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as PatchConversationInput;
  const updated = await patchConversation(tenant.companyId, params.conversationId, body);
  return ok(c, updated);
}

export async function markConversationReadController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = conversationParamSchema.parse(c.req.param());
  markReadSchema.parse(c.get("validatedBody") ?? {});
  const updated = await markConversationRead(tenant.companyId, params.conversationId, user.id);
  return ok(c, updated);
}

export async function publishTypingIndicator(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = conversationParamSchema.parse(c.req.param());
  const body = typingIndicatorSchema.parse(c.get("validatedBody") ?? {});

  // Make sure conversation exists + belongs to tenant
  await getConversationOrThrow(tenant.companyId, params.conversationId);

  publishWhatsappEvent({
    type: "conversation.typing",
    companyId: tenant.companyId,
    conversationId: params.conversationId,
    userId: user.id,
    state: body.state,
  });

  return ok(c, { ok: true });
}

// -----------------------------------------------------------------
// Send messages
// -----------------------------------------------------------------

export async function sendText(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = conversationParamSchema.parse(c.req.param());
  const body = sendTextMessageSchema.parse(c.get("validatedBody") ?? {});

  const conversation = await getConversationOrThrow(tenant.companyId, params.conversationId);
  const queued = await queueWhatsappMessage({
    companyId: tenant.companyId,
    createdBy: user.id,
    to: conversation.contactHandle,
    contactName: conversation.contactName,
    mode: "auto",
    text: body.body,
    contextMessageId: body.contextMessageId,
    crmRef: { conversationId: conversation.id },
  });

  if (queued.message) {
    publishWhatsappEvent({
      type: "message.created",
      companyId: tenant.companyId,
      conversationId: conversation.id,
      messageId: queued.message.id,
      direction: "outbound",
      body: queued.message.body,
      messageType: queued.message.messageType,
      deliveryStatus: queued.message.deliveryStatus,
      contactHandle: conversation.contactHandle,
      contactName: conversation.contactName,
      sentAt: (queued.message.sentAt as Date).toISOString(),
    });
  }

  return ok(c, queued, 202);
}

export async function sendTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = conversationParamSchema.parse(c.req.param());
  const body = sendTemplateMessageSchema.parse(c.get("validatedBody") ?? {});

  const conversation = await getConversationOrThrow(tenant.companyId, params.conversationId);
  const queued = await queueWhatsappMessage({
    companyId: tenant.companyId,
    createdBy: user.id,
    to: conversation.contactHandle,
    contactName: conversation.contactName,
    mode: "template",
    template: {
      name: body.templateName,
      language: body.language,
      components: body.components,
    },
    variables: body.variables,
    crmRef: { conversationId: conversation.id },
  });

  if (queued.message) {
    publishWhatsappEvent({
      type: "message.created",
      companyId: tenant.companyId,
      conversationId: conversation.id,
      messageId: queued.message.id,
      direction: "outbound",
      body: queued.message.body,
      messageType: queued.message.messageType,
      deliveryStatus: queued.message.deliveryStatus,
      contactHandle: conversation.contactHandle,
      contactName: conversation.contactName,
      sentAt: (queued.message.sentAt as Date).toISOString(),
    });
  }
  return ok(c, queued, 202);
}

export async function sendMedia(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = conversationParamSchema.parse(c.req.param());
  const body = sendMediaMessageSchema.parse(c.get("validatedBody") ?? {});

  const conversation = await getConversationOrThrow(tenant.companyId, params.conversationId);
  const [attachment] = await db
    .select()
    .from(messageAttachments)
    .where(
      and(
        eq(messageAttachments.id, body.attachmentId),
        eq(messageAttachments.companyId, tenant.companyId),
        isNull(messageAttachments.deletedAt),
      ),
    )
    .limit(1);

  if (!attachment) {
    throw AppError.notFound("Media attachment not found");
  }

  const mediaLink = `${process.env.BACKEND_URL ?? ""}/api/v1/whatsapp/attachments/${attachment.id}/content`;
  const queued = await queueWhatsappMessage({
    companyId: tenant.companyId,
    createdBy: user.id,
    to: conversation.contactHandle,
    contactName: conversation.contactName,
    mode: "auto",
    text: body.caption ?? attachment.caption ?? "",
    media: {
      mediaAssetId: attachment.id,
      mediaType: attachment.mediaType as "image" | "document" | "video" | "audio",
      link: mediaLink,
      caption: body.caption ?? attachment.caption ?? undefined,
    },
    crmRef: { conversationId: conversation.id },
  });

  // Tie the attachment to the freshly-created outbound message if available.
  if (queued.message) {
    await db
      .update(messageAttachments)
      .set({
        messageId: queued.message.id,
        conversationId: conversation.id,
      })
      .where(and(eq(messageAttachments.id, attachment.id), eq(messageAttachments.companyId, tenant.companyId)));

    publishWhatsappEvent({
      type: "message.created",
      companyId: tenant.companyId,
      conversationId: conversation.id,
      messageId: queued.message.id,
      direction: "outbound",
      body: queued.message.body,
      messageType: queued.message.messageType,
      deliveryStatus: queued.message.deliveryStatus,
      contactHandle: conversation.contactHandle,
      contactName: conversation.contactName,
      sentAt: (queued.message.sentAt as Date).toISOString(),
    });
  }

  return ok(c, queued, 202);
}

export async function sendInteractive(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = conversationParamSchema.parse(c.req.param());
  const body = sendInteractiveMessageSchema.parse(c.get("validatedBody") ?? {});

  const conversation = await getConversationOrThrow(tenant.companyId, params.conversationId);
  const queued = await queueWhatsappMessage({
    companyId: tenant.companyId,
    createdBy: user.id,
    to: conversation.contactHandle,
    contactName: conversation.contactName,
    mode: "auto",
    interactive: body.interactive,
    crmRef: { conversationId: conversation.id },
  });
  return ok(c, queued, 202);
}

// -----------------------------------------------------------------
// Notes
// -----------------------------------------------------------------

export async function getNotes(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = conversationParamSchema.parse(c.req.param());
  const items = await listConversationNotes(tenant.companyId, params.conversationId);
  return ok(c, { items });
}

export async function postNote(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = conversationParamSchema.parse(c.req.param());
  const body = createNoteSchema.parse(c.get("validatedBody") ?? {}) as CreateNoteInput;
  const note = await createConversationNote({
    companyId: tenant.companyId,
    conversationId: params.conversationId,
    authorId: user.id,
    body: body.body,
    mentions: body.mentions,
  });
  return ok(c, note, 201);
}

export async function removeNote(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = noteParamSchema.parse(c.req.param());
  const deleted = await deleteConversationNote(tenant.companyId, params.noteId);
  return ok(c, { deleted: true, ...deleted });
}

// -----------------------------------------------------------------
// Tags
// -----------------------------------------------------------------

export async function getTags(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const items = await listTags(tenant.companyId);
  return ok(c, { items });
}

export async function createTag(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = tagSchema.parse(c.get("validatedBody") ?? {}) as TagInput;
  const row = await upsertTag({ companyId: tenant.companyId, ...body, createdBy: user.id });
  return ok(c, row, 201);
}

export async function updateTag(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = tagParamSchema.parse(c.req.param());
  const body = tagSchema.parse(c.get("validatedBody") ?? {}) as TagInput;
  const row = await upsertTag({ companyId: tenant.companyId, id: params.tagId, ...body });
  return ok(c, row);
}

export async function removeTag(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = tagParamSchema.parse(c.req.param());
  const result = await deleteTag(tenant.companyId, params.tagId);
  return ok(c, { deleted: true, ...result });
}

// -----------------------------------------------------------------
// Contacts
// -----------------------------------------------------------------

export async function getContacts(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListContactsQuery;
  const payload = await listContacts({ companyId: tenant.companyId, ...query });
  return ok(c, payload);
}

export async function upsertContact(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = upsertContactSchema.parse(c.get("validatedBody") ?? {}) as UpsertContactInput;
  const phoneE164 = body.phoneE164.startsWith("+") ? body.phoneE164 : `+${body.phoneE164}`;

  const row = await upsertContactProfile({
    companyId: tenant.companyId,
    phoneE164,
    patch: {
      displayName: body.displayName ?? null,
      optInStatus: body.optInStatus,
      optInSource: body.optInSource ?? null,
      engagementStatus: body.engagementStatus,
      customFields: body.customFields,
      avatarUrl: body.avatarUrl ?? null,
      locale: body.locale ?? null,
    },
  });
  return ok(c, row);
}

export async function setContactTagsController(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = contactParamSchema.parse(c.req.param());
  const body = setContactTagsSchema.parse(c.get("validatedBody") ?? {}) as SetContactTagsInput;
  const tagIds = await setContactTags({
    companyId: tenant.companyId,
    contactHandle: params.contactHandle,
    tagIds: body.tagIds,
  });
  return ok(c, { tagIds });
}

export async function bulkImportContacts(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = bulkImportContactsSchema.parse(c.get("validatedBody") ?? {}) as BulkImportContactsInput;

  // Ensure tag names exist
  const tagNames = Array.from(new Set(body.contacts.flatMap((contact) => contact.tags ?? []).map((tag) => tag.trim()).filter(Boolean)));
  const existingTags = tagNames.length
    ? await db
        .select({ id: conversationTags.id, name: conversationTags.name })
        .from(conversationTags)
        .where(and(eq(conversationTags.companyId, tenant.companyId), isNull(conversationTags.deletedAt)))
    : [];
  const existingMap = new Map(existingTags.map((tag) => [tag.name.toLowerCase(), tag.id]));
  const missing = tagNames.filter((name) => !existingMap.has(name.toLowerCase()));
  for (const name of missing) {
    const [created] = await db
      .insert(conversationTags)
      .values({ companyId: tenant.companyId, name })
      .returning();
    if (created) {
      existingMap.set(name.toLowerCase(), created.id);
    }
  }

  let imported = 0;
  for (const contact of body.contacts) {
    const phoneE164 = contact.phoneE164.startsWith("+") ? contact.phoneE164 : `+${contact.phoneE164}`;
    await upsertContactProfile({
      companyId: tenant.companyId,
      phoneE164,
      patch: {
        displayName: contact.displayName ?? null,
        optInStatus: contact.optInStatus,
        customFields: contact.customFields,
      },
    });
    const tagIds = (contact.tags ?? []).map((name) => existingMap.get(name.toLowerCase())).filter((id): id is string => Boolean(id));
    if (tagIds.length) {
      await setContactTags({ companyId: tenant.companyId, contactHandle: phoneE164, tagIds });
    }
    imported += 1;
  }
  return ok(c, { imported });
}

export async function exportContacts(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const rows = await db
    .select({
      phoneE164: whatsappContactProfiles.phoneE164,
      displayName: whatsappContactProfiles.displayName,
      optInStatus: whatsappContactProfiles.optInStatus,
      engagementStatus: whatsappContactProfiles.engagementStatus,
      lastInboundAt: whatsappContactProfiles.lastInboundAt,
      lastOutboundAt: whatsappContactProfiles.lastOutboundAt,
    })
    .from(whatsappContactProfiles)
    .where(and(eq(whatsappContactProfiles.companyId, tenant.companyId), isNull(whatsappContactProfiles.deletedAt)));

  const header = "phone_e164,display_name,opt_in_status,engagement_status,last_inbound_at,last_outbound_at\n";
  const body = rows
    .map((row) =>
      [
        row.phoneE164,
        row.displayName ?? "",
        row.optInStatus,
        row.engagementStatus,
        row.lastInboundAt ? (row.lastInboundAt as Date).toISOString() : "",
        row.lastOutboundAt ? (row.lastOutboundAt as Date).toISOString() : "",
      ]
        .map(escapeCsv)
        .join(","),
    )
    .join("\n");

  return c.body(`${header}${body}\n`, 200, {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename="whatsapp-contacts-${tenant.companyId}.csv"`,
  });
}

function escapeCsv(value: string) {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// -----------------------------------------------------------------
// Media uploads / downloads
// -----------------------------------------------------------------

export async function uploadAttachment(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const formData = await c.req.raw.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size <= 0) {
    throw AppError.badRequest("A file is required");
  }
  if (file.size > 95 * 1024 * 1024) {
    throw AppError.badRequest("File exceeds 95MB WhatsApp media limit");
  }

  const fields = mediaUploadFieldsSchema.parse({
    workspaceId: typeof formData.get("workspaceId") === "string" ? formData.get("workspaceId") : undefined,
    conversationId: typeof formData.get("conversationId") === "string" ? formData.get("conversationId") : undefined,
    caption: typeof formData.get("caption") === "string" ? formData.get("caption") : undefined,
  });

  const persisted = await persistWhatsappMedia({ companyId: tenant.companyId, file });
  const mediaType = inferMediaTypeFromMime(file.type || "application/octet-stream");

  const [attachment] = await db
    .insert(messageAttachments)
    .values({
      companyId: tenant.companyId,
      conversationId: fields.conversationId ?? null,
      workspaceId: fields.workspaceId ?? null,
      mediaType,
      mimeType: file.type || null,
      sizeBytes: file.size,
      originalName: file.name,
      storageProvider: persisted.provider,
      storageBucket: persisted.bucket,
      storageObjectPath: persisted.objectPath,
      caption: fields.caption ?? null,
      createdBy: user.id,
    })
    .returning();

  return ok(c, attachment, 201);
}

export async function downloadAttachment(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = attachmentParamSchema.parse(c.req.param());
  const { row, data } = await readWhatsappMedia(params.attachmentId, tenant.companyId);

  return new Response(data, {
    status: 200,
    headers: {
      "Content-Type": row.mimeType ?? "application/octet-stream",
      "Content-Length": String(data.byteLength),
      "Content-Disposition": `inline; filename="${encodeURIComponent(row.originalName ?? "file")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

// -----------------------------------------------------------------
// Realtime SSE
// -----------------------------------------------------------------

export async function realtimeStream(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = whatsappRealtimeStream(tenant.companyId);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
