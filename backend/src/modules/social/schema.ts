import { z } from "zod";

const platformSchema = z.enum(["instagram", "facebook", "whatsapp", "linkedin"]);
const accountStatusSchema = z.enum(["connected", "disconnected"]);
const conversationStatusSchema = z.enum(["open", "assigned", "closed"]);
const directionSchema = z.enum(["inbound", "outbound"]);

export const listSocialAccountsSchema = z.object({
  platform: platformSchema.optional(),
});

export const socialAccountSchema = z.object({
  platform: platformSchema,
  accountName: z.string().trim().min(1).max(180),
  handle: z.string().trim().min(1).max(180),
  status: accountStatusSchema.default("connected"),
  accessMode: z.string().trim().min(1).max(40).default("manual"),
});

export const updateSocialAccountSchema = socialAccountSchema.partial();

export const listSocialInboxSchema = z.object({
  status: conversationStatusSchema.optional(),
  platform: platformSchema.optional(),
  assignedToUserId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const captureSocialConversationSchema = z.object({
  socialAccountId: z.string().uuid(),
  contactName: z.string().trim().max(180).optional(),
  contactHandle: z.string().trim().min(1).max(180),
  subject: z.string().trim().max(240).optional(),
  message: z.string().trim().min(1).max(4000),
  assignedToUserId: z.string().uuid().nullable().optional(),
});

export const updateSocialConversationSchema = z.object({
  status: conversationStatusSchema.optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  unreadCount: z.number().int().min(0).optional(),
});

export const createSocialMessageSchema = z.object({
  direction: directionSchema.default("outbound"),
  senderName: z.string().trim().max(180).optional(),
  body: z.string().trim().min(1).max(4000),
});

export const convertSocialConversationSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  source: z.string().trim().max(100).default("social"),
  score: z.number().int().min(0).max(100).default(55),
  assignedToUserId: z.string().uuid().nullable().optional(),
});

export const socialAccountParamSchema = z.object({ accountId: z.string().uuid() });
export const socialConversationParamSchema = z.object({ conversationId: z.string().uuid() });

export type ListSocialAccountsQuery = z.infer<typeof listSocialAccountsSchema>;
export type CreateSocialAccountInput = z.infer<typeof socialAccountSchema>;
export type UpdateSocialAccountInput = z.infer<typeof updateSocialAccountSchema>;
export type ListSocialInboxQuery = z.infer<typeof listSocialInboxSchema>;
export type CaptureSocialConversationInput = z.infer<typeof captureSocialConversationSchema>;
export type UpdateSocialConversationInput = z.infer<typeof updateSocialConversationSchema>;
export type CreateSocialMessageInput = z.infer<typeof createSocialMessageSchema>;
export type ConvertSocialConversationInput = z.infer<typeof convertSocialConversationSchema>;
