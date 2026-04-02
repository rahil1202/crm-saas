import { ok } from "@/lib/api";

export function getCampaignOverview(c: Parameters<typeof ok>[0]) {
  return ok(c, {
    module: "campaigns",
    capabilities: ["create-campaign", "audience-selection", "email-campaigns", "scheduling", "analytics"],
  });
}
