"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CANVAS_SIZE,
  createNode,
  getDefaultNodeLabel,
  getEdgeErrors,
  getEdgeLabel,
  getNodeById,
  getNodeErrors,
  getNodeSubtitle,
  getOutgoingHandles,
  getViewportDropPosition,
  prettyJson,
  removeNode,
  sanitizeFlowDefinition,
  updateNode,
  upsertEdge,
  type BranchHandle,
  type ChatbotFlow,
  type ConnectDraft,
  type ExecutionDetail,
  type ExecutionListResponse,
  type ExecutionStatus,
  type ExecutionSummary,
  type FlowDefinition,
  type FlowEdge,
  type FlowListResponse,
  type FlowNode,
  type FlowStatus,
  type NodeType,
  type ValidationError,
} from "@/features/chatbot-flows/builder";
import { ApiError, apiRequest } from "@/lib/api";

const statusTone: Record<FlowStatus, "default" | "outline" | "secondary" | "destructive"> = {
  draft: "secondary",
  published: "default",
  archived: "outline",
};

const executionTone: Record<ExecutionStatus, "default" | "outline" | "secondary" | "destructive"> = {
  running: "default",
  paused: "secondary",
  completed: "outline",
  failed: "destructive",
  canceled: "outline",
};

const nodeTone: Record<NodeType, string> = {
  start: "border-emerald-400/60 bg-emerald-500/10",
  message: "border-sky-400/60 bg-sky-500/10",
  condition: "border-amber-400/60 bg-amber-500/10",
  input: "border-fuchsia-400/60 bg-fuchsia-500/10",
  end: "border-slate-400/60 bg-slate-500/10",
};

const nodeHandleTone: Record<NodeType, string> = {
  start: "bg-emerald-500",
  message: "bg-sky-500",
  condition: "bg-amber-500",
  input: "bg-fuchsia-500",
  end: "bg-slate-500",
};

const nodeWidth = 208;
const nodeHeight = 96;

type WorkingState = "create" | "save" | "publish" | "version" | "delete" | "test-run" | null;

interface DragState {
  nodeId: string;
  pointerId: number;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
}

interface PanState {
  pointerId: number;
  originX: number;
  originY: number;
  startScrollLeft: number;
  startScrollTop: number;
}

function getEdgeAnchor(node: FlowNode, side: "left" | "right") {
  return {
    x: node.position.x + (side === "right" ? nodeWidth : 0),
    y: node.position.y + nodeHeight / 2,
  };
}

function buildEdgePath(source: FlowNode, target: FlowNode) {
  const from = getEdgeAnchor(source, "right");
  const to = getEdgeAnchor(target, "left");
  const delta = Math.max(72, Math.abs(to.x - from.x) / 2);
  return `M ${from.x} ${from.y} C ${from.x + delta} ${from.y}, ${to.x - delta} ${to.y}, ${to.x} ${to.y}`;
}

function findNearestConnectTarget(definition: FlowDefinition, sourceNodeId: string, pointerX: number, pointerY: number) {
  let closest: FlowNode | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const node of definition.nodes) {
    if (node.id === sourceNodeId) {
      continue;
    }

    const anchor = getEdgeAnchor(node, "left");
    const distance = Math.hypot(anchor.x - pointerX, anchor.y - pointerY);
    if (distance < closestDistance) {
      closest = node;
      closestDistance = distance;
    }
  }

  return closestDistance <= 88 ? closest : null;
}

function EdgeLayer({
  definition,
  validationErrors,
  connectDraft,
}: {
  definition: FlowDefinition;
  validationErrors: ValidationError[];
  connectDraft: ConnectDraft | null;
}) {
  const previewSource = connectDraft ? getNodeById(definition, connectDraft.sourceNodeId) : null;

  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full">
      {definition.edges.map((edge, index) => {
        const source = getNodeById(definition, edge.sourceNodeId);
        const target = getNodeById(definition, edge.targetNodeId);
        if (!source || !target) {
          return null;
        }

        const edgeErrors = getEdgeErrors(validationErrors, edge);
        const label = getEdgeLabel(edge);
        const midX = (source.position.x + target.position.x + nodeWidth) / 2;
        const midY = (source.position.y + target.position.y + nodeHeight) / 2;

        return (
          <g key={`${edge.sourceNodeId}-${edge.targetNodeId}-${edge.handle ?? index}`}>
            <path
              d={buildEdgePath(source, target)}
              fill="none"
              stroke={edgeErrors.length > 0 ? "rgb(220 38 38)" : "rgb(148 163 184)"}
              strokeWidth={edgeErrors.length > 0 ? 3 : 2}
              strokeDasharray={edge.handle ? "0" : "4 4"}
            />
            {label ? (
              <>
                <rect x={midX - 28} y={midY - 12} width={56} height={24} rx={999} fill="rgb(15 23 42)" opacity={0.95} />
                <text x={midX} y={midY + 4} textAnchor="middle" fontSize="11" fill="rgb(226 232 240)">
                  {label}
                </text>
              </>
            ) : null}
          </g>
        );
      })}
      {previewSource && connectDraft?.pointerX !== undefined && connectDraft.pointerY !== undefined ? (
        <path
          d={`M ${getEdgeAnchor(previewSource, "right").x} ${getEdgeAnchor(previewSource, "right").y} C ${
            getEdgeAnchor(previewSource, "right").x + 72
          } ${getEdgeAnchor(previewSource, "right").y}, ${connectDraft.pointerX - 72} ${connectDraft.pointerY}, ${connectDraft.pointerX} ${connectDraft.pointerY}`}
          fill="none"
          stroke="rgb(251 191 36)"
          strokeWidth={2}
          strokeDasharray="6 6"
        />
      ) : null}
    </svg>
  );
}

function CanvasNodeCard({
  node,
  selected,
  validationErrors,
  connectDraft,
  onPointerDown,
  onSelect,
  onHandlePointerDown,
}: {
  node: FlowNode;
  selected: boolean;
  validationErrors: ValidationError[];
  connectDraft: ConnectDraft | null;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, node: FlowNode) => void;
  onSelect: (nodeId: string) => void;
  onHandlePointerDown: (event: ReactPointerEvent<HTMLButtonElement>, node: FlowNode, handle?: BranchHandle) => void;
}) {
  const nodeErrors = getNodeErrors(validationErrors, node.id);
  const isConnectTarget = connectDraft !== null && connectDraft.sourceNodeId !== node.id;
  const outgoingHandles = getOutgoingHandles(node);

  return (
    <div className="absolute" style={{ transform: `translate(${node.position.x}px, ${node.position.y}px)` }}>
      <button
        type="button"
        onPointerDown={(event) => onPointerDown(event, node)}
        onClick={() => onSelect(node.id)}
        className={`relative flex h-24 w-52 flex-col justify-between rounded-2xl border p-3 text-left shadow-sm transition-all ${
          nodeTone[node.type]
        } ${selected ? "ring-4 ring-primary/35" : "hover:border-primary/60"} ${isConnectTarget ? "ring-2 ring-amber-400/40" : ""}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{node.type}</div>
            <div className="mt-1 font-medium">{getDefaultNodeLabel(node)}</div>
          </div>
          <div className={`mt-1 size-3 rounded-full ${nodeHandleTone[node.type]}`} />
        </div>
        <div className="space-y-1">
          <div className="line-clamp-1 text-xs text-muted-foreground">{node.id}</div>
          <div className="line-clamp-2 text-xs text-muted-foreground">{getNodeSubtitle(node)}</div>
        </div>
        {nodeErrors.length > 0 ? <div className="mt-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] text-destructive">{nodeErrors.length} issue{nodeErrors.length === 1 ? "" : "s"}</div> : null}
      </button>

      {outgoingHandles.length > 0 ? (
        <div className="pointer-events-auto absolute -right-3 top-1/2 flex -translate-y-1/2 flex-col gap-2">
          {outgoingHandles.map((option) => {
            const active = connectDraft?.sourceNodeId === node.id && (connectDraft.handle ?? "") === (option.handle ?? "");
            return (
              <button
                key={option.label}
                type="button"
                title={option.label}
                onPointerDown={(event) => onHandlePointerDown(event, node, option.handle as BranchHandle | undefined)}
                className={`size-6 rounded-full border-2 border-background shadow ${active ? "bg-amber-400" : nodeHandleTone[node.type]}`}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function InspectorPanel({
  flow,
  draftDefinition,
  selectedNode,
  validationErrors,
  connectDraft,
  testContactHandle,
  testContactName,
  working,
  onFlowNameChange,
  onFlowStatusChange,
  onNodeUpdate,
  onNodeDelete,
  onConnectStart,
  onCancelConnect,
  onAddNode,
  onSave,
  onPublish,
  onCreateVersion,
  onDeleteFlow,
  onDuplicateFlow,
  onTestHandleChange,
  onTestNameChange,
  onTestRun,
}: {
  flow: ChatbotFlow;
  draftDefinition: FlowDefinition;
  selectedNode: FlowNode | null;
  validationErrors: ValidationError[];
  connectDraft: ConnectDraft | null;
  testContactHandle: string;
  testContactName: string;
  working: WorkingState;
  onFlowNameChange: (value: string) => void;
  onFlowStatusChange: (value: FlowStatus) => void;
  onNodeUpdate: (node: FlowNode) => void;
  onNodeDelete: (nodeId: string) => void;
  onConnectStart: (sourceNodeId: string, handle?: BranchHandle) => void;
  onCancelConnect: () => void;
  onAddNode: (type: NodeType) => void;
  onSave: () => void;
  onPublish: () => void;
  onCreateVersion: () => void;
  onDeleteFlow: () => void;
  onDuplicateFlow: () => void;
  onTestHandleChange: (value: string) => void;
  onTestNameChange: (value: string) => void;
  onTestRun: () => void;
}) {
  const selectedNodeErrors = selectedNode ? getNodeErrors(validationErrors, selectedNode.id) : [];
  const outgoingOptions = selectedNode ? getOutgoingHandles(selectedNode) : [];
  const canDeleteNode = selectedNode ? !(selectedNode.type === "start" && draftDefinition.nodes.filter((node) => node.type === "start").length === 1) : false;

  return (
    <div className="grid gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Flow metadata</CardTitle>
          <CardDescription>Manage flow identity, publish status, and draft lifecycle.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="editor-name">Flow name</FieldLabel>
            <Input id="editor-name" value={flow.name} onChange={(event) => onFlowNameChange(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="editor-status">Flow status</FieldLabel>
            <select id="editor-status" value={flow.status} onChange={(event) => onFlowStatusChange(event.target.value as FlowStatus)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Draft v{flow.draftVersion?.versionNumber ?? "?"}</Badge>
            {flow.publishedVersion ? <Badge variant="default">Published v{flow.publishedVersion.versionNumber}</Badge> : <Badge variant="secondary">Not published</Badge>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" onClick={onSave} disabled={working === "save"}>{working === "save" ? "Saving..." : "Save draft"}</Button>
            <Button type="button" variant="secondary" onClick={onPublish} disabled={working === "publish"}>{working === "publish" ? "Publishing..." : "Publish flow"}</Button>
            <Button type="button" variant="outline" onClick={onCreateVersion} disabled={working === "version"}>{working === "version" ? "Creating..." : "New draft version"}</Button>
            <Button type="button" variant="outline" onClick={onDuplicateFlow} disabled={working === "create"}>Duplicate flow</Button>
            <Button type="button" variant="destructive" onClick={onDeleteFlow} disabled={working === "delete"}>{working === "delete" ? "Deleting..." : "Delete flow"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Add nodes</CardTitle>
          <CardDescription>Insert new nodes near the selected node or the center of the visible canvas.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          {(["message", "condition", "input", "end"] as NodeType[]).map((type) => (
            <Button key={type} type="button" variant="outline" onClick={() => onAddNode(type)}>
              Add {type}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Node inspector</CardTitle>
          <CardDescription>{selectedNode ? `Editing ${selectedNode.id}` : "Select a node on the canvas to edit it."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {selectedNode ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline">{selectedNode.type}</Badge>
                {canDeleteNode ? <Button type="button" variant="ghost" onClick={() => onNodeDelete(selectedNode.id)}>Delete node</Button> : <div className="text-xs text-muted-foreground">Start node is required</div>}
              </div>

              {selectedNode.type === "message" ? (
                <Field>
                  <FieldLabel htmlFor="message-body">Message body</FieldLabel>
                  <Textarea id="message-body" value={selectedNode.config.body} onChange={(event) => onNodeUpdate({ ...selectedNode, config: { ...selectedNode.config, body: event.target.value } })} className="min-h-28" />
                </Field>
              ) : null}

              {selectedNode.type === "condition" ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="condition-field">Condition field</FieldLabel>
                    <Input id="condition-field" value={selectedNode.config.field} onChange={(event) => onNodeUpdate({ ...selectedNode, config: { ...selectedNode.config, field: event.target.value } })} />
                  </Field>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="condition-operator">Operator</FieldLabel>
                      <select
                        id="condition-operator"
                        value={selectedNode.config.operator}
                        onChange={(event) => onNodeUpdate({ ...selectedNode, config: { ...selectedNode.config, operator: event.target.value as "equals" | "not_equals" | "exists" } })}
                        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                      >
                        <option value="equals">equals</option>
                        <option value="not_equals">not_equals</option>
                        <option value="exists">exists</option>
                      </select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="condition-value">Comparison value</FieldLabel>
                      <Input id="condition-value" value={selectedNode.config.value === undefined || selectedNode.config.value === null ? "" : String(selectedNode.config.value)} onChange={(event) => onNodeUpdate({ ...selectedNode, config: { ...selectedNode.config, value: event.target.value } })} disabled={selectedNode.config.operator === "exists"} />
                    </Field>
                  </FieldGroup>
                </>
              ) : null}

              {selectedNode.type === "input" ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="input-capture-key">Capture key</FieldLabel>
                    <Input id="input-capture-key" value={selectedNode.config.captureKey} onChange={(event) => onNodeUpdate({ ...selectedNode, config: { ...selectedNode.config, captureKey: event.target.value } })} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selectedNode.config.allowEmpty} onChange={(event) => onNodeUpdate({ ...selectedNode, config: { ...selectedNode.config, allowEmpty: event.target.checked } })} />
                    Allow empty replies
                  </label>
                </>
              ) : null}

              {outgoingOptions.length > 0 ? (
                <div className="grid gap-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Connections</div>
                  {outgoingOptions.map((option) => (
                    <Button
                      key={option.label}
                      type="button"
                      variant={connectDraft?.sourceNodeId === selectedNode.id && (connectDraft.handle ?? "") === (option.handle ?? "") ? "secondary" : "outline"}
                      onClick={() => connectDraft?.sourceNodeId === selectedNode.id && (connectDraft.handle ?? "") === (option.handle ?? "") ? onCancelConnect() : onConnectStart(selectedNode.id, option.handle as BranchHandle | undefined)}
                    >
                      {connectDraft?.sourceNodeId === selectedNode.id && (connectDraft.handle ?? "") === (option.handle ?? "") ? `Cancel ${option.label}` : `Connect ${option.label}`}
                    </Button>
                  ))}
                </div>
              ) : null}

              {selectedNodeErrors.length > 0 ? (
                <div className="grid gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3">
                  <div className="text-xs uppercase tracking-wide text-destructive">Validation issues</div>
                  {selectedNodeErrors.map((issue) => (
                    <div key={`${issue.code}-${issue.message}`} className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{issue.code}</span> • {issue.message}
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Select a node to edit its config or create a connection.</div>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Visual validation</CardTitle>
          <CardDescription>Backend validation remains the source of truth after each save.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {validationErrors.length > 0 ? validationErrors.map((issue) => (
            <div key={`${issue.code}-${issue.message}`} className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
              <div className="font-medium">{issue.code}</div>
              <div className="text-muted-foreground">{issue.message}</div>
            </div>
          )) : <div className="text-sm text-muted-foreground">No validation issues on the last saved draft.</div>}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Advanced JSON</CardTitle>
          <CardDescription>Fallback editor only. The visual canvas remains the primary workflow.</CardDescription>
        </CardHeader>
        <CardContent>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Show raw draft definition</summary>
            <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/30 p-3 text-xs text-muted-foreground">{prettyJson(draftDefinition)}</pre>
          </details>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Test run</CardTitle>
          <CardDescription>Run the current published flow against a WhatsApp test contact.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="test-contact-handle">Contact handle</FieldLabel>
            <Input id="test-contact-handle" value={testContactHandle} onChange={(event) => onTestHandleChange(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="test-contact-name">Contact name</FieldLabel>
            <Input id="test-contact-name" value={testContactName} onChange={(event) => onTestNameChange(event.target.value)} />
          </Field>
          <Button type="button" variant="secondary" onClick={onTestRun} disabled={working === "test-run"}>{working === "test-run" ? "Running..." : "Run WhatsApp test"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ExecutionPanel({
  executions,
  executionDetail,
  selectedExecutionId,
  onSelectExecution,
}: {
  executions: ExecutionSummary[];
  executionDetail: ExecutionDetail | null;
  selectedExecutionId: string | null;
  onSelectExecution: (executionId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent executions</CardTitle>
        <CardDescription>Inspect runtime status and node-level activity after test runs or inbound replies.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-2">
          {executions.map((execution) => (
            <button key={execution.id} type="button" onClick={() => onSelectExecution(execution.id)} className={`grid gap-1 rounded-lg border px-3 py-3 text-left ${selectedExecutionId === execution.id ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/20"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={executionTone[execution.status]}>{execution.status}</Badge>
                <span className="text-sm font-medium">{execution.currentNodeId}</span>
              </div>
              <div className="text-xs text-muted-foreground">{execution.triggerSource} • {new Date(execution.updatedAt).toLocaleString()}</div>
            </button>
          ))}
          {executions.length === 0 ? <div className="text-sm text-muted-foreground">No executions yet for this flow.</div> : null}
        </div>

        <div className="grid gap-3 rounded-2xl border bg-background p-3">
          {executionDetail ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={executionTone[executionDetail.status]}>{executionDetail.status}</Badge>
                <span className="text-sm font-medium">{executionDetail.currentNodeId}</span>
              </div>
              <pre className="overflow-auto whitespace-pre-wrap rounded-xl bg-muted/30 p-3 text-xs text-muted-foreground">{prettyJson(executionDetail.context)}</pre>
              <div className="grid gap-2">
                {executionDetail.logs.map((log) => (
                  <div key={log.id} className="rounded-lg border px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{log.eventType}</div>
                    <div className="text-sm">{log.message}</div>
                    <div className="text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</div>
                  </div>
                ))}
                {executionDetail.logs.length === 0 ? <div className="text-sm text-muted-foreground">No execution logs recorded.</div> : null}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Select an execution to inspect its context and log history.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ChatbotFlowsPage() {
  const [flows, setFlows] = useState<ChatbotFlow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [executionDetail, setExecutionDetail] = useState<ExecutionDetail | null>(null);
  const [createName, setCreateName] = useState("");
  const [testContactHandle, setTestContactHandle] = useState("+919999999999");
  const [testContactName, setTestContactName] = useState("Flow Test Contact");
  const [definition, setDefinition] = useState<FlowDefinition | null>(null);
  const [flowName, setFlowName] = useState("");
  const [flowStatus, setFlowStatus] = useState<FlowStatus>("draft");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [connectDraft, setConnectDraft] = useState<ConnectDraft | null>(null);
  const [zoom, setZoom] = useState(1);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [working, setWorking] = useState<WorkingState>(null);
  const [error, setError] = useState<string | null>(null);

  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const panStateRef = useRef<PanState | null>(null);

  const selectedFlow = useMemo(() => flows.find((flow) => flow.id === selectedFlowId) ?? null, [flows, selectedFlowId]);
  const selectedNode = useMemo(() => (definition ? getNodeById(definition, selectedNodeId) : null), [definition, selectedNodeId]);
  const validationErrors = selectedFlow?.draftVersion?.validationErrors ?? [];
  const zoomPercent = Math.round(zoom * 100);

  const screenToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasViewportRef.current) {
        return { x: 0, y: 0 };
      }
      const rect = canvasViewportRef.current.getBoundingClientRect();
      return {
        x: (canvasViewportRef.current.scrollLeft + clientX - rect.left) / zoom,
        y: (canvasViewportRef.current.scrollTop + clientY - rect.top) / zoom,
      };
    },
    [zoom],
  );

  const loadFlows = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const data = await apiRequest<FlowListResponse>("/chatbot-flows/list");
      setFlows(data.items);
      startTransition(() => {
        setSelectedFlowId((current) => current ?? data.items[0]?.id ?? null);
      });
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load chatbot flows");
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadExecutionDetail = useCallback(async (executionId: string) => {
    try {
      const detail = await apiRequest<ExecutionDetail>(`/chatbot-flows/executions/${executionId}`);
      setExecutionDetail(detail);
      setSelectedExecutionId(executionId);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load execution detail");
    }
  }, []);

  const loadFlowDetail = useCallback(async (flowId: string) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const flow = await apiRequest<ChatbotFlow>(`/chatbot-flows/${flowId}`);
      setFlows((current) => current.map((item) => (item.id === flow.id ? flow : item)));
      setFlowName(flow.name);
      setFlowStatus(flow.status);
      const nextDefinition = sanitizeFlowDefinition(flow.draftVersion?.definition);
      setDefinition(nextDefinition);
      setSelectedNodeId((current) => (current && nextDefinition.nodes.some((node) => node.id === current) ? current : nextDefinition.nodes[0]?.id ?? null));
      setConnectDraft(null);
      panStateRef.current = null;

      const executionList = await apiRequest<ExecutionListResponse>(`/chatbot-flows/${flowId}/executions`);
      setExecutions(executionList.items);
      const nextExecutionId = executionList.items[0]?.id ?? null;
      setSelectedExecutionId(nextExecutionId);
      if (nextExecutionId) {
        const detail = await apiRequest<ExecutionDetail>(`/chatbot-flows/executions/${nextExecutionId}`);
        setExecutionDetail(detail);
      } else {
        setExecutionDetail(null);
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load chatbot flow detail");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadFlows();
  }, [loadFlows]);

  useEffect(() => {
    if (!selectedFlowId) {
      setDefinition(null);
      setExecutions([]);
      setExecutionDetail(null);
      setSelectedNodeId(null);
      return;
    }
    void loadFlowDetail(selectedFlowId);
  }, [loadFlowDetail, selectedFlowId]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking("create");
    setError(null);
    try {
      const flow = await apiRequest<ChatbotFlow>("/chatbot-flows", {
        method: "POST",
        body: JSON.stringify({ name: createName, entryChannel: "whatsapp" }),
      });
      setCreateName("");
      await loadFlows();
      startTransition(() => {
        setSelectedFlowId(flow.id);
      });
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to create chatbot flow");
    } finally {
      setWorking(null);
    }
  };

  const handleSave = async () => {
    if (!selectedFlow || !definition) return;
    setWorking("save");
    setError(null);
    try {
      await apiRequest(`/chatbot-flows/${selectedFlow.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: flowName, status: flowStatus, definition }),
      });
      await loadFlowDetail(selectedFlow.id);
      await loadFlows();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to save chatbot flow");
    } finally {
      setWorking(null);
    }
  };

  const handlePublish = async () => {
    if (!selectedFlow) return;
    setWorking("publish");
    setError(null);
    try {
      await apiRequest(`/chatbot-flows/${selectedFlow.id}/publish`, { method: "POST", body: JSON.stringify({}) });
      await loadFlowDetail(selectedFlow.id);
      await loadFlows();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to publish chatbot flow");
    } finally {
      setWorking(null);
    }
  };

  const handleCreateVersion = async () => {
    if (!selectedFlow || !definition) return;
    setWorking("version");
    setError(null);
    try {
      await apiRequest(`/chatbot-flows/${selectedFlow.id}/versions`, { method: "POST", body: JSON.stringify({ definition }) });
      await loadFlowDetail(selectedFlow.id);
      await loadFlows();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to create draft version");
    } finally {
      setWorking(null);
    }
  };

  const handleDeleteFlow = async () => {
    if (!selectedFlow) return;
    setWorking("delete");
    setError(null);
    try {
      await apiRequest(`/chatbot-flows/${selectedFlow.id}`, { method: "DELETE", body: JSON.stringify({}) });
      setSelectedFlowId(null);
      await loadFlows();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to delete chatbot flow");
    } finally {
      setWorking(null);
    }
  };

  const handleDuplicateFlow = async () => {
    if (!selectedFlow || !definition) return;
    const duplicateName = window.prompt("Duplicate flow name", `${flowName} Copy`)?.trim();
    if (!duplicateName) return;
    setWorking("create");
    setError(null);
    try {
      const duplicated = await apiRequest<ChatbotFlow>("/chatbot-flows", {
        method: "POST",
        body: JSON.stringify({ name: duplicateName, entryChannel: "whatsapp" }),
      });
      await apiRequest(`/chatbot-flows/${duplicated.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: duplicateName,
          status: "draft",
          definition: {
            ...definition,
            nodes: definition.nodes.map((node) => ({ ...node, id: `${node.id}_copy` })),
            edges: definition.edges.map((edge) => ({
              ...edge,
              sourceNodeId: `${edge.sourceNodeId}_copy`,
              targetNodeId: `${edge.targetNodeId}_copy`,
            })),
            entry: `${definition.entry}_copy`,
          },
        }),
      });
      await loadFlows();
      startTransition(() => {
        setSelectedFlowId(duplicated.id);
      });
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to duplicate chatbot flow");
    } finally {
      setWorking(null);
    }
  };

  const handleTestRun = async () => {
    if (!selectedFlow) return;
    setWorking("test-run");
    setError(null);
    try {
      await apiRequest(`/chatbot-flows/${selectedFlow.id}/test-run`, {
        method: "POST",
        body: JSON.stringify({
          contactHandle: testContactHandle,
          contactName: testContactName,
          initialContext: { channel: "whatsapp", source: "manual_test" },
        }),
      });
      await loadFlowDetail(selectedFlow.id);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to run chatbot flow test");
    } finally {
      setWorking(null);
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, node: FlowNode) => {
    if (connectDraft) {
      if (connectDraft.sourceNodeId !== node.id && definition) {
        setDefinition(
          upsertEdge(definition, {
            sourceNodeId: connectDraft.sourceNodeId,
            targetNodeId: node.id,
            handle: connectDraft.handle,
          }),
        );
        setConnectDraft(null);
        setSelectedNodeId(node.id);
      }
      return;
    }

    dragStateRef.current = {
      nodeId: node.id,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: node.position.x,
      startY: node.position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedNodeId(node.id);
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (connectDraft || dragStateRef.current || !canvasViewportRef.current) {
      return;
    }
    if ((event.target as HTMLElement).closest("button")) {
      return;
    }

    panStateRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startScrollLeft: canvasViewportRef.current.scrollLeft,
      startScrollTop: canvasViewportRef.current.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleHandlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, node: FlowNode, handle?: BranchHandle) => {
    event.preventDefault();
    event.stopPropagation();
    const pointer = screenToCanvas(event.clientX, event.clientY);
    setConnectDraft({
      sourceNodeId: node.id,
      handle,
      pointerX: pointer.x,
      pointerY: pointer.y,
    });
    setSelectedNodeId(node.id);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (connectDraft) {
      const pointer = screenToCanvas(event.clientX, event.clientY);
      setConnectDraft((current) => (current ? { ...current, pointerX: pointer.x, pointerY: pointer.y } : current));
      return;
    }
    if (panStateRef.current && canvasViewportRef.current) {
      const pan = panStateRef.current;
      canvasViewportRef.current.scrollLeft = Math.max(0, pan.startScrollLeft - (event.clientX - pan.originX));
      canvasViewportRef.current.scrollTop = Math.max(0, pan.startScrollTop - (event.clientY - pan.originY));
      return;
    }
    if (!definition || !dragStateRef.current) return;
    const drag = dragStateRef.current;
    const nextX = Math.max(24, drag.startX + (event.clientX - drag.originX) / zoom);
    const nextY = Math.max(24, drag.startY + (event.clientY - drag.originY) / zoom);
    const node = getNodeById(definition, drag.nodeId);
    if (!node) return;
    setDefinition(updateNode(definition, { ...node, position: { x: nextX, y: nextY } }));
  };

  const handlePointerUp = () => {
    if (connectDraft && definition && connectDraft.pointerX !== undefined && connectDraft.pointerY !== undefined) {
      const nearestTarget = findNearestConnectTarget(definition, connectDraft.sourceNodeId, connectDraft.pointerX, connectDraft.pointerY);
      if (nearestTarget) {
        setDefinition(
          upsertEdge(definition, {
            sourceNodeId: connectDraft.sourceNodeId,
            targetNodeId: nearestTarget.id,
            handle: connectDraft.handle,
          }),
        );
        setSelectedNodeId(nearestTarget.id);
      }
    }
    if (connectDraft) {
      setConnectDraft(null);
    }
    dragStateRef.current = null;
    panStateRef.current = null;
  };

  const handleNodeUpdate = (node: FlowNode) => {
    if (!definition) return;
    setDefinition(updateNode(definition, node));
  };

  const handleNodeDelete = (nodeId: string) => {
    if (!definition) return;
    const node = getNodeById(definition, nodeId);
    if (!node) return;
    if (node.type === "start" && definition.nodes.filter((item) => item.type === "start").length === 1) return;
    const nextDefinition = removeNode(definition, nodeId);
    setDefinition(nextDefinition);
    setSelectedNodeId(nextDefinition.nodes[0]?.id ?? null);
    setConnectDraft(null);
  };

  const handleAddNode = (type: NodeType) => {
    if (!definition || !canvasViewportRef.current) return;
    const anchor = selectedNode?.position ?? null;
    const nextPosition = getViewportDropPosition(
      canvasViewportRef.current.scrollLeft / zoom,
      canvasViewportRef.current.scrollTop / zoom,
      canvasViewportRef.current.clientWidth / zoom,
      canvasViewportRef.current.clientHeight / zoom,
      anchor,
    );
    const node = createNode(type, nextPosition, definition.nodes);
    setDefinition({ ...definition, nodes: [...definition.nodes, node] });
    setSelectedNodeId(node.id);
  };

  return (
    <>
      <div className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Chatbot flow request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 2xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          <Card>
            <CardHeader>
              <CardTitle>Create chatbot flow</CardTitle>
              <CardDescription>Start a new flow, then switch into the canvas for visual editing.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <form className="grid gap-4" onSubmit={handleCreate}>
                <Field>
                  <FieldLabel htmlFor="flow-name">Flow name</FieldLabel>
                  <Input id="flow-name" value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="Lead qualification starter" required />
                </Field>
                <Button type="submit" disabled={working === "create"} className="w-fit">{working === "create" ? "Creating..." : "Create flow"}</Button>
              </form>

              <div className="grid gap-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Flow list</div>
                {loadingList ? <div className="text-sm text-muted-foreground">Loading flows...</div> : null}
                {!loadingList ? (
                  <div className="grid gap-3">
                    {flows.map((flow) => (
                      <button key={flow.id} type="button" onClick={() => setSelectedFlowId(flow.id)} className={`grid gap-2 rounded-2xl border p-4 text-left transition-colors ${selectedFlowId === flow.id ? "border-primary bg-primary/5" : "bg-muted/10 hover:bg-muted/20"}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{flow.name}</span>
                          <Badge variant={statusTone[flow.status]}>{flow.status}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">Draft v{flow.draftVersion?.versionNumber ?? "?"}{flow.publishedVersion ? ` • Published v${flow.publishedVersion.versionNumber}` : " • Not published"}</div>
                        <div className="text-xs text-muted-foreground">Updated {new Date(flow.updatedAt).toLocaleString()}</div>
                      </button>
                    ))}
                    {flows.length === 0 ? <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">No chatbot flows created yet.</div> : null}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <CardTitle>Visual canvas</CardTitle>
                    <CardDescription>{connectDraft ? `Connect ${connectDraft.sourceNodeId}${connectDraft.handle ? ` via ${connectDraft.handle}` : ""} by releasing near a target node or clicking one directly.` : "Drag nodes, pan from the background, and keep the definition visual-first."}</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setZoom((current) => Math.max(0.6, Number((current - 0.1).toFixed(2))))}
                      disabled={zoom <= 0.6}
                    >
                      Zoom out
                    </Button>
                    <Badge variant="outline">{zoomPercent}%</Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setZoom(1)}
                      disabled={zoom === 1}
                    >
                      Reset
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setZoom((current) => Math.min(1.8, Number((current + 0.1).toFixed(2))))}
                      disabled={zoom >= 1.8}
                    >
                      Zoom in
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!selectedFlow || !definition ? (
                  <div className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">Select a chatbot flow to open the builder.</div>
                ) : (
                  <div ref={canvasViewportRef} className="relative overflow-auto rounded-2xl border bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:24px_24px] cursor-grab active:cursor-grabbing" style={{ height: 720 }} onPointerDown={handleCanvasPointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
                    <div
                      className="relative"
                      style={{ width: CANVAS_SIZE.width * zoom, height: CANVAS_SIZE.height * zoom }}
                    >
                      <div
                        className="relative origin-top-left"
                        style={{
                          width: CANVAS_SIZE.width,
                          height: CANVAS_SIZE.height,
                          transform: `scale(${zoom})`,
                        }}
                      >
                      <EdgeLayer definition={definition} validationErrors={validationErrors} connectDraft={connectDraft} />
                      {definition.nodes.map((node) => (
                        <CanvasNodeCard
                          key={node.id}
                          node={node}
                          selected={selectedNodeId === node.id}
                          validationErrors={validationErrors}
                          connectDraft={connectDraft}
                          onPointerDown={handlePointerDown}
                          onSelect={setSelectedNodeId}
                          onHandlePointerDown={handleHandlePointerDown}
                        />
                      ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <ExecutionPanel executions={executions} executionDetail={executionDetail} selectedExecutionId={selectedExecutionId} onSelectExecution={(executionId) => void loadExecutionDetail(executionId)} />
          </div>

          {selectedFlow && definition ? (
            <InspectorPanel
              flow={{ ...selectedFlow, name: flowName, status: flowStatus }}
              draftDefinition={definition}
              selectedNode={selectedNode}
              validationErrors={validationErrors}
              connectDraft={connectDraft}
              testContactHandle={testContactHandle}
              testContactName={testContactName}
              working={working}
              onFlowNameChange={setFlowName}
              onFlowStatusChange={setFlowStatus}
              onNodeUpdate={handleNodeUpdate}
              onNodeDelete={handleNodeDelete}
              onConnectStart={(sourceNodeId, handle) => setConnectDraft({ sourceNodeId, handle })}
              onCancelConnect={() => setConnectDraft(null)}
              onAddNode={handleAddNode}
              onSave={handleSave}
              onPublish={handlePublish}
              onCreateVersion={handleCreateVersion}
              onDeleteFlow={handleDeleteFlow}
              onDuplicateFlow={handleDuplicateFlow}
              onTestHandleChange={setTestContactHandle}
              onTestNameChange={setTestContactName}
              onTestRun={handleTestRun}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Inspector</CardTitle>
                <CardDescription>Select a flow to edit metadata, inspect nodes, and run tests.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

