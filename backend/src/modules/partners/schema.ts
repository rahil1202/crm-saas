import { z } from "zod";

export const listPartnersSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const partnerSchema = z.object({
  name: z.string().trim().min(2).max(180),
  contactName: z.string().trim().max(180).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(4000).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const updatePartnerSchema = partnerSchema.partial();
export const partnerParamSchema = z.object({ partnerId: z.string().uuid() });

export type ListPartnersQuery = z.infer<typeof listPartnersSchema>;
export type CreatePartnerInput = z.infer<typeof partnerSchema>;
export type UpdatePartnerInput = z.infer<typeof updatePartnerSchema>;
