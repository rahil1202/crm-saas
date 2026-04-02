import { z } from "zod";

export const listLeadsQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["new", "qualified", "proposal", "won", "lost"]).optional(),
  source: z.string().trim().optional(),
  assignedToUserId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const boardLeadsQuerySchema = z.object({
  source: z.string().trim().optional(),
});

export const createLeadSchema = z.object({
  title: z.string().trim().min(1).max(180),
  fullName: z.string().trim().max(180).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
  source: z.string().trim().max(100).optional(),
  partnerCompanyId: z.string().uuid().nullable().optional(),
  status: z.enum(["new", "qualified", "proposal", "won", "lost"]).default("new"),
  score: z.number().int().min(0).max(100).default(0),
  notes: z.string().trim().max(4000).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).default([]),
  assignedToUserId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
});

export const updateLeadSchema = createLeadSchema.partial();

export const bulkUpdateLeadSchema = z
  .object({
    leadIds: z.array(z.string().uuid()).min(1).max(200),
    status: z.enum(["new", "qualified", "proposal", "won", "lost"]).optional(),
    source: z.string().trim().max(100).nullable().optional(),
  })
  .refine((value) => value.status !== undefined || value.source !== undefined, {
    message: "At least one bulk update field is required",
    path: ["status"],
  });

export const importLeadCsvSchema = z.object({
  csv: z.string().trim().min(1).max(100_000),
});

export const leadParamSchema = z.object({
  leadId: z.string().uuid(),
});

export const convertLeadSchema = z.object({
  dealTitle: z.string().trim().min(1).max(180).optional(),
  pipeline: z.string().trim().min(1).max(100).default("default"),
  stage: z.string().trim().min(1).max(100).default("new"),
  value: z.number().int().min(0).default(0),
  createCustomer: z.boolean().default(true),
});

export const leadTimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createLeadTimelineSchema = z.object({
  type: z.enum(["note", "call", "email", "meeting", "status_change", "system"]).default("note"),
  message: z.string().trim().min(1).max(1000),
});

export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
export type BoardLeadsQuery = z.infer<typeof boardLeadsQuerySchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type BulkUpdateLeadInput = z.infer<typeof bulkUpdateLeadSchema>;
export type ImportLeadCsvInput = z.infer<typeof importLeadCsvSchema>;
export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;
export type LeadTimelineQuery = z.infer<typeof leadTimelineQuerySchema>;
export type CreateLeadTimelineInput = z.infer<typeof createLeadTimelineSchema>;
