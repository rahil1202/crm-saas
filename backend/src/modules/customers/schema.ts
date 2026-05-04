import { z } from "zod";

const customerSortFields = [
  "name",
  "email",
  "mobile",
  "title",
  "remarks",
  "callRemark",
  "callStatus",
  "productTags",
  "country",
  "source",
  "status",
  "createdAt",
  "updatedAt",
] as const;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const listCustomersSchema = z.object({
  q: z.string().trim().optional(),
  email: z.string().email().optional(),
  assignedToUserId: z.string().uuid().optional(),
  title: z.string().trim().optional(),
  callRemark: z.string().trim().optional(),
  callStatus: z.string().trim().optional(),
  productTags: z.string().trim().optional(),
  country: z.string().trim().optional(),
  source: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  createdFrom: isoDateSchema.optional(),
  createdTo: isoDateSchema.optional(),
  lifecycle: z.enum(["active", "deleted"]).default("active"),
  sortBy: z.enum(customerSortFields).default("updatedAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createCustomerSchema = z.object({
  fullName: z.string().trim().min(1).max(180),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).default([]),
  notes: z.string().trim().max(4000).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();
export const customerParamSchema = z.object({ customerId: z.string().uuid() });
export const importCustomerCsvSchema = z.object({
  csv: z.string().trim().min(1).max(100_000),
});

export type ListCustomersQuery = z.infer<typeof listCustomersSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ImportCustomerCsvInput = z.infer<typeof importCustomerCsvSchema>;
