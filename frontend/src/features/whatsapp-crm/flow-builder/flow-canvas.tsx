"use client";

import { useCallback, useRef, useState } from "react";

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
      className="relative flex-1 overflow-hidden bg-slate-50 cursor-crosshair"
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
      {/* Zoom indicator */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-slate-600 shadow-sm border border-border/60">
        <button type="button" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))} className="px-1 hover:text-slate-900">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className="px-1 hover:text-slate-900">+</button>
        <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="ml-1 px-1 text-emerald-600 hover:text-emerald-800">Reset</button>
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
