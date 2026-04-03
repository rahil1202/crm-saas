import { z } from "zod";

const storeCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/^-+|-+$/g, ""));

export const updateCompanySchema = z.object({
  name: z.string().trim().min(2).max(180),
  timezone: z.string().trim().min(2).max(80),
  currency: z.string().trim().min(3).max(8),
});

export const createStoreSchema = z.object({
  name: z.string().trim().min(2).max(180),
  code: storeCodeSchema,
  isDefault: z.boolean().optional().default(false),
});

export const updateStoreSchema = z.object({
  name: z.string().trim().min(2).max(180),
  code: storeCodeSchema,
  isDefault: z.boolean().optional().default(false),
});

export const updateCompanyPlanSchema = z.object({
  planCode: z.string().trim().min(2).max(80),
  planName: z.string().trim().min(2).max(120),
  status: z.enum(["trial", "active", "past_due", "canceled"]),
  billingInterval: z.enum(["monthly", "yearly", "custom"]),
  seatLimit: z.coerce.number().int().min(1).max(100000),
  monthlyPrice: z.coerce.number().int().min(0),
  currency: z.string().trim().min(3).max(8),
  trialEndsAt: z.string().datetime().nullable().optional(),
  renewalDate: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

export const storeParamSchema = z.object({
  storeId: z.string().uuid(),
});

export const companyParamSchema = z.object({
  companyId: z.string().uuid(),
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
export type UpdateCompanyPlanInput = z.infer<typeof updateCompanyPlanSchema>;
