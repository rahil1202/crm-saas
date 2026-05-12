"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, Upload, Zap } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FlowCanvas } from "@/features/whatsapp-crm/flow-builder/flow-canvas";
import { NodeEditor } from "@/features/whatsapp-crm/flow-builder/node-editor";
import { NODE_CATALOG, getNodeMeta } from "@/features/whatsapp-crm/flow-builder/canvas-types";
import { FLOW_TEMPLATES, KEYWORD_PRESETS } from "@/features/whatsapp-crm/flow-builder/prebuilt-templates";
import type { CanvasEdge, CanvasNode, FlowDefinition, FlowRecord, FlowVersion } from "@/features/whatsapp-crm/flow-builder/canvas-types";

interface KeywordTrigger {
  id: string;
  keyword: string;
  matchType: string;
  actionType: string;
  replyBody: string | null;
  flowId: string | null;
  isActive: boolean;
}

type ViewMode = "canvas" | "keywords" | "templates";

export function WhatsappFlowBuilderPage() {
  // Flow state
  const [flows, setFlows] = useState<FlowRecord[]>([]);
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState("New Flow");
  const [dirty, setDirty] = useState(false);

  // Keywords state
  const [keywords, setKeywords] = useState<KeywordTrigger[]>([]);
  const [kwDraft, setKwDraft] = useState({ keyword: "", matchType: "contains", actionType: "reply", replyBody: "" });
  const [kwSaving, setKwSaving] = useState(false);

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>("canvas");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);

  // Load flows + keywords
  const loadAll = useCallback(async () => {
    try {
      const [flowsPayload, keywordsPayload] = await Promise.all([
        apiRequest<{ items: FlowRecord[] }>("/chatbot-flows/list?limit=50", { skipCache: true }),
        apiRequest<{ items: KeywordTrigger[] }>("/whatsapp/keyword-triggers"),
      ]);
      setFlows(flowsPayload.items);
      setKeywords(keywordsPayload.items);
      setError(null);
      return flowsPayload.items;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load flows.");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFlow = async (flowId: string) => {
    try {
      const payload = await apiRequest<{ flow: FlowRecord; draftVersion: FlowVersion }>(`/chatbot-flows/${flowId}`, { skipCache: true });
      setActiveFlowId(flowId);
      setFlowName(payload.flow.name);
      const def = payload.draftVersion.definition;
      setNodes(def.nodes);
      setEdges(def.edges.map((e, i) => ({ ...e, id: e.id ?? `edge-${i}` })));
      setDirty(false);
      setSelectedNodeId(null);
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to load flow.");
    }
  };

  useEffect(() => {
    void loadAll().then((items) => {
      if (items.length > 0 && !activeFlowId) {
        void loadFlow(items[0]!.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Canvas operations
  const handleMoveNode = (nodeId: string, position: { x: number; y: number }) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, position } : n)));
    setDirty(true);
  };

  const handleConnect = (sourceId: string, targetId: string) => {
    // Prevent duplicate edges
    if (edges.some((e) => e.sourceNodeId === sourceId && e.targetNodeId === targetId)) return;
    setEdges((prev) => [...prev, { id: `edge-${Date.now()}`, sourceNodeId: sourceId, targetNodeId: targetId }]);
    setDirty(true);
  };

  const handleDropNewNode = (type: string, position: { x: number; y: number }) => {
    const meta = getNodeMeta(type);
    const newNode: CanvasNode = {
      id: `${type}_${Date.now().toString(36)}`,
      type,
      position,
      config: { ...meta.defaultConfig },
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
    setDirty(true);
  };

  const handleUpdateNodeConfig = (nodeId: string, config: Record<string, unknown>) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, config } : n)));
    setDirty(true);
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
    setDirty(true);
  };

  // Save flow
  const saveFlow = async () => {
    if (!activeFlowId) return;
    setSaving(true);
    try {
      const definition: FlowDefinition = {
        entry: nodes.find((n) => n.type === "start")?.id ?? nodes[0]?.id ?? "start",
        nodes,
        edges,
        settings: { replyTimeoutHours: 24 },
      };
      await apiRequest(`/chatbot-flows/${activeFlowId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: flowName, definition }),
      });
      setDirty(false);
      toast.success("Flow saved.");
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to save flow.");
    } finally {
      setSaving(false);
    }
  };

  // Publish flow
  const publishFlow = async () => {
    if (!activeFlowId) return;
    setPublishing(true);
    try {
      // Save first
      await saveFlow();
      await apiRequest(`/chatbot-flows/${activeFlowId}/publish`, { method: "POST", body: JSON.stringify({}) });
      toast.success("Flow published and live.");
      await loadAll();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to publish. Check validation errors.");
    } finally {
      setPublishing(false);
    }
  };

  // Create new flow
  const createFlow = async () => {
    try {
      const payload = await apiRequest<{ flow: FlowRecord }>("/chatbot-flows", {
        method: "POST",
        body: JSON.stringify({ name: "New WhatsApp Flow", entryChannel: "whatsapp" }),
      });
      await loadFlow(payload.flow.id);
      await loadAll();
      toast.success("New flow created.");
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to create flow.");
    }
  };

  // Keyword CRUD
  const createKeyword = async () => {
    if (!kwDraft.keyword.trim()) { toast.error("Keyword is required."); return; }
    setKwSaving(true);
    try {
      await apiRequest("/whatsapp/keyword-triggers", {
        method: "POST",
        body: JSON.stringify({
          keyword: kwDraft.keyword.trim(),
          matchType: kwDraft.matchType,
          actionType: kwDraft.actionType,
          replyBody: kwDraft.replyBody.trim() || undefined,
          flowId: kwDraft.actionType === "assign_flow" && activeFlowId ? activeFlowId : undefined,
        }),
      });
      setKwDraft({ keyword: "", matchType: "contains", actionType: "reply", replyBody: "" });
      toast.success("Keyword trigger created.");
      const payload = await apiRequest<{ items: KeywordTrigger[] }>("/whatsapp/keyword-triggers", { skipCache: true });
      setKeywords(payload.items);
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to create keyword trigger.");
    } finally {
      setKwSaving(false);
    }
  };

  const deleteKeyword = async (id: string) => {
    try {
      await apiRequest(`/whatsapp/keyword-triggers/${id}`, { method: "DELETE" });
      setKeywords((prev) => prev.filter((k) => k.id !== id));
      toast.success("Deleted.");
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to delete.");
    }
  };

  if (loading) {
    return <div className="flex h-[calc(100vh-168px)] items-center justify-center text-sm text-muted-foreground">Loading flow builder…</div>;
  }

  return (
    <div className="flex h-[calc(100vh-168px)] flex-col overflow-hidden rounded-[1.6rem] border border-border/60 bg-white shadow-sm">
      {error ? (
        <Alert variant="destructive" className="m-3">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* Header */}
      <header className="border-b border-border/60 bg-gradient-to-r from-emerald-50/80 to-sky-50/50 px-5 py-3">
        <div className="flex items-center gap-3">
          {/* Flow selector */}
          <NativeSelect
            value={activeFlowId ?? ""}
            onChange={(e) => { if (e.target.value) void loadFlow(e.target.value); }}
            className="h-8 max-w-[200px] text-xs"
          >
            {flows.map((f) => (
              <option key={f.id} value={f.id}>{f.name} ({f.status})</option>
            ))}
          </NativeSelect>
          <Button variant="outline" size="sm" onClick={() => void createFlow()}>
            <Plus className="mr-1 size-3" /> New
          </Button>
          <Input
            value={flowName}
            onChange={(e) => { setFlowName(e.target.value); setDirty(true); }}
            className="h-8 w-48 text-xs font-semibold"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border/60 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("canvas")}
              className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", viewMode === "canvas" ? "bg-emerald-100 text-emerald-800" : "text-slate-600 hover:bg-slate-50")}
            >
              Canvas
            </button>
            <button
              type="button"
              onClick={() => setViewMode("keywords")}
              className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", viewMode === "keywords" ? "bg-emerald-100 text-emerald-800" : "text-slate-600 hover:bg-slate-50")}
            >
              Keywords
            </button>
          </div>

          {dirty ? <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">Unsaved</Badge> : null}
          <Button variant="outline" size="sm" onClick={() => void saveFlow()} disabled={saving || !dirty}>
            <Save className="mr-1 size-3" /> {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" onClick={() => void publishFlow()} disabled={publishing}>
            <Upload className="mr-1 size-3" /> {publishing ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </header>

      {/* Main content */}
      {viewMode === "canvas" ? (
        <div className="flex flex-1 min-h-0">
          {/* Node palette (drag source) */}
          <aside className="w-56 shrink-0 overflow-y-auto border-r border-border/60 bg-slate-50/80 p-3">
            <div className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-500">Drag to canvas</div>
            <div className="grid gap-1.5">
              {NODE_CATALOG.map((meta) => (
                <div
                  key={meta.type}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/flow-node-type", meta.type);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  className="flex cursor-grab items-center gap-2 rounded-lg border border-border/60 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing"
                >
                  <span
                    className="flex size-6 items-center justify-center rounded-md text-sm"
                    style={{ backgroundColor: `${meta.color}20` }}
                  >
                    {meta.icon}
                  </span>
                  <span>{meta.label}</span>
                  <Badge variant="outline" className="ml-auto text-[0.55rem] px-1 py-0">{meta.category}</Badge>
                </div>
              ))}
            </div>
          </aside>

          {/* Canvas */}
          <FlowCanvas
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onMoveNode={handleMoveNode}
            onConnect={handleConnect}
            onDropNewNode={handleDropNewNode}
          />

          {/* Node editor panel */}
          {selectedNode ? (
            <NodeEditor
              node={selectedNode}
              onUpdate={handleUpdateNodeConfig}
              onDelete={handleDeleteNode}
              onClose={() => setSelectedNodeId(null)}
            />
          ) : null}
        </div>
      ) : null}

      {/* Keywords view */}
      {viewMode === "keywords" ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl grid gap-6">
            <Card className="border-border/70 bg-card/95">
              <CardHeader>
                <CardTitle className="text-base">
                  <Zap className="mr-1.5 inline size-4" /> Keyword Triggers
                </CardTitle>
                <CardDescription>
                  When an inbound message matches a keyword, the system auto-replies or triggers a flow.
                  Keywords are evaluated before automation rules and chatbot flows.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel>Keyword</FieldLabel>
                    <Input value={kwDraft.keyword} onChange={(e) => setKwDraft({ ...kwDraft, keyword: e.target.value })} placeholder="pricing, demo, support" />
                  </Field>
                  <Field>
                    <FieldLabel>Match type</FieldLabel>
                    <NativeSelect value={kwDraft.matchType} onChange={(e) => setKwDraft({ ...kwDraft, matchType: e.target.value })}>
                      <option value="exact">Exact match</option>
                      <option value="contains">Contains</option>
                      <option value="starts_with">Starts with</option>
                      <option value="regex">Regex pattern</option>
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel>Action</FieldLabel>
                    <NativeSelect value={kwDraft.actionType} onChange={(e) => setKwDraft({ ...kwDraft, actionType: e.target.value })}>
                      <option value="reply">Auto reply</option>
                      <option value="assign_flow">Start flow</option>
                      <option value="assign_agent">Assign agent</option>
                      <option value="assign_tag">Assign tag</option>
                      <option value="human_handoff">Human handoff</option>
                      <option value="create_task">Create task</option>
                    </NativeSelect>
                  </Field>
                  {kwDraft.actionType === "reply" ? (
                    <Field>
                      <FieldLabel>Reply message</FieldLabel>
                      <Textarea value={kwDraft.replyBody} onChange={(e) => setKwDraft({ ...kwDraft, replyBody: e.target.value })} rows={2} placeholder="Thanks for your interest! Here are our plans…" />
                    </Field>
                  ) : null}
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => void createKeyword()} disabled={kwSaving}>
                    <Plus className="mr-1 size-3.5" /> {kwSaving ? "Saving…" : "Add keyword trigger"}
                  </Button>
                </div>

                {/* Keyword list */}
                {keywords.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 bg-white/50 p-4 text-center text-sm text-muted-foreground">
                    No keyword triggers yet. Add one above to auto-reply when customers type specific words.
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {keywords.map((kw) => (
                      <div key={kw.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-white px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800">{kw.keyword}</code>
                            <Badge variant="outline" className="text-[0.6rem]">{kw.matchType}</Badge>
                            <Badge variant={kw.isActive ? "secondary" : "outline"} className="text-[0.6rem]">
                              {kw.isActive ? "Active" : "Off"}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            → {kw.actionType}
                            {kw.replyBody ? `: "${kw.replyBody.slice(0, 60)}${kw.replyBody.length > 60 ? "…" : ""}"` : ""}
                            {kw.flowId ? ` (flow: ${kw.flowId.slice(0, 8)}…)` : ""}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon-sm" onClick={() => void deleteKeyword(kw.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {/* Templates view */}
      {viewMode === "templates" ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-6xl grid gap-6">
            {/* Flow templates */}
            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">Pre-built Flow Templates</h2>
              <p className="text-sm text-slate-500 mb-4">Click a template to load it into the canvas. Customize it and publish.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {FLOW_TEMPLATES.map((template) => (
                  <Card key={template.id} className="border-border/70 bg-card/95 hover:shadow-md transition-shadow cursor-pointer group" onClick={() => { setNodes(template.nodes); setEdges(template.edges); setFlowName(template.name); setDirty(true); setViewMode("canvas"); toast.success(`Loaded "${template.name}" template. Customize and save.`); }}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-sm group-hover:text-emerald-700 transition-colors">{template.name}</CardTitle>
                          <CardDescription className="mt-1">{template.description}</CardDescription>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[0.6rem] capitalize">{template.category}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{template.nodes.length} nodes</span>
                        <span className="text-slate-300">|</span>
                        <span>{template.edges.length} connections</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {template.nodes.filter((n) => n.type !== "start" && n.type !== "end").slice(0, 4).map((n) => {
                          const meta = getNodeMeta(n.type);
                          return <span key={n.id} className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.6rem] font-medium text-slate-600">{meta.icon} {meta.label}</span>;
                        })}
                        {template.nodes.length > 6 ? <span className="text-[0.6rem] text-slate-400">+{template.nodes.length - 6} more</span> : null}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Keyword presets */}
            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">Keyword Preset Packs</h2>
              <p className="text-sm text-slate-500 mb-4">Install a keyword pack to instantly set up auto-replies for common scenarios.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {KEYWORD_PRESETS.map((preset) => (
                  <Card key={preset.id} className="border-border/70 bg-card/95 hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-sm">{preset.name}</CardTitle>
                          <CardDescription className="mt-1">{preset.description}</CardDescription>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[0.6rem] capitalize">{preset.category}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-3 text-xs text-muted-foreground">{preset.keywords.length} keywords included</div>
                      <div className="mb-3 flex flex-wrap gap-1">
                        {preset.keywords.slice(0, 5).map((kw) => (
                          <code key={kw.keyword} className="rounded bg-emerald-50 px-1.5 py-0.5 text-[0.6rem] font-medium text-emerald-700">{kw.keyword}</code>
                        ))}
                        {preset.keywords.length > 5 ? <span className="text-[0.6rem] text-slate-400">+{preset.keywords.length - 5} more</span> : null}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={async () => {
                          try {
                            let installed = 0;
                            for (const kw of preset.keywords) {
                              await apiRequest("/whatsapp/keyword-triggers", {
                                method: "POST",
                                body: JSON.stringify(kw),
                              });
                              installed++;
                            }
                            const payload = await apiRequest<{ items: KeywordTrigger[] }>("/whatsapp/keyword-triggers", { skipCache: true });
                            setKeywords(payload.items);
                            toast.success(`Installed ${installed} keyword triggers from "${preset.name}".`);
                          } catch (caught) {
                            toast.error(caught instanceof ApiError ? caught.message : "Some keywords may already exist.");
                          }
                        }}
                      >
                        <Plus className="mr-1.5 size-3.5" /> Install Pack
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
