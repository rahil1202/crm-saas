import { describe, expect, test } from "bun:test";

import {
  getDefaultFlowDefinition,
  renderNodeResponse,
  resolveNextNode,
  validateFlowDefinition,
} from "@/lib/chatbot-flow-engine";
import type { ChatbotFlowDefinition } from "@/modules/chatbot-flows/schema";

function buildInputFlow(): ChatbotFlowDefinition {
  return {
    entry: "start",
    nodes: [
      { id: "start", type: "start", position: { x: 0, y: 0 }, config: {} },
      { id: "ask_name", type: "input", position: { x: 100, y: 0 }, config: { captureKey: "name", allowEmpty: false } },
      { id: "valid_name", type: "message", position: { x: 200, y: -80 }, config: { body: "Hi {{inputs.name}}" } },
      { id: "fallback", type: "message", position: { x: 200, y: 80 }, config: { body: "Please send a valid name." } },
      { id: "end", type: "end", position: { x: 300, y: 0 }, config: {} },
    ],
    edges: [
      { sourceNodeId: "start", targetNodeId: "ask_name" },
      { sourceNodeId: "ask_name", targetNodeId: "valid_name", handle: "success" },
      { sourceNodeId: "ask_name", targetNodeId: "fallback", handle: "fallback" },
      { sourceNodeId: "valid_name", targetNodeId: "end" },
      { sourceNodeId: "fallback", targetNodeId: "end" },
    ],
    settings: { replyTimeoutHours: 24 },
  };
}

describe("chatbot flow validation", () => {
  test("default flow passes validation", () => {
    const result = validateFlowDefinition(getDefaultFlowDefinition());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("rejects missing false branch on condition node", () => {
    const definition: ChatbotFlowDefinition = {
      entry: "start",
      nodes: [
        { id: "start", type: "start", position: { x: 0, y: 0 }, config: {} },
        { id: "check", type: "condition", position: { x: 120, y: 0 }, config: { field: "channel", operator: "equals", value: "whatsapp" } },
        { id: "end", type: "end", position: { x: 240, y: 0 }, config: {} },
      ],
      edges: [
        { sourceNodeId: "start", targetNodeId: "check" },
        { sourceNodeId: "check", targetNodeId: "end", handle: "true" },
      ],
      settings: {},
    };

    const result = validateFlowDefinition(definition);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === "invalid_condition_branch")).toBe(true);
  });
});

describe("chatbot flow branching", () => {
  test("condition node resolves true and false handles", () => {
    const definition: ChatbotFlowDefinition = {
      entry: "start",
      nodes: [
        { id: "start", type: "start", position: { x: 0, y: 0 }, config: {} },
        { id: "check", type: "condition", position: { x: 100, y: 0 }, config: { field: "channel", operator: "equals", value: "whatsapp" } },
        { id: "true_path", type: "message", position: { x: 200, y: -50 }, config: { body: "true" } },
        { id: "false_path", type: "message", position: { x: 200, y: 50 }, config: { body: "false" } },
        { id: "end", type: "end", position: { x: 300, y: 0 }, config: {} },
      ],
      edges: [
        { sourceNodeId: "start", targetNodeId: "check" },
        { sourceNodeId: "check", targetNodeId: "true_path", handle: "true" },
        { sourceNodeId: "check", targetNodeId: "false_path", handle: "false" },
        { sourceNodeId: "true_path", targetNodeId: "end" },
        { sourceNodeId: "false_path", targetNodeId: "end" },
      ],
      settings: {},
    };

    const conditionNode = definition.nodes[1];
    const passed = resolveNextNode({ definition, node: conditionNode, context: { channel: "whatsapp" } });
    const failed = resolveNextNode({ definition, node: conditionNode, context: { channel: "email" } });

    expect(passed.nextNode?.id).toBe("true_path");
    expect(failed.nextNode?.id).toBe("false_path");
  });

  test("input node pauses until a reply is provided", () => {
    const definition = buildInputFlow();
    const node = definition.nodes[1];

    const paused = resolveNextNode({ definition, node, context: {} });
    const resumed = resolveNextNode({ definition, node, context: {}, inboundMessageBody: "Ava" });

    expect(paused.pause).toBe(true);
    expect(paused.nextNode).toBeNull();
    expect(resumed.pause).toBe(false);
    expect(resumed.nextNode?.id).toBe("valid_name");
    expect((resumed.context.inputs as Record<string, unknown>).name).toBe("Ava");
  });

  test("input node uses fallback when empty replies are not allowed", () => {
    const definition = buildInputFlow();
    const node = definition.nodes[1];

    const resumed = resolveNextNode({ definition, node, context: {}, inboundMessageBody: "   " });
    expect(resumed.nextNode?.id).toBe("fallback");
  });
});

describe("chatbot flow rendering", () => {
  test("renders tokens from execution context", () => {
    expect(renderNodeResponse("Hello {{inputs.name}}", { inputs: { name: "Mia" } })).toBe("Hello Mia");
  });
});
