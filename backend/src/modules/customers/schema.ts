import { z } from "zod";

export const listCustomersSchema = z.object({
  q: z.string().trim().optional(),
  email: z.string().email().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createCustomerSchema = z.object({
  fullName: z.string().trim().min(1).max(180),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).default([]),
  notes: z.string().trim().max(4000).optional(),
  leadId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();
export const customerParamSchema = z.object({ customerId: z.string().uuid() });

export type ListCustomersQuery = z.infer<typeof listCustomersSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
