import { z } from "zod";

export const listWhatsappWorkspacesSchema = z.object({
  q: z.string().trim().optional(),
});

export const whatsappWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(180),
  phoneNumberId: z.string().trim().min(1).max(120),
  businessAccountId: z.string().trim().max(120).optional(),
  accessToken: z.string().trim().optional(),
  verifyToken: z.string().trim().optional(),
  appSecret: z.string().trim().optional(),
  isActive: z.boolean().default(true),
  isVerified: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const updateWhatsappWorkspaceSchema = whatsappWorkspaceSchema.partial();
export const whatsappWorkspaceParamSchema = z.object({ workspaceId: z.string().uuid() });

export const listWhatsappTemplatesSchema = z.object({
  q: z.string().trim().optional(),
});

export const whatsappTemplateSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(180),
  category: z.string().trim().max(80).optional(),
  language: z.string().trim().min(1).max(16).default("en"),
  status: z.enum(["draft", "approved", "rejected", "paused"]).default("draft"),
  body: z.string().trim().min(1).max(4000),
  variables: z.array(z.object({ key: z.string().trim().min(1).max(120), fallback: z.string().trim().max(240).optional() })).default([]),
  providerTemplateId: z.string().trim().max(180).optional(),
});
export const updateWhatsappTemplateSchema = whatsappTemplateSchema.partial();

export const syncWhatsappTemplateSchema = z.object({
  status: z.enum(["draft", "approved", "rejected", "paused"]).default("approved"),
  providerTemplateId: z.string().trim().max(180).optional(),
});

export const whatsappTemplateParamSchema = z.object({ templateId: z.string().uuid() });

export type CreateWhatsappWorkspaceInput = z.infer<typeof whatsappWorkspaceSchema>;
export type UpdateWhatsappWorkspaceInput = z.infer<typeof updateWhatsappWorkspaceSchema>;
export type ListWhatsappWorkspacesQuery = z.infer<typeof listWhatsappWorkspacesSchema>;
export type CreateWhatsappTemplateInput = z.infer<typeof whatsappTemplateSchema>;
export type UpdateWhatsappTemplateInput = z.infer<typeof updateWhatsappTemplateSchema>;
export type SyncWhatsappTemplateInput = z.infer<typeof syncWhatsappTemplateSchema>;
export type ListWhatsappTemplatesQuery = z.infer<typeof listWhatsappTemplatesSchema>;
