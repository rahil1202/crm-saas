"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutTemplate, Plus, Save, Trash2, Upload, Zap } from "lucide-react";
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
import { BUILDER_PALETTE_NODES, getNodeMeta } from "@/features/whatsapp-crm/flow-builder/canvas-types";
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
type FlowDetail = FlowRecord & {
  draftVersion: FlowVersion;
};

interface WhatsappFlowBuilderPageProps {
  initialFlowId?: string;
}

export function WhatsappFlowBuilderPage({ initialFlowId }: WhatsappFlowBuilderPageProps) {
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
  const [kwDraft, setKwDraft] = useState({ keyword: "", matchType: "contains", actionType: "reply", replyBody: "", flowId: "" });
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
      const payload = await apiRequest<FlowDetail>(`/chatbot-flows/${flowId}`, { skipCache: true });
      setActiveFlowId(payload.id);
      setFlowName(payload.name);
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
      const flowToOpen = initialFlowId && items.some((item) => item.id === initialFlowId) ? initialFlowId : items[0]?.id;
      if (flowToOpen && !activeFlowId) {
        void loadFlow(flowToOpen);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFlowId]);

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
      const payload = await apiRequest<FlowDetail>("/chatbot-flows", {
        method: "POST",
        body: JSON.stringify({ name: "New WhatsApp Flow", entryChannel: "whatsapp" }),
      });
      await loadAll();
      await loadFlow(payload.id);
      toast.success("New flow created.");
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to create flow.");
    }
  };

  // Keyword CRUD
  const createKeyword = async () => {
    const keyword = kwDraft.keyword.trim();
    if (!keyword) { toast.error("Trigger phrase is required."); return; }
    if (keyword.includes(",")) { toast.error("Create one trigger phrase at a time. Commas are treated as separate keywords."); return; }
    if (kwDraft.actionType === "reply" && !kwDraft.replyBody.trim()) { toast.error("Reply message is required for auto replies."); return; }
    if (kwDraft.actionType === "assign_flow" && !kwDraft.flowId && !activeFlowId) { toast.error("Select a flow to start."); return; }
    setKwSaving(true);
    try {
      await apiRequest("/whatsapp/keyword-triggers", {
        method: "POST",
        body: JSON.stringify({
          keyword,
          matchType: kwDraft.matchType,
          actionType: kwDraft.actionType,
          replyBody: kwDraft.replyBody.trim() || undefined,
          flowId: kwDraft.actionType === "assign_flow" ? (kwDraft.flowId || activeFlowId || undefined) : undefined,
        }),
      });
      setKwDraft({ keyword: "", matchType: "contains", actionType: "reply", replyBody: "", flowId: "" });
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
    <div className="flex h-[calc(100vh-168px)] min-h-[680px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm">
      {error ? (
        <Alert variant="destructive" className="m-3">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* Header */}
      <header className="border-b border-border/60 bg-gradient-to-r from-emerald-50/80 to-sky-50/50 px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {/* Flow selector */}
          <NativeSelect
            value={activeFlowId ?? ""}
            onChange={(e) => { if (e.target.value) void loadFlow(e.target.value); }}
            className="h-8 w-full min-w-44 max-w-64 text-xs sm:w-auto"
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
            className="h-8 w-full min-w-44 max-w-72 text-xs font-semibold sm:w-56"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
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
            <button
              type="button"
              onClick={() => setViewMode("templates")}
              className={cn("rounded-md px-3 py-1 text-xs font-medium transition-colors", viewMode === "templates" ? "bg-emerald-100 text-emerald-800" : "text-slate-600 hover:bg-slate-50")}
            >
              Templates
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
        </div>
      </header>

      {/* Main content */}
      {viewMode === "canvas" ? (
        <div className="flex min-h-0 flex-1">
          {/* Node palette (drag source) */}
          <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-border/60 bg-slate-50/80 p-3 md:block">
            <div className="mb-3">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-500">Drag to canvas</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">Build WhatsApp replies, waits, branches, handoffs, CRM actions, and follow-up tasks. Campaigns should send the first template message, then this flow can continue from a keyword reply.</p>
            </div>
            <div className="grid gap-1.5">
              {BUILDER_PALETTE_NODES.map((meta) => (
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
          ) : (
            <aside className="hidden w-72 shrink-0 border-l border-border/60 bg-white p-4 lg:block">
              <div className="rounded-xl border border-dashed border-border/70 bg-slate-50/70 p-4">
                <div className="text-sm font-semibold text-slate-800">Select a node</div>
                <p className="mt-2 text-xs leading-5 text-slate-500">Click any canvas node to edit its WhatsApp message, trigger, routing, or CRM action settings.</p>
              </div>
            </aside>
          )}
        </div>
      ) : null}

      {/* Keywords view */}
      {viewMode === "keywords" ? (
        <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 sm:p-6">
          <div className="mx-auto grid max-w-6xl gap-6">
            <Card className="border-border/70 bg-card/95">
              <CardHeader>
                <CardTitle className="text-base">
                  <Zap className="mr-1.5 inline size-4" /> Keyword Triggers
                </CardTitle>
                <CardDescription>
                  WhatsApp inbound text is trimmed and matched case-insensitively. The first active trigger by priority runs before automation rules.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
                  <Field>
                    <FieldLabel>Trigger phrase</FieldLabel>
                    <Input value={kwDraft.keyword} onChange={(e) => setKwDraft({ ...kwDraft, keyword: e.target.value })} placeholder="pricing" />
                    <p className="text-xs leading-5 text-muted-foreground">Use one phrase per trigger. Add more rows for synonyms like demo, plans, or support.</p>
                  </Field>
                  <Field>
                    <FieldLabel>Match type</FieldLabel>
                    <NativeSelect value={kwDraft.matchType} onChange={(e) => setKwDraft({ ...kwDraft, matchType: e.target.value })}>
                      <option value="exact">Exact match</option>
                      <option value="contains">Contains</option>
                      <option value="starts_with">Starts with</option>
                      <option value="regex">Regex pattern</option>
                    </NativeSelect>
                    <p className="text-xs leading-5 text-muted-foreground">Contains is best for normal WhatsApp messages. Exact is best for STOP/START/menu.</p>
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
                </div>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                  {kwDraft.actionType === "reply" ? (
                    <Field>
                      <FieldLabel>Reply message</FieldLabel>
                      <Textarea value={kwDraft.replyBody} onChange={(e) => setKwDraft({ ...kwDraft, replyBody: e.target.value })} rows={3} placeholder="Thanks for your interest. Here are our plans..." />
                    </Field>
                  ) : null}
                  {kwDraft.actionType === "assign_flow" ? (
                    <Field>
                      <FieldLabel>Flow to start</FieldLabel>
                      <NativeSelect value={kwDraft.flowId || activeFlowId || ""} onChange={(e) => setKwDraft({ ...kwDraft, flowId: e.target.value })}>
                        {flows.map((flow) => (
                          <option key={flow.id} value={flow.id}>{flow.name}</option>
                        ))}
                      </NativeSelect>
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
                      <div key={kw.id} className="grid gap-3 rounded-xl border border-border/60 bg-white px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="max-w-full truncate rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800">{kw.keyword}</code>
                            <Badge variant="outline" className="text-[0.6rem]">{kw.matchType}</Badge>
                            <Badge variant={kw.isActive ? "secondary" : "outline"} className="text-[0.6rem]">
                              {kw.isActive ? "Active" : "Off"}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {"->"} {kw.actionType}
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
              <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-slate-900"><LayoutTemplate className="size-4" /> Pre-built Flow Templates</h2>
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
