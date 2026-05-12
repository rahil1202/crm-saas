"use client";

import type { CanvasEdge, CanvasNode } from "./canvas-types";

interface FlowEdgesProps {
  edges: CanvasEdge[];
  nodes: CanvasNode[];
  connectingFrom: string | null;
  mousePos: { x: number; y: number } | null;
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

function getNodeCenter(node: CanvasNode, anchor: "bottom" | "top") {
  return {
    x: node.position.x + NODE_WIDTH / 2,
    y: anchor === "bottom" ? node.position.y + NODE_HEIGHT : node.position.y,
  };
}

function buildCurvePath(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dy = to.y - from.y;
  const cp = Math.max(40, Math.abs(dy) * 0.5);
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + cp}, ${to.x} ${to.y - cp}, ${to.x} ${to.y}`;
}

export function FlowEdges({ edges, nodes, connectingFrom, mousePos }: FlowEdgesProps) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  return (
    <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" style={{ zIndex: 0 }}>
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
        </marker>
      </defs>

      {edges.map((edge) => {
        const source = nodeMap.get(edge.sourceNodeId);
        const target = nodeMap.get(edge.targetNodeId);
        if (!source || !target) return null;
        const from = getNodeCenter(source, "bottom");
        const to = getNodeCenter(target, "top");
        return (
          <path
            key={edge.id}
            d={buildCurvePath(from, to)}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={2}
            markerEnd="url(#arrowhead)"
          />
        );
      })}

      {/* Live connection line while dragging */}
      {connectingFrom && mousePos ? (() => {
        const source = nodeMap.get(connectingFrom);
        if (!source) return null;
        const from = getNodeCenter(source, "bottom");
        return (
          <path
            d={buildCurvePath(from, mousePos)}
            fill="none"
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="6 4"
            opacity={0.7}
          />
        );
      })() : null}
    </svg>
  );
}
