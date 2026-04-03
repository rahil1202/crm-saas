import { z } from "zod";

export const leadScoringRuleSchema = z.object({
  name: z.string().trim().min(1).max(180),
  eventType: z.string().trim().min(1).max(80),
  channel: z.string().trim().max(40).optional(),
  conditions: z.record(z.string(), z.unknown()).default({}),
  weight: z.number().int().min(-100).max(100),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(1).max(1000).default(100),
});

export const leadScoreEventSchema = z.object({
  leadId: z.string().uuid(),
  eventType: z.string().trim().min(1).max(80),
  channel: z.string().trim().max(40).optional(),
  sourceId: z.string().trim().max(180).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const leadIdParamSchema = z.object({
  leadId: z.string().uuid(),
});

export const leadRoutingRuleSchema = z.object({
  name: z.string().trim().min(1).max(180),
  priority: z.number().int().min(1).max(1000).default(100),
  isActive: z.boolean().default(true),
  strategy: z.enum(["rule_match", "round_robin", "score_based"]).default("rule_match"),
  predicates: z.record(z.string(), z.unknown()).default({}),
  assignmentConfig: z.record(z.string(), z.unknown()).default({}),
});

export const routeLeadSchema = z.object({
  reason: z.string().trim().min(1).max(180).default("manual_route"),
});

export type CreateLeadScoringRuleInput = z.infer<typeof leadScoringRuleSchema>;
export type CreateLeadScoreEventInput = z.infer<typeof leadScoreEventSchema>;
export type CreateLeadRoutingRuleInput = z.infer<typeof leadRoutingRuleSchema>;
export type RouteLeadInput = z.infer<typeof routeLeadSchema>;
