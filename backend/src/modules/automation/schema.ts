import { z } from "zod";

export const automationStatusSchema = z.enum(["active", "paused"]);

export const automationActionSchema = z.object({
  type: z.string().trim().min(1).max(80),
  condition: z.record(z.string(), z.unknown()).optional(),
  branch: z
    .object({
      onTrueActionIndex: z.number().int().min(0).optional(),
      onFalseActionIndex: z.number().int().min(0).optional(),
    })
    .optional(),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const listAutomationsSchema = z.object({
  q: z.string().trim().optional(),
  status: automationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const automationSchema = z.object({
  name: z.string().trim().min(2).max(180),
  status: automationStatusSchema.default("active"),
  triggerType: z.string().trim().min(1).max(80),
  triggerConfig: z.record(z.string(), z.unknown()).default({}),
  testModeEnabled: z.boolean().default(false),
  branchMode: z.string().trim().min(1).max(40).default("none"),
  channelMetadata: z.record(z.string(), z.unknown()).default({}),
  actions: z.array(automationActionSchema).min(1).max(20),
  notes: z.string().trim().max(4000).optional(),
});

export const updateAutomationSchema = automationSchema.partial();
export const automationParamSchema = z.object({ automationId: z.string().uuid() });
export const automationRunParamSchema = z.object({ runId: z.string().uuid() });
export const listAutomationRunsSchema = z.object({
  automationId: z.string().uuid().optional(),
});

export type AutomationStatus = z.infer<typeof automationStatusSchema>;
export type AutomationAction = z.infer<typeof automationActionSchema>;
export type ListAutomationsQuery = z.infer<typeof listAutomationsSchema>;
export type CreateAutomationInput = z.infer<typeof automationSchema>;
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;
export type ListAutomationRunsQuery = z.infer<typeof listAutomationRunsSchema>;
