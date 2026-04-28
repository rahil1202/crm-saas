import { z } from "zod";

export const outreachStatusSchema = z.enum(["pending", "sent", "opened", "replied", "bounced"]);

export const listOutreachAccountsQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: outreachStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listOutreachContactsQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: outreachStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const outreachDashboardQuerySchema = z.object({
  range: z.enum(["all", "30d", "7d"]).optional().default("all"),
});

export const outreachContactInputSchema = z.object({
  fullName: z.string().trim().min(1).max(180),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(40).optional(),
  title: z.string().trim().max(160).optional(),
  linkedinUrl: z.string().trim().url().optional(),
  status: outreachStatusSchema.optional(),
});

export const createOutreachAccountSchema = z.object({
  name: z.string().trim().min(1).max(180),
  domain: z.string().trim().max(255).optional(),
  website: z.string().trim().url().optional(),
  linkedinUrl: z.string().trim().url().optional(),
  industry: z.string().trim().max(120).optional(),
  sizeBand: z.string().trim().max(60).optional(),
  location: z.string().trim().max(180).optional(),
  notes: z.string().trim().max(4000).optional(),
  contacts: z.array(outreachContactInputSchema).max(50).default([]),
});

export const updateOutreachAccountSchema = createOutreachAccountSchema.partial().extend({
  contacts: z.array(outreachContactInputSchema).max(50).optional(),
});

export const createOutreachContactSchema = z.object({
  accountId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(180),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(40).optional(),
  title: z.string().trim().max(160).optional(),
  linkedinUrl: z.string().trim().url().optional(),
  status: outreachStatusSchema.optional(),
});

export const updateOutreachContactSchema = createOutreachContactSchema.omit({ accountId: true }).partial();

export const outreachAccountParamSchema = z.object({
  accountId: z.string().uuid(),
});

export const outreachContactParamSchema = z.object({
  contactId: z.string().uuid(),
});

export const createOutreachListSchema = z.object({
  name: z.string().trim().min(1).max(180),
  entityType: z.enum(["contact", "account"]).default("contact"),
});

export const outreachListParamSchema = z.object({
  listId: z.string().uuid(),
});

export const addOutreachListMembersSchema = z.object({
  accountIds: z.array(z.string().uuid()).max(200).default([]),
  contactIds: z.array(z.string().uuid()).max(200).default([]),
});

export const outreachTemplatePreviewSchema = z.object({
  templateId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
});

export const outreachTemplateSendSchema = z.object({
  templateId: z.string().uuid(),
  contactIds: z.array(z.string().uuid()).min(1).max(200),
  emailAccountId: z.string().uuid().optional(),
});

export const outreachListSendSchema = z.object({
  templateId: z.string().uuid(),
  listId: z.string().uuid(),
  emailAccountId: z.string().uuid().optional(),
});

export const importOutreachCsvSchema = z.object({
  csv: z.string().trim().min(1).max(200_000),
});

export type ListOutreachAccountsQuery = z.infer<typeof listOutreachAccountsQuerySchema>;
export type ListOutreachContactsQuery = z.infer<typeof listOutreachContactsQuerySchema>;
export type OutreachDashboardQuery = z.infer<typeof outreachDashboardQuerySchema>;
export type CreateOutreachAccountInput = z.infer<typeof createOutreachAccountSchema>;
export type UpdateOutreachAccountInput = z.infer<typeof updateOutreachAccountSchema>;
export type CreateOutreachContactInput = z.infer<typeof createOutreachContactSchema>;
export type UpdateOutreachContactInput = z.infer<typeof updateOutreachContactSchema>;
export type CreateOutreachListInput = z.infer<typeof createOutreachListSchema>;
export type AddOutreachListMembersInput = z.infer<typeof addOutreachListMembersSchema>;
export type OutreachTemplatePreviewInput = z.infer<typeof outreachTemplatePreviewSchema>;
export type OutreachTemplateSendInput = z.infer<typeof outreachTemplateSendSchema>;
export type OutreachListSendInput = z.infer<typeof outreachListSendSchema>;
export type ImportOutreachCsvInput = z.infer<typeof importOutreachCsvSchema>;
