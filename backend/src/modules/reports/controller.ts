import { ok } from "@/lib/api";

export function getReportOverview(c: Parameters<typeof ok>[0]) {
  return ok(c, {
    module: "reports",
    capabilities: ["lead-reports", "deal-reports", "revenue-forecast", "partner-performance", "campaign-performance"],
  });
}
