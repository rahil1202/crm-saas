import { ok } from "@/lib/api";

export function getTemplateOverview(c: Parameters<typeof ok>[0]) {
  return ok(c, {
    module: "templates",
    capabilities: ["email-templates", "whatsapp-templates", "sms-templates", "task-templates", "pipeline-templates"],
  });
}
