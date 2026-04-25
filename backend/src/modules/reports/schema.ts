import { z } from "zod";

export const reportSummaryQuerySchema = z.object({
  periodDays: z.coerce.number().int().min(7).max(365).default(90),
  forecastMonths: z.coerce.number().int().min(1).max(12).default(6),
});

export const reportDashboardQuerySchema = z.object({
  periodDays: z.coerce.number().int().min(7).max(365).default(30),
  forecastMonths: z.coerce.number().int().min(1).max(12).default(6),
  activityLimit: z.coerce.number().int().min(4).max(20).default(8),
});

export type ReportSummaryQuery = z.infer<typeof reportSummaryQuerySchema>;
export type ReportDashboardQuery = z.infer<typeof reportDashboardQuerySchema>;
