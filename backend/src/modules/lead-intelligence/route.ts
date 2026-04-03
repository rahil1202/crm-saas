import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  createLeadRoutingRuleHandler,
  createLeadScoreEvent,
  createLeadScoringRule,
  getLeadAssignmentAuditTimeline,
  getLeadIntelligenceOverview,
  getLeadRoutingRules,
  getLeadScoreTimeline,
  getLeadScoringRules,
  routeLeadHandler,
} from "@/modules/lead-intelligence/controller";
import { leadRoutingRuleSchema, leadScoreEventSchema, leadScoringRuleSchema, routeLeadSchema } from "@/modules/lead-intelligence/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";

export const leadIntelligenceRoutes = new Hono<AppEnv>();
leadIntelligenceRoutes.use("*", requireAuth, requireTenant);

leadIntelligenceRoutes.get("/lead-intelligence", getLeadIntelligenceOverview);
leadIntelligenceRoutes.get("/lead-scoring-rules", getLeadScoringRules);
leadIntelligenceRoutes.post("/lead-scoring-rules", requireRole("admin"), validateJson(leadScoringRuleSchema), createLeadScoringRule);
leadIntelligenceRoutes.post("/lead-score-events", requireRole("admin"), validateJson(leadScoreEventSchema), createLeadScoreEvent);
leadIntelligenceRoutes.get("/lead-score-history/:leadId", getLeadScoreTimeline);
leadIntelligenceRoutes.get("/lead-assignment-audits/:leadId", getLeadAssignmentAuditTimeline);
leadIntelligenceRoutes.get("/lead-routing-rules", getLeadRoutingRules);
leadIntelligenceRoutes.post("/lead-routing-rules", requireRole("admin"), validateJson(leadRoutingRuleSchema), createLeadRoutingRuleHandler);
leadIntelligenceRoutes.post("/lead-routing-rules/route/:leadId", requireRole("admin"), validateJson(routeLeadSchema), routeLeadHandler);
