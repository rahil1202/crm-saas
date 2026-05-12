import { z } from "zod";

// ----------- conversation params ---------------------------------

export const conversationParamSchema = z.object({ conversationId: z.string().uuid() });
export const noteParamSchema = z.object({ noteId: z.string().uuid() });
export const tagParamSchema = z.object({ tagId: z.string().uuid() });
export const attachmentParamSchema = z.object({ attachmentId: z.string().uuid() });
export const contactParamSchema = z.object({ contactHandle: z.string().min(1).max(180) });

// ----------- list inbox ------------------------------------------

export const listInboxSchema = z.object({
  status: z.enum(["open", "assigned", "closed"]).optional(),
  assignedTo: z.string().optional(),
  unassigned: z.coerce.boolean().optional(),
  assignedToMe: z.coerce.boolean().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  tagId: z.string().uuid().optional(),
  pinned: z.coerce.boolean().optional(),
  archived: z.coerce.boolean().optional(),
  search: z.string().trim().max(180).optional(),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type ListInboxQuery = z.infer<typeof listInboxSchema>;

// ----------- list messages ---------------------------------------

export const listMessagesSchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(40),
});
export type ListMessagesQuery = z.infer<typeof listMessagesSchema>;

// ----------- send message (text / interactive / template / media) --

export const sendTextMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  contextMessageId: z.string().trim().max(180).optional(),
});

export const sendTemplateMessageSchema = z.object({
  templateName: z.string().trim().min(1).max(180),
  language: z.string().trim().min(1).max(16).default("en"),
  components: z.array(z.record(z.string(), z.unknown())).default([]),
  variables: z.record(z.string(), z.unknown()).default({}),
});

export const sendMediaMessageSchema = z.object({
  attachmentId: z.string().uuid(),
  caption: z.string().trim().max(500).optional(),
});

export const sendInteractiveMessageSchema = z.object({
  interactive: z.record(z.string(), z.unknown()),
});

// ----------- conversation patches --------------------------------

export const patchConversationSchema = z
  .object({
    status: z.enum(["open", "assigned", "closed"]).optional(),
    assignedToUserId: z.string().uuid().nullable().optional(),
    humanTakeoverEnabled: z.boolean().optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    tagIds: z.array(z.string().uuid()).max(50).optional(),
    subject: z.string().trim().max(240).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one patch field is required");
export type PatchConversationInput = z.infer<typeof patchConversationSchema>;

export const markReadSchema = z.object({
  readAt: z.string().datetime().optional(),
});

export const typingIndicatorSchema = z.object({
  state: z.enum(["start", "stop"]),
});

// ----------- notes -----------------------------------------------

export const createNoteSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  mentions: z.array(z.string().uuid()).max(30).default([]),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

// ----------- tags ------------------------------------------------

export const tagSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z
    .string()
    .trim()
    .regex(/^[a-z]+$/)
    .max(32)
    .default("emerald"),
  description: z.string().trim().max(240).nullable().optional(),
});
export type TagInput = z.infer<typeof tagSchema>;

// ----------- contacts --------------------------------------------

export const listContactsSchema = z.object({
  search: z.string().trim().max(180).optional(),
  tagId: z.string().uuid().optional(),
  engagementStatus: z.enum(["hot", "warm", "cold", "dormant"]).optional(),
  optInStatus: z.enum(["opted_in", "opted_out", "unknown"]).optional(),
  cursor: z.string().trim().max(180).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListContactsQuery = z.infer<typeof listContactsSchema>;

export const upsertContactSchema = z.object({
  phoneE164: z
    .string()
    .trim()
    .min(5)
    .max(32)
    .regex(/^\+?[0-9]+$/, "Phone must be E.164 digits"),
  displayName: z.string().trim().max(180).nullable().optional(),
  optInStatus: z.enum(["opted_in", "opted_out", "unknown"]).optional(),
  optInSource: z.string().trim().max(80).nullable().optional(),
  engagementStatus: z.enum(["hot", "warm", "cold", "dormant"]).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  locale: z.string().trim().max(16).nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});
export type UpsertContactInput = z.infer<typeof upsertContactSchema>;

export const setContactTagsSchema = z.object({
  tagIds: z.array(z.string().uuid()).max(50),
});
export type SetContactTagsInput = z.infer<typeof setContactTagsSchema>;

export const bulkImportContactsSchema = z.object({
  contacts: z
    .array(
      z.object({
        phoneE164: z
          .string()
          .trim()
          .min(5)
          .max(32)
          .regex(/^\+?[0-9]+$/, "Phone must be E.164 digits"),
        displayName: z.string().trim().max(180).optional(),
        optInStatus: z.enum(["opted_in", "opted_out", "unknown"]).optional(),
        tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
        customFields: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(2000),
});
export type BulkImportContactsInput = z.infer<typeof bulkImportContactsSchema>;

// ----------- media -----------------------------------------------

export const mediaUploadFieldsSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  caption: z.string().trim().max(500).optional(),
});
