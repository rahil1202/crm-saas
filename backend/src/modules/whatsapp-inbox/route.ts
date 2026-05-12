import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";
import { bodyLimits, routePolicies } from "@/lib/security";
import { enforceBodyLimit, rateLimit } from "@/middleware/security";
import {
  bulkImportContacts,
  createTag,
  downloadAttachment,
  exportContacts,
  getContacts,
  getConversation,
  getInbox,
  getMessages,
  getNotes,
  getTags,
  markConversationReadController,
  patchConversationController,
  postNote,
  publishTypingIndicator,
  realtimeStream,
  removeNote,
  removeTag,
  sendInteractive,
  sendMedia,
  sendTemplate,
  sendText,
  setContactTagsController,
  updateTag,
  uploadAttachment,
  upsertContact,
} from "@/modules/whatsapp-inbox/controller";
import {
  bulkImportContactsSchema,
  createNoteSchema,
  listContactsSchema,
  listInboxSchema,
  listMessagesSchema,
  markReadSchema,
  patchConversationSchema,
  sendInteractiveMessageSchema,
  sendMediaMessageSchema,
  sendTemplateMessageSchema,
  sendTextMessageSchema,
  setContactTagsSchema,
  tagSchema,
  typingIndicatorSchema,
  upsertContactSchema,
} from "@/modules/whatsapp-inbox/schema";

export const whatsappInboxRoutes = new Hono<AppEnv>();
whatsappInboxRoutes.use("*", requireAuth, requireTenant);

// ----------------- realtime --------------------------
whatsappInboxRoutes.get("/whatsapp/realtime", realtimeStream);

// ----------------- inbox + conversations -------------
whatsappInboxRoutes.get("/whatsapp/inbox", validateQuery(listInboxSchema), getInbox);
whatsappInboxRoutes.get("/whatsapp/inbox/:conversationId", getConversation);
whatsappInboxRoutes.get("/whatsapp/inbox/:conversationId/messages", validateQuery(listMessagesSchema), getMessages);
whatsappInboxRoutes.patch(
  "/whatsapp/inbox/:conversationId",
  requireRole("admin"),
  validateJson(patchConversationSchema),
  patchConversationController,
);
whatsappInboxRoutes.post(
  "/whatsapp/inbox/:conversationId/read",
  validateJson(markReadSchema),
  markConversationReadController,
);
whatsappInboxRoutes.post(
  "/whatsapp/inbox/:conversationId/typing",
  validateJson(typingIndicatorSchema),
  publishTypingIndicator,
);

// ----------------- send --------------------------
whatsappInboxRoutes.post(
  "/whatsapp/inbox/:conversationId/messages/text",
  requireRole("admin"),
  rateLimit(routePolicies.sendMessage),
  enforceBodyLimit(bodyLimits.tenantDefault),
  validateJson(sendTextMessageSchema),
  sendText,
);
whatsappInboxRoutes.post(
  "/whatsapp/inbox/:conversationId/messages/template",
  requireRole("admin"),
  rateLimit(routePolicies.sendMessage),
  enforceBodyLimit(bodyLimits.tenantDefault),
  validateJson(sendTemplateMessageSchema),
  sendTemplate,
);
whatsappInboxRoutes.post(
  "/whatsapp/inbox/:conversationId/messages/media",
  requireRole("admin"),
  rateLimit(routePolicies.sendMessage),
  validateJson(sendMediaMessageSchema),
  sendMedia,
);
whatsappInboxRoutes.post(
  "/whatsapp/inbox/:conversationId/messages/interactive",
  requireRole("admin"),
  rateLimit(routePolicies.sendMessage),
  enforceBodyLimit(bodyLimits.tenantDefault),
  validateJson(sendInteractiveMessageSchema),
  sendInteractive,
);

// ----------------- notes --------------------------
whatsappInboxRoutes.get("/whatsapp/inbox/:conversationId/notes", getNotes);
whatsappInboxRoutes.post(
  "/whatsapp/inbox/:conversationId/notes",
  validateJson(createNoteSchema),
  postNote,
);
whatsappInboxRoutes.delete("/whatsapp/inbox/notes/:noteId", removeNote);

// ----------------- tags --------------------------
whatsappInboxRoutes.get("/whatsapp/tags", getTags);
whatsappInboxRoutes.post("/whatsapp/tags", requireRole("admin"), validateJson(tagSchema), createTag);
whatsappInboxRoutes.patch("/whatsapp/tags/:tagId", requireRole("admin"), validateJson(tagSchema), updateTag);
whatsappInboxRoutes.delete("/whatsapp/tags/:tagId", requireRole("admin"), removeTag);

// ----------------- contacts --------------------------
whatsappInboxRoutes.get("/whatsapp/contacts", validateQuery(listContactsSchema), getContacts);
whatsappInboxRoutes.post(
  "/whatsapp/contacts",
  requireRole("admin"),
  validateJson(upsertContactSchema),
  upsertContact,
);
whatsappInboxRoutes.post(
  "/whatsapp/contacts/bulk-import",
  requireRole("admin"),
  enforceBodyLimit(bodyLimits.tenantDefault),
  validateJson(bulkImportContactsSchema),
  bulkImportContacts,
);
whatsappInboxRoutes.get("/whatsapp/contacts/export", exportContacts);
whatsappInboxRoutes.put(
  "/whatsapp/contacts/:contactHandle/tags",
  requireRole("admin"),
  validateJson(setContactTagsSchema),
  setContactTagsController,
);

// ----------------- attachments --------------------------
whatsappInboxRoutes.post("/whatsapp/attachments", requireRole("admin"), uploadAttachment);
whatsappInboxRoutes.get("/whatsapp/attachments/:attachmentId/content", downloadAttachment);
