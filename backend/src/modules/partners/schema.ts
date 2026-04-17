import { z } from "zod";

export const listPartnersSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  createdBy: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const partnerSchema = z.object({
  name: z.string().trim().min(2).max(180),
  contactName: z.string().trim().max(180).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(4000).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

const partnerPermissionsSchema = z.object({
  leads: z.boolean().default(true),
  deals: z.boolean().default(true),
  reports: z.boolean().default(false),
  documents: z.boolean().default(false),
});

export const listPartnerUsersSchema = z.object({
  partnerCompanyId: z.string().uuid().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const partnerUserSchema = z.object({
  partnerCompanyId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(180),
  email: z.string().email(),
  phone: z.string().trim().max(40).optional(),
  title: z.string().trim().max(120).optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  accessLevel: z.enum(["restricted", "standard", "manager"]).default("restricted"),
  permissions: partnerPermissionsSchema.default({
    leads: true,
    deals: true,
    reports: false,
    documents: false,
  }),
});

export const updatePartnerSchema = partnerSchema.partial();
export const updatePartnerUserSchema = partnerUserSchema.partial();
export const partnerParamSchema = z.object({ partnerId: z.string().uuid() });
export const partnerUserParamSchema = z.object({ partnerUserId: z.string().uuid() });
export const partnerCompanyParamSchema = z.object({ companyId: z.string().uuid() });
export const leavePartnerCompanySchema = z.object({
  confirm: z.literal(true),
});

export type ListPartnersQuery = z.infer<typeof listPartnersSchema>;
export type CreatePartnerInput = z.infer<typeof partnerSchema>;
export type UpdatePartnerInput = z.infer<typeof updatePartnerSchema>;
export type ListPartnerUsersQuery = z.infer<typeof listPartnerUsersSchema>;
export type CreatePartnerUserInput = z.infer<typeof partnerUserSchema>;
export type UpdatePartnerUserInput = z.infer<typeof updatePartnerUserSchema>;
export type LeavePartnerCompanyInput = z.infer<typeof leavePartnerCompanySchema>;
