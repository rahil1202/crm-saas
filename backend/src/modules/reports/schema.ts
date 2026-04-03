import { z } from "zod";

export const reportSummaryQuerySchema = z.object({
  periodDays: z.coerce.number().int().min(7).max(365).default(90),
  forecastMonths: z.coerce.number().int().min(1).max(12).default(6),
});

export type ReportSummaryQuery = z.infer<typeof reportSummaryQuerySchema>;
