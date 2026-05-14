import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { requireAnyModuleAccess, requireAuth, requireModuleAccess, requireRole, requireTenant } from "@/middleware/auth";
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
whatsappInboxRoutes.get("/whatsapp/realtime", requireModuleAccess("whatsapp-inbox"), realtimeStream);

// ----------------- inbox + conversations -------------
whatsappInboxRoutes.get("/whatsapp/inbox", requireModuleAccess("whatsapp-inbox"), validateQuery(listInboxSchema), getInbox);
whatsappInboxRoutes.get("/whatsapp/inbox/:conversationId", requireModuleAccess("whatsapp-inbox"), getConversation);
whatsappInboxRoutes.get("/whatsapp/inbox/:conversationId/messages", requireModuleAccess("whatsapp-inbox"), validateQuery(listMessagesSchema), getMessages);
whatsappInboxRoutes.patch(
  "/whatsapp/inbox/:conversationId",
  requireModuleAccess("whatsapp-inbox"),
  requireRole("admin"),
  validateJson(patchConversationSchema),
  patchConversationController,
);
whatsappInboxRoutes.post(
  "/whatsapp/inbox/:conversationId/read",
  requireModuleAccess("whatsapp-inbox"),
  validateJson(markReadSchema),
  markConversationReadController,
);
whatsappInboxRoutes.post(
  "/whatsapp/inbox/:conversationId/typing",
  requireModuleAccess("whatsapp-inbox"),
  validateJson(typingIndicatorSchema),
  publishTypingIndicator,
);

// ----------------- send --------------------------
whatsappInboxRoutes.post(
  "/whatsapp/inbox/:conversationId/messages/text",
  requireModuleAccess("whatsapp-inbox"),
  requireRole("admin"),
  rateLimit(routePolicies.sendMessage),
  enforceBodyLimit(bodyLimits.tenantDefault),
  validateJson(sendTextMessageSchema),
  sendText,
);
whatsappInboxRoutes.post(
  "/whatsapp/inbox/:conversationId/messages/template",
  requireModuleAccess("whatsapp-inbox"),
  requireRole("admin"),
  rateLimit(routePolicies.sendMessage),
  enforceBodyLimit(bodyLimits.tenantDefault),
  validateJson(sendTemplateMessageSchema),
  sendTemplate,
);
whatsappInboxRoutes.post(
  "/whatsapp/inbox/:conversationId/messages/media",
  requireModuleAccess("whatsapp-inbox"),
  requireRole("admin"),
  rateLimit(routePolicies.sendMessage),
  validateJson(sendMediaMessageSchema),
  sendMedia,
);
whatsappInboxRoutes.post(
  "/whatsapp/inbox/:conversationId/messages/interactive",
  requireModuleAccess("whatsapp-inbox"),
  requireRole("admin"),
  rateLimit(routePolicies.sendMessage),
  enforceBodyLimit(bodyLimits.tenantDefault),
  validateJson(sendInteractiveMessageSchema),
  sendInteractive,
);

// ----------------- notes --------------------------
whatsappInboxRoutes.get("/whatsapp/inbox/:conversationId/notes", requireModuleAccess("whatsapp-inbox"), getNotes);
whatsappInboxRoutes.post(
  "/whatsapp/inbox/:conversationId/notes",
  requireModuleAccess("whatsapp-inbox"),
  validateJson(createNoteSchema),
  postNote,
);
whatsappInboxRoutes.delete("/whatsapp/inbox/notes/:noteId", requireModuleAccess("whatsapp-inbox"), removeNote);

// ----------------- tags --------------------------
whatsappInboxRoutes.get("/whatsapp/tags", requireAnyModuleAccess(["whatsapp-inbox", "whatsapp-contacts"]), getTags);
whatsappInboxRoutes.post("/whatsapp/tags", requireAnyModuleAccess(["whatsapp-inbox", "whatsapp-contacts"]), requireRole("admin"), validateJson(tagSchema), createTag);
whatsappInboxRoutes.patch("/whatsapp/tags/:tagId", requireAnyModuleAccess(["whatsapp-inbox", "whatsapp-contacts"]), requireRole("admin"), validateJson(tagSchema), updateTag);
whatsappInboxRoutes.delete("/whatsapp/tags/:tagId", requireAnyModuleAccess(["whatsapp-inbox", "whatsapp-contacts"]), requireRole("admin"), removeTag);

// ----------------- contacts --------------------------
whatsappInboxRoutes.get("/whatsapp/contacts", requireModuleAccess("whatsapp-contacts"), validateQuery(listContactsSchema), getContacts);
whatsappInboxRoutes.post(
  "/whatsapp/contacts",
  requireModuleAccess("whatsapp-contacts"),
  requireRole("admin"),
  validateJson(upsertContactSchema),
  upsertContact,
);
whatsappInboxRoutes.post(
  "/whatsapp/contacts/bulk-import",
  requireModuleAccess("whatsapp-contacts"),
  requireRole("admin"),
  enforceBodyLimit(bodyLimits.tenantDefault),
  validateJson(bulkImportContactsSchema),
  bulkImportContacts,
);
whatsappInboxRoutes.get("/whatsapp/contacts/export", requireModuleAccess("whatsapp-contacts"), exportContacts);
whatsappInboxRoutes.put(
  "/whatsapp/contacts/:contactHandle/tags",
  requireModuleAccess("whatsapp-contacts"),
  requireRole("admin"),
  validateJson(setContactTagsSchema),
  setContactTagsController,
);

// ----------------- attachments --------------------------
whatsappInboxRoutes.post("/whatsapp/attachments", requireModuleAccess("whatsapp-inbox"), requireRole("admin"), uploadAttachment);
whatsappInboxRoutes.get("/whatsapp/attachments/:attachmentId/content", requireModuleAccess("whatsapp-inbox"), downloadAttachment);
