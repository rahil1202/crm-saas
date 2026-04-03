import { z } from "zod";

export const chatbotFlowStatusSchema = z.enum(["draft", "published", "archived"]);
export const chatbotFlowEntryChannelSchema = z.enum(["whatsapp"]);
export const chatbotFlowVersionStateSchema = z.enum(["draft", "published"]);
export const chatbotFlowExecutionStatusSchema = z.enum(["running", "paused", "completed", "failed", "canceled"]);
export const chatbotConditionOperatorSchema = z.enum(["equals", "not_equals", "exists"]);

export const chatbotNodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const baseNodeSchema = z.object({
  id: z.string().trim().min(1).max(120),
  position: chatbotNodePositionSchema,
});

export const chatbotStartNodeSchema = baseNodeSchema.extend({
  type: z.literal("start"),
  config: z.object({}).default({}),
});

export const chatbotMessageNodeSchema = baseNodeSchema.extend({
  type: z.literal("message"),
  config: z.object({
    body: z.string().trim().min(1).max(4000),
  }),
});

export const chatbotConditionNodeSchema = baseNodeSchema.extend({
  type: z.literal("condition"),
  config: z.object({
    field: z.string().trim().min(1).max(120),
    operator: chatbotConditionOperatorSchema,
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  }),
});

export const chatbotInputNodeSchema = baseNodeSchema.extend({
  type: z.literal("input"),
  config: z.object({
    captureKey: z.string().trim().min(1).max(120),
    allowEmpty: z.boolean().default(false),
  }),
});

export const chatbotEndNodeSchema = baseNodeSchema.extend({
  type: z.literal("end"),
  config: z.object({}).default({}),
});

export const chatbotFlowNodeSchema = z.discriminatedUnion("type", [
  chatbotStartNodeSchema,
  chatbotMessageNodeSchema,
  chatbotConditionNodeSchema,
  chatbotInputNodeSchema,
  chatbotEndNodeSchema,
]);

export const chatbotFlowEdgeSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  sourceNodeId: z.string().trim().min(1).max(120),
  targetNodeId: z.string().trim().min(1).max(120),
  handle: z.string().trim().min(1).max(40).optional(),
});

export const chatbotFlowDefinitionSchema = z.object({
  entry: z.string().trim().min(1).max(120),
  nodes: z.array(chatbotFlowNodeSchema).min(1).max(200),
  edges: z.array(chatbotFlowEdgeSchema).max(400).default([]),
  settings: z
    .object({
      replyTimeoutHours: z.number().int().min(1).max(168).default(24).optional(),
    })
    .default({}),
});

export const chatbotFlowValidationErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  nodeId: z.string().optional(),
  edgeId: z.string().optional(),
});

export const listChatbotFlowsSchema = z.object({
  q: z.string().trim().optional(),
  status: chatbotFlowStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createChatbotFlowSchema = z.object({
  name: z.string().trim().min(2).max(180),
  entryChannel: chatbotFlowEntryChannelSchema.default("whatsapp"),
});

export const updateChatbotFlowSchema = z.object({
  name: z.string().trim().min(2).max(180).optional(),
  status: chatbotFlowStatusSchema.optional(),
  entryChannel: chatbotFlowEntryChannelSchema.optional(),
  definition: chatbotFlowDefinitionSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one field is required for update",
});

export const createChatbotFlowVersionSchema = z.object({
  definition: chatbotFlowDefinitionSchema.optional(),
});

export const chatbotFlowParamSchema = z.object({
  flowId: z.string().uuid(),
});

export const chatbotFlowExecutionParamSchema = z.object({
  executionId: z.string().uuid(),
});

export const testRunChatbotFlowSchema = z.object({
  contactHandle: z.string().trim().min(8).max(32),
  contactName: z.string().trim().min(1).max(180).optional(),
  accountId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  initialContext: z.record(z.string(), z.unknown()).default({}),
});

export type ChatbotFlowStatus = z.infer<typeof chatbotFlowStatusSchema>;
export type ChatbotFlowEntryChannel = z.infer<typeof chatbotFlowEntryChannelSchema>;
export type ChatbotFlowVersionState = z.infer<typeof chatbotFlowVersionStateSchema>;
export type ChatbotFlowExecutionStatus = z.infer<typeof chatbotFlowExecutionStatusSchema>;
export type ChatbotConditionOperator = z.infer<typeof chatbotConditionOperatorSchema>;
export type ChatbotFlowNode = z.infer<typeof chatbotFlowNodeSchema>;
export type ChatbotFlowEdge = z.infer<typeof chatbotFlowEdgeSchema>;
export type ChatbotFlowDefinition = z.infer<typeof chatbotFlowDefinitionSchema>;
export type ChatbotFlowValidationError = z.infer<typeof chatbotFlowValidationErrorSchema>;
export type ListChatbotFlowsQuery = z.infer<typeof listChatbotFlowsSchema>;
export type CreateChatbotFlowInput = z.infer<typeof createChatbotFlowSchema>;
export type UpdateChatbotFlowInput = z.infer<typeof updateChatbotFlowSchema>;
export type CreateChatbotFlowVersionInput = z.infer<typeof createChatbotFlowVersionSchema>;
export type TestRunChatbotFlowInput = z.infer<typeof testRunChatbotFlowSchema>;
