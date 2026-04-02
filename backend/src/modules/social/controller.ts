import { ok } from "@/lib/api";

export function getSocialOverview(c: Parameters<typeof ok>[0]) {
  return ok(c, {
    module: "social",
    capabilities: ["connect-accounts", "capture-social-leads", "social-inbox", "assign-social-leads"],
  });
}
