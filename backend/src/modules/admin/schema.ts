import { z } from "zod";

export const listAdminCompaniesSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["trial", "active", "past_due", "canceled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListAdminCompaniesQuery = z.infer<typeof listAdminCompaniesSchema>;
