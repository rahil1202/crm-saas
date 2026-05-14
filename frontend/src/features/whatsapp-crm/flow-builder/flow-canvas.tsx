"use client";

import { useCallback, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

import type { CanvasEdge, CanvasNode } from "./canvas-types";
import { FlowEdges } from "./flow-edges";
import { FlowNode } from "./flow-node";

interface FlowCanvasProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onMoveNode: (nodeId: string, position: { x: number; y: number }) => void;
  onConnect: (sourceId: string, targetId: string) => void;
  onDropNewNode: (type: string, position: { x: number; y: number }) => void;
}

export function FlowCanvas({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onMoveNode,
  onConnect,
  onDropNewNode,
}: FlowCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState<{ nodeId: string; startX: number; startY: number; nodeStartX: number; nodeStartY: number } | null>(null);
  const [panning, setPanning] = useState<{ startX: number; startY: number; panStartX: number; panStartY: number } | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const screenToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom],
  );

  const handlePointerDown = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    e.preventDefault();
    onSelectNode(nodeId);
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setDragging({
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      nodeStartX: node.position.x,
      nodeStartY: node.position.y,
    });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.target === containerRef.current || (e.target as HTMLElement).dataset.canvas) {
      onSelectNode(null);
      setPanning({ startX: e.clientX, startY: e.clientY, panStartX: pan.x, panStartY: pan.y });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragging) {
      const dx = (e.clientX - dragging.startX) / zoom;
      const dy = (e.clientY - dragging.startY) / zoom;
      onMoveNode(dragging.nodeId, {
        x: Math.round(dragging.nodeStartX + dx),
        y: Math.round(dragging.nodeStartY + dy),
      });
    } else if (panning) {
      setPan({
        x: panning.panStartX + (e.clientX - panning.startX),
        y: panning.panStartY + (e.clientY - panning.startY),
      });
    }

    if (connectingFrom) {
      setMousePos(screenToCanvas(e.clientX, e.clientY));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (connectingFrom) {
      // Check if we're over a node
      const pos = screenToCanvas(e.clientX, e.clientY);
      const target = nodes.find(
        (n) =>
          n.id !== connectingFrom &&
          pos.x >= n.position.x &&
          pos.x <= n.position.x + 200 &&
          pos.y >= n.position.y &&
          pos.y <= n.position.y + 80,
      );
      if (target) {
        onConnect(connectingFrom, target.id);
      }
      setConnectingFrom(null);
      setMousePos(null);
    }
    setDragging(null);
    setPanning(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom((z) => Math.min(2, Math.max(0.3, z + delta)));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/flow-node-type");
    if (!type) return;
    const pos = screenToCanvas(e.clientX, e.clientY);
    onDropNewNode(type, pos);
  };

  return (
    <div
      ref={containerRef}
      className="relative min-w-0 flex-1 cursor-crosshair overflow-hidden bg-slate-50"
      style={{
        backgroundImage:
          "radial-gradient(circle, #e2e8f0 1px, transparent 1px)",
        backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      data-canvas="true"
    >
      <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-xl border border-border/60 bg-white/90 px-3 py-2 text-xs text-slate-600 shadow-sm">
        Drag blank canvas to pan. Use the node plus handle to connect steps.
      </div>

      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="max-w-sm rounded-xl border border-dashed border-border/70 bg-white/85 p-5 text-center shadow-sm">
            <div className="text-sm font-semibold text-slate-800">Start building your WhatsApp flow</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">Drag a trigger or message from the left panel onto the canvas.</p>
          </div>
        </div>
      ) : null}

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 rounded-xl border border-border/60 bg-white/95 p-1 text-xs font-medium text-slate-600 shadow-sm">
        <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} className="flex size-7 items-center justify-center rounded-lg hover:bg-slate-100 hover:text-slate-900">
          <Minus className="size-3.5" />
        </button>
        <span className="w-11 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className="flex size-7 items-center justify-center rounded-lg hover:bg-slate-100 hover:text-slate-900">
          <Plus className="size-3.5" />
        </button>
        <button type="button" aria-label="Reset canvas view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="flex size-7 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800">
          <Maximize2 className="size-3.5" />
        </button>
      </div>

      {/* Canvas transform layer */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
        data-canvas="true"
      >
        <FlowEdges edges={edges} nodes={nodes} connectingFrom={connectingFrom} mousePos={mousePos} />
        {nodes.map((node) => (
          <FlowNode
            key={node.id}
            node={node}
            selected={node.id === selectedNodeId}
            onPointerDown={handlePointerDown}
            onConnectStart={(nodeId) => setConnectingFrom(nodeId)}
          />
        ))}
      </div>
    </div>
  );
}
