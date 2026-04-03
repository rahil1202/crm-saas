export type FlowStatus = "draft" | "published" | "archived";
export type ExecutionStatus = "running" | "paused" | "completed" | "failed" | "canceled";
export type NodeType = "start" | "message" | "condition" | "input" | "end";
export type BranchHandle = "true" | "false" | "success" | "fallback";

export interface ValidationError {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface StartNode {
  id: string;
  type: "start";
  position: NodePosition;
  config: Record<string, never>;
}

export interface MessageNode {
  id: string;
  type: "message";
  position: NodePosition;
  config: {
    body: string;
  };
}

export interface ConditionNode {
  id: string;
  type: "condition";
  position: NodePosition;
  config: {
    field: string;
    operator: "equals" | "not_equals" | "exists";
    value?: string | number | boolean | null;
  };
}

export interface InputNode {
  id: string;
  type: "input";
  position: NodePosition;
  config: {
    captureKey: string;
    allowEmpty: boolean;
  };
}

export interface EndNode {
  id: string;
  type: "end";
  position: NodePosition;
  config: Record<string, never>;
}

export type FlowNode = StartNode | MessageNode | ConditionNode | InputNode | EndNode;

export interface FlowEdge {
  id?: string;
  sourceNodeId: string;
  targetNodeId: string;
  handle?: string;
}

export interface FlowDefinition {
  entry: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  settings?: {
    replyTimeoutHours?: number;
  };
}

export interface FlowVersion {
  id: string;
  versionNumber: number;
  state: "draft" | "published";
  definition: FlowDefinition;
  validationErrors: ValidationError[];
  publishedAt: string | null;
  updatedAt: string;
}

export interface ChatbotFlow {
  id: string;
  name: string;
  status: FlowStatus;
  entryChannel: "whatsapp";
  publishedVersionId: string | null;
  updatedAt: string;
  draftVersion: FlowVersion | null;
  publishedVersion: FlowVersion | null;
}

export interface FlowListResponse {
  items: ChatbotFlow[];
}

export interface ExecutionSummary {
  id: string;
  status: ExecutionStatus;
  currentNodeId: string;
  triggerSource: string;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface ExecutionDetail extends ExecutionSummary {
  context: Record<string, unknown>;
  logs: Array<{
    id: string;
    nodeId: string | null;
    eventType: string;
    message: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
}

export interface ExecutionListResponse {
  items: ExecutionSummary[];
}

export interface ConnectDraft {
  sourceNodeId: string;
  handle?: string;
  pointerX?: number;
  pointerY?: number;
}

export const CANVAS_SIZE = {
  width: 1800,
  height: 1200,
};

const defaultNodeTitles: Record<NodeType, string> = {
  start: "Start",
  message: "Message",
  condition: "Condition",
  input: "Input",
  end: "End",
};

export function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function getDefaultNodeLabel(node: FlowNode) {
  return defaultNodeTitles[node.type];
}

export function getNodeSubtitle(node: FlowNode) {
  if (node.type === "message") {
    return node.config.body || "Empty message";
  }
  if (node.type === "condition") {
    return `${node.config.field || "field"} ${node.config.operator}`;
  }
  if (node.type === "input") {
    return node.config.captureKey || "Capture reply";
  }
  return node.id;
}

export function sanitizeFlowDefinition(definition: FlowDefinition | null | undefined): FlowDefinition {
  if (!definition || !Array.isArray(definition.nodes)) {
    return {
      entry: "start",
      nodes: [],
      edges: [],
      settings: { replyTimeoutHours: 24 },
    };
  }

  return {
    entry: definition.entry,
    nodes: definition.nodes.map((node) => ({
      ...node,
      position: {
        x: Number(node.position?.x ?? 0),
        y: Number(node.position?.y ?? 0),
      },
    })) as FlowNode[],
    edges: Array.isArray(definition.edges) ? definition.edges : [],
    settings: definition.settings ?? { replyTimeoutHours: 24 },
  };
}

export function makeNodeId(type: NodeType, existingNodes: FlowNode[]) {
  const next = existingNodes.filter((node) => node.type === type).length + 1;
  return `${type}_${next}`;
}

export function createNode(type: NodeType, position: NodePosition, existingNodes: FlowNode[]): FlowNode {
  const id = makeNodeId(type, existingNodes);
  if (type === "message") {
    return { id, type, position, config: { body: "New message" } };
  }
  if (type === "condition") {
    return { id, type, position, config: { field: "inputs.choice", operator: "equals", value: "yes" } };
  }
  if (type === "input") {
    return { id, type, position, config: { captureKey: "reply", allowEmpty: false } };
  }
  return { id, type, position, config: {} };
}

export function removeNode(definition: FlowDefinition, nodeId: string): FlowDefinition {
  return {
    ...definition,
    nodes: definition.nodes.filter((node) => node.id !== nodeId),
    edges: definition.edges.filter((edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId),
    entry: definition.entry === nodeId ? definition.nodes.find((node) => node.id !== nodeId)?.id ?? definition.entry : definition.entry,
  };
}

export function updateNode(definition: FlowDefinition, nextNode: FlowNode): FlowDefinition {
  return {
    ...definition,
    nodes: definition.nodes.map((node) => (node.id === nextNode.id ? nextNode : node)),
  };
}

export function upsertEdge(definition: FlowDefinition, edge: FlowEdge): FlowDefinition {
  const nextEdges = definition.edges.filter((item) => !(item.sourceNodeId === edge.sourceNodeId && (item.handle ?? "") === (edge.handle ?? "")));
  nextEdges.push(edge);
  return {
    ...definition,
    edges: nextEdges,
  };
}

export function getNodeErrors(validationErrors: ValidationError[], nodeId: string) {
  return validationErrors.filter((error) => error.nodeId === nodeId);
}

export function getEdgeErrors(validationErrors: ValidationError[], edge: FlowEdge) {
  return validationErrors.filter(
    (error) =>
      (edge.id && error.edgeId === edge.id) ||
      (error.message.includes(edge.sourceNodeId) && error.message.includes(edge.targetNodeId)),
  );
}

export function getNodeById(definition: FlowDefinition, nodeId: string | null) {
  return definition.nodes.find((node) => node.id === nodeId) ?? null;
}

export function getOutgoingHandles(node: FlowNode): Array<{ label: string; handle?: string }> {
  if (node.type === "condition") {
    return [
      { label: "True branch", handle: "true" },
      { label: "False branch", handle: "false" },
    ];
  }
  if (node.type === "input") {
    return [
      { label: "Success path", handle: "success" },
      { label: "Fallback path", handle: "fallback" },
    ];
  }
  if (node.type === "end") {
    return [];
  }
  return [{ label: "Next node" }];
}

export function getViewportDropPosition(
  scrollLeft: number,
  scrollTop: number,
  clientWidth: number,
  clientHeight: number,
  anchor?: NodePosition | null,
): NodePosition {
  if (anchor) {
    return {
      x: anchor.x + 260,
      y: anchor.y + 40,
    };
  }

  return {
    x: scrollLeft + clientWidth / 2 - 100,
    y: scrollTop + clientHeight / 2 - 40,
  };
}

export function getEdgeLabel(edge: FlowEdge) {
  return edge.handle ?? null;
}
