import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import {
  chatbotFlowExecutionLogs,
  chatbotFlowExecutions,
  chatbotFlows,
  chatbotFlowVersions,
  conversationStates,
  socialConversations,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { findOrCreateWhatsappConversation, sendWhatsappMessage } from "@/lib/whatsapp-runtime";
import type {
  ChatbotConditionOperator,
  ChatbotFlowDefinition,
  ChatbotFlowEdge,
  ChatbotFlowNode,
  ChatbotFlowValidationError,
} from "@/modules/chatbot-flows/schema";

type FlowRow = typeof chatbotFlows.$inferSelect;
type FlowVersionRow = typeof chatbotFlowVersions.$inferSelect;
type ExecutionRow = typeof chatbotFlowExecutions.$inferSelect;
type ConversationStateRow = typeof conversationStates.$inferSelect;

interface RuntimeConversationContext {
  socialConversationId: string;
  contactHandle: string;
  contactName: string | null;
}

interface ExecutionDependencies {
  sendMessage: (input: { body: string }) => Promise<void>;
}

interface StartFlowExecutionInput {
  companyId: string;
  flowId: string;
  socialConversationId: string;
  createdBy: string;
  triggerSource: string;
  context?: Record<string, unknown>;
  lastInboundMessageId?: string | null;
}

export function getDefaultFlowDefinition(): ChatbotFlowDefinition {
  return {
    entry: "start",
    nodes: [
      { id: "start", type: "start", position: { x: 80, y: 120 }, config: {} },
      { id: "message_welcome", type: "message", position: { x: 320, y: 120 }, config: { body: "Hello from your WhatsApp flow." } },
      { id: "end", type: "end", position: { x: 560, y: 120 }, config: {} },
    ],
    edges: [
      { sourceNodeId: "start", targetNodeId: "message_welcome" },
      { sourceNodeId: "message_welcome", targetNodeId: "end" },
    ],
    settings: { replyTimeoutHours: 24 },
  };
}

function coerceContextValue(context: Record<string, unknown>, field: string) {
  const parts = field.split(".");
  let current: unknown = context;
  for (const part of parts) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function getNodeMap(definition: ChatbotFlowDefinition) {
  return new Map(definition.nodes.map((node) => [node.id, node] as const));
}

function getOutgoingEdges(definition: ChatbotFlowDefinition, nodeId: string) {
  return definition.edges.filter((edge) => edge.sourceNodeId === nodeId);
}

function getEdgeByHandle(edges: ChatbotFlowEdge[], handle: string) {
  return edges.find((edge) => edge.handle === handle) ?? null;
}

function getNextNodeByHandle(definition: ChatbotFlowDefinition, nodeId: string, handle?: string) {
  const outgoingEdges = getOutgoingEdges(definition, nodeId);
  const edge = handle ? getEdgeByHandle(outgoingEdges, handle) : outgoingEdges[0] ?? null;
  if (!edge) {
    return null;
  }
  const target = getNodeMap(definition).get(edge.targetNodeId);
  return target ?? null;
}

export function renderNodeResponse(body: string, context: Record<string, unknown>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, token: string) => {
    const value = coerceContextValue(context, token);
    return value === undefined || value === null ? "" : String(value);
  });
}

function evaluateCondition(operator: ChatbotConditionOperator, actual: unknown, expected?: unknown) {
  if (operator === "exists") {
    return actual !== undefined && actual !== null && `${actual}`.length > 0;
  }
  if (operator === "equals") {
    return actual === expected;
  }
  return actual !== expected;
}

export function resolveNextNode(input: {
  definition: ChatbotFlowDefinition;
  node: ChatbotFlowNode;
  context: Record<string, unknown>;
  inboundMessageBody?: string | null;
}) {
  const { definition, node, context, inboundMessageBody } = input;
  if (node.type === "start" || node.type === "message") {
    return {
      nextNode: getNextNodeByHandle(definition, node.id),
      context,
      pause: false,
    };
  }

  if (node.type === "condition") {
    const actual = coerceContextValue(context, node.config.field);
    const passed = evaluateCondition(node.config.operator, actual, node.config.value);
    return {
      nextNode: getNextNodeByHandle(definition, node.id, passed ? "true" : "false"),
      context,
      pause: false,
    };
  }

  if (node.type === "input") {
    if (inboundMessageBody === undefined) {
      return {
        nextNode: null,
        context,
        pause: true,
      };
    }

    const trimmed = (inboundMessageBody ?? "").trim();
    const capturedContext = {
      ...context,
      inputs: {
        ...((context.inputs as Record<string, unknown> | undefined) ?? {}),
        [node.config.captureKey]: trimmed,
      },
    };

    if (!trimmed && !node.config.allowEmpty) {
      return {
        nextNode: getNextNodeByHandle(definition, node.id, "fallback"),
        context: capturedContext,
        pause: false,
      };
    }

    return {
      nextNode: getNextNodeByHandle(definition, node.id, "success") ?? getNextNodeByHandle(definition, node.id),
      context: capturedContext,
      pause: false,
    };
  }

  return {
    nextNode: null,
    context,
    pause: false,
  };
}

export function validateFlowDefinition(definition: ChatbotFlowDefinition) {
  const errors: ChatbotFlowValidationError[] = [];
  const nodeIds = new Set<string>();
  const nodeMap = getNodeMap(definition);
  const startNodes = definition.nodes.filter((node) => node.type === "start");
  const endNodes = definition.nodes.filter((node) => node.type === "end");

  for (const node of definition.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push({ code: "duplicate_node_id", message: `Duplicate node id "${node.id}"`, nodeId: node.id });
    }
    nodeIds.add(node.id);
  }

  if (startNodes.length !== 1) {
    errors.push({ code: "invalid_start_count", message: "Flow must contain exactly one start node" });
  }

  if (!nodeMap.has(definition.entry)) {
    errors.push({ code: "invalid_entry", message: "Entry node must reference an existing node" });
  }

  for (const edge of definition.edges) {
    if (!nodeMap.has(edge.sourceNodeId) || !nodeMap.has(edge.targetNodeId)) {
      errors.push({
        code: "invalid_edge_reference",
        message: `Edge ${edge.id ?? `${edge.sourceNodeId}->${edge.targetNodeId}`} references a missing node`,
        edgeId: edge.id,
      });
    }
  }

  const reachable = new Set<string>();
  const queue = nodeMap.has(definition.entry) ? [definition.entry] : [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) {
      continue;
    }
    reachable.add(current);
    for (const edge of getOutgoingEdges(definition, current)) {
      if (!reachable.has(edge.targetNodeId)) {
        queue.push(edge.targetNodeId);
      }
    }
  }

  for (const node of definition.nodes) {
    if (!reachable.has(node.id)) {
      errors.push({ code: "unreachable_node", message: `Node "${node.id}" is unreachable from entry`, nodeId: node.id });
    }
  }

  const reachableEndNodes = endNodes.filter((node) => reachable.has(node.id));
  if (reachableEndNodes.length === 0) {
    errors.push({ code: "missing_reachable_end", message: "Flow must contain at least one reachable end node" });
  }

  for (const node of definition.nodes) {
    const outgoingEdges = getOutgoingEdges(definition, node.id);
    if ((node.type === "start" || node.type === "message") && outgoingEdges.length === 0) {
      errors.push({ code: "missing_next_node", message: `${node.type} node "${node.id}" must have an outgoing edge`, nodeId: node.id });
    }
    if (node.type === "message" && !node.config.body.trim()) {
      errors.push({ code: "missing_message_body", message: `Message node "${node.id}" must include outbound content`, nodeId: node.id });
    }
    if (node.type === "condition") {
      const handles = new Set(outgoingEdges.map((edge) => edge.handle));
      if (!handles.has("true") || !handles.has("false")) {
        errors.push({ code: "invalid_condition_branch", message: `Condition node "${node.id}" must define "true" and "false" branches`, nodeId: node.id });
      }
    }
    if (node.type === "input") {
      if (!node.config.captureKey.trim()) {
        errors.push({ code: "missing_capture_key", message: `Input node "${node.id}" must define a capture key`, nodeId: node.id });
      }
      if (outgoingEdges.length === 0) {
        errors.push({ code: "missing_input_paths", message: `Input node "${node.id}" must define a next or fallback path`, nodeId: node.id });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

async function getFlowRecord(companyId: string, flowId: string) {
  const [flow] = await db
    .select()
    .from(chatbotFlows)
    .where(and(eq(chatbotFlows.companyId, companyId), eq(chatbotFlows.id, flowId), isNull(chatbotFlows.deletedAt)))
    .limit(1);

  if (!flow) {
    throw AppError.notFound("Chatbot flow not found");
  }

  return flow;
}

async function getLatestDraftVersion(companyId: string, flowId: string) {
  const [version] = await db
    .select()
    .from(chatbotFlowVersions)
    .where(and(eq(chatbotFlowVersions.companyId, companyId), eq(chatbotFlowVersions.flowId, flowId), eq(chatbotFlowVersions.state, "draft")))
    .orderBy(desc(chatbotFlowVersions.versionNumber))
    .limit(1);

  if (!version) {
    throw AppError.notFound("Draft version not found");
  }

  return version;
}

async function getPublishedVersion(companyId: string, flowId: string) {
  const flow = await getFlowRecord(companyId, flowId);
  if (!flow.publishedVersionId) {
    throw AppError.conflict("Flow has not been published yet");
  }

  const [version] = await db
    .select()
    .from(chatbotFlowVersions)
    .where(and(eq(chatbotFlowVersions.companyId, companyId), eq(chatbotFlowVersions.id, flow.publishedVersionId)))
    .limit(1);

  if (!version) {
    throw AppError.notFound("Published version not found");
  }

  return version;
}

export async function appendExecutionLog(input: {
  companyId: string;
  executionId: string;
  nodeId?: string | null;
  eventType: string;
  message: string;
  payload?: Record<string, unknown>;
}) {
  const [log] = await db
    .insert(chatbotFlowExecutionLogs)
    .values({
      companyId: input.companyId,
      executionId: input.executionId,
      nodeId: input.nodeId ?? null,
      eventType: input.eventType,
      message: input.message,
      payload: input.payload ?? {},
    })
    .returning();

  return log;
}

async function loadConversationContext(companyId: string, socialConversationId: string): Promise<RuntimeConversationContext> {
  const [conversation] = await db
    .select({
      socialConversationId: socialConversations.id,
      contactHandle: socialConversations.contactHandle,
      contactName: socialConversations.contactName,
    })
    .from(socialConversations)
    .where(and(eq(socialConversations.companyId, companyId), eq(socialConversations.id, socialConversationId), isNull(socialConversations.deletedAt)))
    .limit(1);

  if (!conversation) {
    throw AppError.notFound("Conversation not found");
  }

  return conversation;
}

async function persistConversationState(input: {
  companyId: string;
  socialConversationId: string;
  flowId: string;
  currentNodeId: string;
  status: "active" | "paused" | "completed" | "expired";
  state: Record<string, unknown>;
  expiresAt?: Date | null;
}) {
  const sessionKey = `chatbot-flow:${input.flowId}:${input.socialConversationId}`;
  const [state] = await db
    .insert(conversationStates)
    .values({
      companyId: input.companyId,
      socialConversationId: input.socialConversationId,
      sessionKey,
      currentNode: input.currentNodeId,
      status: input.status,
      state: input.state,
      expiresAt: input.expiresAt ?? null,
      lastMessageAt: new Date(),
      resumedAt: new Date(),
      completedAt: input.status === "completed" ? new Date() : null,
    })
    .onConflictDoUpdate({
      target: [conversationStates.companyId, conversationStates.sessionKey],
      set: {
        currentNode: input.currentNodeId,
        status: input.status,
        state: input.state,
        expiresAt: input.expiresAt ?? null,
        lastMessageAt: new Date(),
        resumedAt: new Date(),
        completedAt: input.status === "completed" ? new Date() : null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return state;
}

async function executeFlowUntilPauseOrEnd(input: {
  companyId: string;
  flow: FlowRow;
  version: FlowVersionRow;
  execution: ExecutionRow;
  conversationState: ConversationStateRow;
  conversation: RuntimeConversationContext;
  inboundMessageBody?: string | null;
  lastInboundMessageId?: string | null;
}) {
  const definition = input.version.definition as ChatbotFlowDefinition;
  const nodeMap = getNodeMap(definition);
  let currentNode = nodeMap.get(input.execution.currentNodeId);
  if (!currentNode) {
    throw AppError.conflict("Execution references a missing node");
  }

  let context = { ...(input.execution.context ?? {}) };
  const deps: ExecutionDependencies = {
    sendMessage: async ({ body }) => {
      await sendWhatsappMessage({
        companyId: input.companyId,
        contactHandle: input.conversation.contactHandle,
        contactName: input.conversation.contactName,
        messageTemplate: body,
        createdBy: input.flow.createdBy,
        skipConversationStateSync: true,
      });
    },
  };

  let consumedInbound = false;
  while (currentNode) {
    await appendExecutionLog({
      companyId: input.companyId,
      executionId: input.execution.id,
      nodeId: currentNode.id,
      eventType: "node.entered",
      message: `Entered ${currentNode.type} node`,
      payload: { type: currentNode.type },
    });

    if (currentNode.type === "message") {
      const rendered = renderNodeResponse(currentNode.config.body, context);
      await deps.sendMessage({ body: rendered });
      await appendExecutionLog({
        companyId: input.companyId,
        executionId: input.execution.id,
        nodeId: currentNode.id,
        eventType: "node.rendered",
        message: "Rendered outbound message",
        payload: { body: rendered },
      });
    }

    if (currentNode.type === "end") {
      const finalState = {
        ...context,
        flowExecutionId: input.execution.id,
        currentNodeId: currentNode.id,
      };
      await db
        .update(chatbotFlowExecutions)
        .set({
          status: "completed",
          currentNodeId: currentNode.id,
          context: finalState,
          completedAt: new Date(),
          updatedAt: new Date(),
          lastInboundMessageId: input.lastInboundMessageId ?? input.execution.lastInboundMessageId ?? null,
        })
        .where(eq(chatbotFlowExecutions.id, input.execution.id));

      await persistConversationState({
        companyId: input.companyId,
        socialConversationId: input.conversation.socialConversationId,
        flowId: input.flow.id,
        currentNodeId: currentNode.id,
        status: "completed",
        state: finalState,
      });

      await appendExecutionLog({
        companyId: input.companyId,
        executionId: input.execution.id,
        nodeId: currentNode.id,
        eventType: "execution.completed",
        message: "Flow execution completed",
      });

      return {
        status: "completed" as const,
        currentNodeId: currentNode.id,
        context: finalState,
      };
    }

    const resolution = resolveNextNode({
      definition,
      node: currentNode,
      context,
      inboundMessageBody: !consumedInbound ? input.inboundMessageBody : undefined,
    });

    if (currentNode.type === "input" && !consumedInbound && input.inboundMessageBody !== undefined) {
      consumedInbound = true;
      await appendExecutionLog({
        companyId: input.companyId,
        executionId: input.execution.id,
        nodeId: currentNode.id,
        eventType: "input.captured",
        message: "Inbound reply captured",
        payload: { captureKey: currentNode.config.captureKey },
      });
    }

    context = resolution.context;
    const nextNode = resolution.nextNode;
    const nextNodeId = nextNode?.id ?? currentNode.id;
    const statePayload = {
      ...context,
      flowExecutionId: input.execution.id,
      currentNodeId: nextNodeId,
    };

    if (resolution.pause) {
      await db
        .update(chatbotFlowExecutions)
        .set({
          status: "paused",
          currentNodeId: currentNode.id,
          context: statePayload,
          updatedAt: new Date(),
          lastInboundMessageId: input.lastInboundMessageId ?? input.execution.lastInboundMessageId ?? null,
        })
        .where(eq(chatbotFlowExecutions.id, input.execution.id));

      await persistConversationState({
        companyId: input.companyId,
        socialConversationId: input.conversation.socialConversationId,
        flowId: input.flow.id,
        currentNodeId: currentNode.id,
        status: "paused",
        state: statePayload,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * ((definition.settings.replyTimeoutHours as number | undefined) ?? 24)),
      });

      await appendExecutionLog({
        companyId: input.companyId,
        executionId: input.execution.id,
        nodeId: currentNode.id,
        eventType: "execution.paused",
        message: "Execution paused awaiting user input",
      });

      return {
        status: "paused" as const,
        currentNodeId: currentNode.id,
        context: statePayload,
      };
    }

    await db
      .update(chatbotFlowExecutions)
      .set({
        status: "running",
        currentNodeId: nextNodeId,
        context: statePayload,
        updatedAt: new Date(),
        lastInboundMessageId: input.lastInboundMessageId ?? input.execution.lastInboundMessageId ?? null,
      })
      .where(eq(chatbotFlowExecutions.id, input.execution.id));

    await persistConversationState({
      companyId: input.companyId,
      socialConversationId: input.conversation.socialConversationId,
      flowId: input.flow.id,
      currentNodeId: nextNodeId,
      status: "active",
      state: statePayload,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * ((definition.settings.replyTimeoutHours as number | undefined) ?? 24)),
    });

    if (!nextNode) {
      throw AppError.conflict(`Node "${currentNode.id}" does not resolve to a next node`);
    }

    currentNode = nextNode;
  }

  throw AppError.internal("Execution ended unexpectedly");
}

export async function publishFlowVersion(input: { companyId: string; flowId: string }) {
  const flow = await getFlowRecord(input.companyId, input.flowId);
  const draftVersion = await getLatestDraftVersion(input.companyId, flow.id);
  const validation = validateFlowDefinition(draftVersion.definition as ChatbotFlowDefinition);

  await db
    .update(chatbotFlowVersions)
    .set({
      validationErrors: validation.errors,
      updatedAt: new Date(),
    })
    .where(eq(chatbotFlowVersions.id, draftVersion.id));

  if (!validation.valid) {
    throw AppError.badRequest("Flow definition is invalid", { errors: validation.errors });
  }

  const publishedAt = new Date();
  const [publishedVersion] = await db
    .update(chatbotFlowVersions)
    .set({
      state: "published",
      publishedAt,
      updatedAt: publishedAt,
    })
    .where(eq(chatbotFlowVersions.id, draftVersion.id))
    .returning();

  const [nextDraft] = await db
    .insert(chatbotFlowVersions)
    .values({
      companyId: input.companyId,
      flowId: flow.id,
      versionNumber: publishedVersion.versionNumber + 1,
      state: "draft",
      definition: draftVersion.definition,
      validationErrors: [],
      createdBy: flow.createdBy,
    })
    .returning();

  const [updatedFlow] = await db
    .update(chatbotFlows)
    .set({
      status: "published",
      publishedVersionId: publishedVersion.id,
      updatedAt: publishedAt,
    })
    .where(eq(chatbotFlows.id, flow.id))
    .returning();

  return {
    flow: updatedFlow,
    publishedVersion,
    nextDraft,
    validation,
  };
}

export async function startFlowExecution(input: StartFlowExecutionInput) {
  const flow = await getFlowRecord(input.companyId, input.flowId);
  const version = await getPublishedVersion(input.companyId, input.flowId);
  const conversation = await loadConversationContext(input.companyId, input.socialConversationId);

  const initialState = {
    ...(input.context ?? {}),
    flowExecutionId: null,
    currentNodeId: (version.definition as ChatbotFlowDefinition).entry,
    conversation: {
      id: conversation.socialConversationId,
      contactHandle: conversation.contactHandle,
      contactName: conversation.contactName,
    },
  };

  const conversationState = await persistConversationState({
    companyId: input.companyId,
    socialConversationId: input.socialConversationId,
    flowId: flow.id,
    currentNodeId: (version.definition as ChatbotFlowDefinition).entry,
    status: "active",
    state: initialState,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * (((version.definition as ChatbotFlowDefinition).settings.replyTimeoutHours as number | undefined) ?? 24)),
  });

  const [execution] = await db
    .insert(chatbotFlowExecutions)
    .values({
      companyId: input.companyId,
      flowId: flow.id,
      flowVersionId: version.id,
      conversationStateId: conversationState.id,
      status: "running",
      currentNodeId: (version.definition as ChatbotFlowDefinition).entry,
      triggerSource: input.triggerSource,
      context: {
        ...initialState,
        flowExecutionId: null,
      },
      lastInboundMessageId: input.lastInboundMessageId ?? null,
    })
    .returning();

  await db
    .update(chatbotFlowExecutions)
    .set({
      context: {
        ...initialState,
        flowExecutionId: execution.id,
      },
      updatedAt: new Date(),
    })
    .where(eq(chatbotFlowExecutions.id, execution.id));

  const result = await executeFlowUntilPauseOrEnd({
    companyId: input.companyId,
    flow,
    version,
    execution: {
      ...execution,
      context: {
        ...initialState,
        flowExecutionId: execution.id,
      },
    },
    conversationState,
    conversation,
    lastInboundMessageId: input.lastInboundMessageId ?? null,
  });

  return {
    executionId: execution.id,
    ...result,
  };
}

export async function resumeFlowExecution(input: {
  companyId: string;
  executionId: string;
  inboundMessageBody: string;
  lastInboundMessageId?: string | null;
}) {
  const [executionRow] = await db
    .select()
    .from(chatbotFlowExecutions)
    .where(and(eq(chatbotFlowExecutions.companyId, input.companyId), eq(chatbotFlowExecutions.id, input.executionId)))
    .limit(1);

  if (!executionRow) {
    throw AppError.notFound("Chatbot flow execution not found");
  }

  const [conversationState] = await db
    .select()
    .from(conversationStates)
    .where(eq(conversationStates.id, executionRow.conversationStateId))
    .limit(1);

  if (!conversationState) {
    throw AppError.notFound("Conversation state not found");
  }

  const flow = await getFlowRecord(input.companyId, executionRow.flowId);
  const [version] = await db
    .select()
    .from(chatbotFlowVersions)
    .where(and(eq(chatbotFlowVersions.companyId, input.companyId), eq(chatbotFlowVersions.id, executionRow.flowVersionId)))
    .limit(1);

  if (!version) {
    throw AppError.notFound("Flow version not found");
  }

  const conversation = await loadConversationContext(input.companyId, conversationState.socialConversationId);

  return executeFlowUntilPauseOrEnd({
    companyId: input.companyId,
    flow,
    version,
    execution: executionRow,
    conversationState,
    conversation,
    inboundMessageBody: input.inboundMessageBody,
    lastInboundMessageId: input.lastInboundMessageId ?? null,
  });
}

export async function resumeActiveChatbotFlowForConversation(input: {
  companyId: string;
  socialConversationId: string;
  inboundMessageBody: string;
  lastInboundMessageId?: string | null;
}) {
  const [execution] = await db
    .select({
      executionId: chatbotFlowExecutions.id,
    })
    .from(chatbotFlowExecutions)
    .innerJoin(conversationStates, eq(conversationStates.id, chatbotFlowExecutions.conversationStateId))
    .where(
      and(
        eq(chatbotFlowExecutions.companyId, input.companyId),
        eq(conversationStates.socialConversationId, input.socialConversationId),
        eq(chatbotFlowExecutions.status, "paused"),
      ),
    )
    .orderBy(desc(chatbotFlowExecutions.updatedAt))
    .limit(1);

  if (!execution) {
    return null;
  }

  return resumeFlowExecution({
    companyId: input.companyId,
    executionId: execution.executionId,
    inboundMessageBody: input.inboundMessageBody,
    lastInboundMessageId: input.lastInboundMessageId ?? null,
  });
}

export async function createFlowTestConversation(input: {
  companyId: string;
  accountId?: string | null;
  contactHandle: string;
  contactName?: string | null;
  createdBy: string;
}) {
  return findOrCreateWhatsappConversation({
    companyId: input.companyId,
    accountId: input.accountId,
    contactHandle: input.contactHandle,
    contactName: input.contactName,
    createdBy: input.createdBy,
  });
}
