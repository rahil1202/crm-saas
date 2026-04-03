import { z } from "zod";

export const listDocumentsSchema = z.object({
  q: z.string().trim().optional(),
  folder: z.string().trim().optional(),
  entityType: z.enum(["general", "lead", "deal", "customer"]).optional(),
  entityId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const documentParamSchema = z.object({
  documentId: z.string().uuid(),
});

export const uploadDocumentFieldsSchema = z
  .object({
    entityType: z.enum(["general", "lead", "deal", "customer"]).default("general"),
    entityId: z.string().uuid().optional(),
    folder: z.string().trim().max(120).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.entityType === "general" && value.entityId) {
      ctx.addIssue({
        code: "custom",
        message: "General documents cannot include an entityId",
        path: ["entityId"],
      });
    }

    if (value.entityType !== "general" && !value.entityId) {
      ctx.addIssue({
        code: "custom",
        message: "Entity attachments require an entityId",
        path: ["entityId"],
      });
    }
  });

export type ListDocumentsQuery = z.infer<typeof listDocumentsSchema>;
export type UploadDocumentFields = z.infer<typeof uploadDocumentFieldsSchema>;
