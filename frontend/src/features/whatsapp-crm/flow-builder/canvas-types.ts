export interface CanvasNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export interface CanvasEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  handle?: string;
}

export interface FlowDefinition {
  entry: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  settings: { replyTimeoutHours?: number };
}

export interface FlowRecord {
  id: string;
  name: string;
  status: "draft" | "published" | "archived";
  entryChannel: string;
  publishedVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlowVersion {
  id: string;
  flowId: string;
  versionNumber: number;
  state: "draft" | "published";
  definition: FlowDefinition;
  validationErrors: Array<{ code: string; message: string; nodeId?: string }>;
  createdAt: string;
}

export const NODE_CATALOG: Array<{
  type: string;
  label: string;
  category: "trigger" | "action" | "logic" | "ai" | "control";
  color: string;
  icon: string;
  defaultConfig: Record<string, unknown>;
}> = [
  { type: "start", label: "Start", category: "control", color: "#10b981", icon: "▶", defaultConfig: {} },
  { type: "keyword_trigger", label: "Keyword Trigger", category: "trigger", color: "#f59e0b", icon: "🔑", defaultConfig: { keywords: ["hello"], matchType: "contains" } },
  { type: "message", label: "Send Message", category: "action", color: "#3b82f6", icon: "💬", defaultConfig: { body: "Hello!" } },
  { type: "send_template", label: "Send Template", category: "action", color: "#8b5cf6", icon: "📋", defaultConfig: { templateName: "hello_world", language: "en", components: [] } },
  { type: "condition", label: "Condition", category: "logic", color: "#f97316", icon: "⑂", defaultConfig: { field: "inputs.reply", operator: "equals", value: "" } },
  { type: "input", label: "Wait for Reply", category: "logic", color: "#ea580c", icon: "⏳", defaultConfig: { captureKey: "reply", allowEmpty: false } },
  { type: "delay", label: "Delay", category: "logic", color: "#64748b", icon: "⏱", defaultConfig: { delaySeconds: 60 } },
  { type: "ai_reply", label: "AI Reply", category: "ai", color: "#a855f7", icon: "🤖", defaultConfig: { systemPrompt: "You are a helpful assistant.", model: "gpt-4o-mini", maxTokens: 500, temperature: 0.7 } },
  { type: "webhook", label: "Webhook", category: "action", color: "#06b6d4", icon: "🌐", defaultConfig: { url: "https://example.com/webhook", method: "POST", headers: {}, bodyTemplate: "" } },
  { type: "crm_update", label: "CRM Update", category: "action", color: "#e11d48", icon: "⚡", defaultConfig: { entityType: "lead", action: "update", fields: {} } },
  { type: "assign_agent", label: "Assign Agent", category: "action", color: "#6366f1", icon: "👤", defaultConfig: { strategy: "round_robin" } },
  { type: "assign_tag", label: "Assign Tag", category: "action", color: "#14b8a6", icon: "🏷", defaultConfig: { tagName: "" } },
  { type: "create_task", label: "Create Task", category: "action", color: "#0ea5e9", icon: "📝", defaultConfig: { title: "Follow up", dueInHours: 24, priority: "medium" } },
  { type: "human_handoff", label: "Human Handoff", category: "action", color: "#dc2626", icon: "🙋", defaultConfig: { strategy: "queue", message: "" } },
  { type: "end", label: "End", category: "control", color: "#475569", icon: "⏹", defaultConfig: {} },
];

export const RUNTIME_SUPPORTED_NODE_TYPES = new Set(NODE_CATALOG.map((node) => node.type));

export const BUILDER_PALETTE_NODES = NODE_CATALOG;

export function getNodeMeta(type: string) {
  return NODE_CATALOG.find((n) => n.type === type) ?? NODE_CATALOG[0]!;
}
