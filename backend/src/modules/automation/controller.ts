import { ok } from "@/lib/api";

export function getAutomationOverview(c: Parameters<typeof ok>[0]) {
  return ok(c, {
    module: "automation",
    capabilities: ["builder", "trigger-conditions", "actions", "multi-step-workflows", "automation-logs"],
  });
}
