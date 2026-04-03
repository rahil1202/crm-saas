import { z } from "zod";

export const templateTypeSchema = z.enum(["email", "whatsapp", "sms", "task", "pipeline"]);

export const listTemplatesSchema = z.object({
  q: z.string().trim().optional(),
  type: templateTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const templateSchema = z.object({
  name: z.string().trim().min(2).max(180),
  type: templateTypeSchema,
  subject: z.string().trim().max(240).optional(),
  content: z.string().trim().min(1).max(12000),
  notes: z.string().trim().max(4000).optional(),
});

export const updateTemplateSchema = templateSchema.partial();
export const templateParamSchema = z.object({ templateId: z.string().uuid() });

export type TemplateType = z.infer<typeof templateTypeSchema>;
export type ListTemplatesQuery = z.infer<typeof listTemplatesSchema>;
export type CreateTemplateInput = z.infer<typeof templateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
