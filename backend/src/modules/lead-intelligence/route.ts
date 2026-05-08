import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  createLeadRoutingRuleHandler,
  createLeadScoreEvent,
  createLeadScoringRule,
  deleteLeadRoutingRuleHandler,
  deleteLeadScoringRuleHandler,
  getLeadAssignmentAuditTimeline,
  getLeadIntelligenceOverview,
  getLeadPrioritizationSummaryHandler,
  getLeadPriorityPreview,
  getLeadRoutingRules,
  getLeadScoreTimeline,
  getLeadScoringRules,
  installDefaultLeadScoringRulesHandler,
  recalculateLeadScoreHandler,
  routeLeadHandler,
  updateLeadRoutingRuleHandler,
  updateLeadScoringRuleHandler,
} from "@/modules/lead-intelligence/controller";
import {
  leadRoutingRuleSchema,
  leadScoreEventSchema,
  leadScoringRuleSchema,
  routeLeadSchema,
  updateLeadRoutingRuleSchema,
  updateLeadScoringRuleSchema,
} from "@/modules/lead-intelligence/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";

export const leadIntelligenceRoutes = new Hono<AppEnv>();
leadIntelligenceRoutes.use("*", requireAuth, requireTenant);

leadIntelligenceRoutes.get("/lead-intelligence", getLeadIntelligenceOverview);
leadIntelligenceRoutes.get("/lead-prioritization/summary", getLeadPrioritizationSummaryHandler);
leadIntelligenceRoutes.get("/lead-prioritization/preview", getLeadPriorityPreview);
leadIntelligenceRoutes.get("/lead-scoring-rules", getLeadScoringRules);
leadIntelligenceRoutes.post("/lead-scoring-rules", requireRole("admin"), validateJson(leadScoringRuleSchema), createLeadScoringRule);
leadIntelligenceRoutes.post("/lead-scoring-rules/defaults", requireRole("admin"), installDefaultLeadScoringRulesHandler);
leadIntelligenceRoutes.patch("/lead-scoring-rules/:ruleId", requireRole("admin"), validateJson(updateLeadScoringRuleSchema), updateLeadScoringRuleHandler);
leadIntelligenceRoutes.delete("/lead-scoring-rules/:ruleId", requireRole("admin"), deleteLeadScoringRuleHandler);
leadIntelligenceRoutes.post("/lead-score-events", requireRole("admin"), validateJson(leadScoreEventSchema), createLeadScoreEvent);
leadIntelligenceRoutes.post("/lead-score-history/:leadId/recalculate", requireRole("admin"), recalculateLeadScoreHandler);
leadIntelligenceRoutes.get("/lead-score-history/:leadId", getLeadScoreTimeline);
leadIntelligenceRoutes.get("/lead-assignment-audits/:leadId", getLeadAssignmentAuditTimeline);
leadIntelligenceRoutes.get("/lead-routing-rules", getLeadRoutingRules);
leadIntelligenceRoutes.post("/lead-routing-rules", requireRole("admin"), validateJson(leadRoutingRuleSchema), createLeadRoutingRuleHandler);
leadIntelligenceRoutes.patch("/lead-routing-rules/:ruleId", requireRole("admin"), validateJson(updateLeadRoutingRuleSchema), updateLeadRoutingRuleHandler);
leadIntelligenceRoutes.delete("/lead-routing-rules/:ruleId", requireRole("admin"), deleteLeadRoutingRuleHandler);
leadIntelligenceRoutes.post("/lead-routing-rules/route/:leadId", requireRole("admin"), validateJson(routeLeadSchema), routeLeadHandler);
