import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";
import {
  createAutomationRule,
  createKeywordTrigger,
  getAutomationRules,
  getFlowAnalytics,
  getKeywordTriggers,
  removeAutomationRule,
  removeKeywordTrigger,
  updateAutomationRule,
  updateKeywordTrigger,
} from "@/modules/whatsapp-flows/controller";
import {
  automationRuleSchema,
  flowAnalyticsQuerySchema,
  keywordTriggerSchema,
} from "@/modules/whatsapp-flows/schema";

export const whatsappFlowRoutes = new Hono<AppEnv>();
whatsappFlowRoutes.use("*", requireAuth, requireTenant);

// Keyword triggers
whatsappFlowRoutes.get("/whatsapp/keyword-triggers", getKeywordTriggers);
whatsappFlowRoutes.post("/whatsapp/keyword-triggers", requireRole("admin"), validateJson(keywordTriggerSchema), createKeywordTrigger);
whatsappFlowRoutes.patch("/whatsapp/keyword-triggers/:triggerId", requireRole("admin"), validateJson(keywordTriggerSchema), updateKeywordTrigger);
whatsappFlowRoutes.delete("/whatsapp/keyword-triggers/:triggerId", requireRole("admin"), removeKeywordTrigger);

// Automation rules
whatsappFlowRoutes.get("/whatsapp/automation-rules", getAutomationRules);
whatsappFlowRoutes.post("/whatsapp/automation-rules", requireRole("admin"), validateJson(automationRuleSchema), createAutomationRule);
whatsappFlowRoutes.patch("/whatsapp/automation-rules/:ruleId", requireRole("admin"), validateJson(automationRuleSchema), updateAutomationRule);
whatsappFlowRoutes.delete("/whatsapp/automation-rules/:ruleId", requireRole("admin"), removeAutomationRule);

// Flow analytics
whatsappFlowRoutes.get("/whatsapp/flow-analytics", validateQuery(flowAnalyticsQuerySchema), getFlowAnalytics);
