import { ok } from "@/lib/api";

export function getNotificationOverview(c: Parameters<typeof ok>[0]) {
  return ok(c, {
    module: "notifications",
    capabilities: ["lead-alerts", "task-alerts", "deal-alerts", "campaign-alerts"],
  });
}
