"use client";

import { cn } from "@/lib/utils";
import type { CanvasNode } from "./canvas-types";
import { getNodeMeta } from "./canvas-types";

interface FlowNodeProps {
  node: CanvasNode;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, nodeId: string) => void;
  onConnectStart: (nodeId: string) => void;
}

export function FlowNode({ node, selected, onPointerDown, onConnectStart }: FlowNodeProps) {
  const meta = getNodeMeta(node.type);
  const bodyPreview = typeof node.config.body === "string" ? node.config.body.slice(0, 40) : null;
  const keywords = Array.isArray(node.config.keywords) ? (node.config.keywords as string[]).join(", ") : null;

  return (
    <div
      className={cn(
        "absolute select-none rounded-xl border-2 bg-white shadow-md transition-shadow",
        selected ? "border-emerald-500 shadow-lg ring-2 ring-emerald-200" : "border-slate-200 hover:shadow-lg",
      )}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: 200,
        minHeight: 64,
        cursor: "grab",
      }}
      onPointerDown={(e) => onPointerDown(e, node.id)}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 rounded-t-[10px] px-3 py-2"
        style={{ backgroundColor: `${meta.color}20` }}
      >
        <span className="text-base leading-none">{meta.icon}</span>
        <span className="text-xs font-bold text-slate-800">{meta.label}</span>
      </div>

      {/* Body preview */}
      <div className="px-3 py-2">
        {bodyPreview ? (
          <p className="text-[0.7rem] text-slate-600 line-clamp-2">{bodyPreview}</p>
        ) : keywords ? (
          <p className="text-[0.7rem] text-slate-600">
            <span className="font-semibold">Keywords:</span> {keywords}
          </p>
        ) : node.type === "delay" ? (
          <p className="text-[0.7rem] text-slate-600">{String(node.config.delaySeconds ?? 60)}s delay</p>
        ) : node.type === "condition" ? (
          <p className="text-[0.7rem] text-slate-600">
            {String(node.config.field ?? "")} {String(node.config.operator ?? "")} {String(node.config.value ?? "")}
          </p>
        ) : node.type === "assign_agent" ? (
          <p className="text-[0.7rem] text-slate-600">Strategy: {String(node.config.strategy ?? "round_robin")}</p>
        ) : node.type === "ai_reply" ? (
          <p className="text-[0.7rem] text-slate-600">Model: {String(node.config.model ?? "gpt-4o-mini")}</p>
        ) : (
          <p className="text-[0.7rem] text-slate-400 italic">{node.type}</p>
        )}
      </div>

      {/* Output connector handle */}
      {node.type !== "end" ? (
        <button
          type="button"
          className="absolute -bottom-2.5 left-1/2 z-10 flex size-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-emerald-400 bg-white transition-colors hover:bg-emerald-400 hover:text-white"
          onPointerDown={(e) => {
            e.stopPropagation();
            onConnectStart(node.id);
          }}
          aria-label="Connect to next node"
        >
          <span className="text-[0.5rem] font-bold leading-none">+</span>
        </button>
      ) : null}

      {/* Input connector handle */}
      {node.type !== "start" && node.type !== "keyword_trigger" ? (
        <div className="absolute -top-2.5 left-1/2 z-10 flex size-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-sky-400 bg-white">
          <span className="size-2 rounded-full bg-sky-400" />
        </div>
      ) : null}
    </div>
  );
}
