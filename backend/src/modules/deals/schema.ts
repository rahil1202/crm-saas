import { z } from "zod";

export const listDealsSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["open", "won", "lost"]).optional(),
  pipeline: z.string().trim().optional(),
  assignedToUserId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const boardDealsSchema = z.object({
  pipeline: z.string().trim().optional(),
});

export const dealForecastQuerySchema = z.object({
  horizonMonths: z.coerce.number().int().min(1).max(12).default(6),
});

export const createDealSchema = z.object({
  title: z.string().trim().min(1).max(180),
  pipeline: z.string().trim().min(1).max(100).default("default"),
  stage: z.string().trim().min(1).max(100).default("new"),
  status: z.enum(["open", "won", "lost"]).default("open"),
  value: z.number().int().min(0).default(0),
  expectedCloseDate: z.string().datetime().optional(),
  lostReason: z.string().trim().max(250).optional(),
  notes: z.string().trim().max(4000).optional(),
  partnerCompanyId: z.string().uuid().nullable().optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
});

export const updateDealSchema = createDealSchema.partial();
export const dealParamSchema = z.object({ dealId: z.string().uuid() });

export const dealTimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createDealTimelineSchema = z.object({
  type: z.enum(["note", "call", "email", "meeting", "status_change", "system"]).default("note"),
  message: z.string().trim().min(1).max(1000),
});

export type ListDealsQuery = z.infer<typeof listDealsSchema>;
export type BoardDealsQuery = z.infer<typeof boardDealsSchema>;
export type DealForecastQuery = z.infer<typeof dealForecastQuerySchema>;
export type CreateDealInput = z.infer<typeof createDealSchema>;
export type UpdateDealInput = z.infer<typeof updateDealSchema>;
export type DealTimelineQuery = z.infer<typeof dealTimelineQuerySchema>;
export type CreateDealTimelineInput = z.infer<typeof createDealTimelineSchema>;
