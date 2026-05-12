import { z } from "zod";

export const keywordTriggerParamSchema = z.object({ triggerId: z.string().uuid() });
export const automationRuleParamSchema = z.object({ ruleId: z.string().uuid() });

export const keywordTriggerSchema = z.object({
  keyword: z.string().trim().min(1).max(120),
  matchType: z.enum(["exact", "contains", "starts_with", "regex"]).default("exact"),
  actionType: z.enum(["reply", "assign_flow", "assign_agent", "assign_tag", "human_handoff", "create_task"]),
  replyBody: z.string().trim().max(4000).optional(),
  flowId: z.string().uuid().optional(),
  assignToUserId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  priority: z.number().int().min(0).max(10000).default(100),
  isActive: z.boolean().default(true),
});
export type KeywordTriggerInput = z.infer<typeof keywordTriggerSchema>;

export const automationRuleSchema = z.object({
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1000).optional(),
  triggerType: z.enum(["inbound_message", "conversation_opened", "conversation_assigned", "keyword_match", "schedule"]),
  triggerConfig: z.record(z.string(), z.unknown()).default({}),
  actionType: z.enum(["reply", "assign_flow", "assign_agent", "assign_tag", "human_handoff", "set_priority", "create_task"]),
  actionConfig: z.record(z.string(), z.unknown()).default({}),
  conditions: z
    .array(
      z.object({
        field: z.string().trim().min(1).max(120),
        operator: z.enum(["equals", "not_equals", "contains", "starts_with", "exists", "regex"]),
        value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
      }),
    )
    .max(20)
    .default([]),
  priority: z.number().int().min(0).max(10000).default(100),
  isActive: z.boolean().default(true),
});
export type AutomationRuleInput = z.infer<typeof automationRuleSchema>;

export const flowAnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
export type FlowAnalyticsQuery = z.infer<typeof flowAnalyticsQuerySchema>;
