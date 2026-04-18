"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, CalendarDays, CircleDot, PencilLine, Plus, Target, UserRound, Wallet } from "lucide-react";
import { toast } from "sonner";

import { CrmDetailItem } from "@/components/crm/crm-detail-primitives";
import { CrmModalShell } from "@/components/crm/crm-list-primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { getInitials } from "@/lib/auth-ui";
import { cn } from "@/lib/utils";

type DealStatus = "open" | "won" | "lost";

type DealHistoryResponse = {
  deal: {
    id: string;
    title: string;
    pipeline: string;
    stage: string;
    status: DealStatus;
    value: number;
    dealType: string | null;
    priority: string | null;
    referralSource: string | null;
    ownerLabel: string | null;
    productTags: string[];
    expectedCloseDate: string | null;
    lostReason: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  };
  timeline: Array<{ id: string; type: string; payload: Record<string, unknown>; createdAt: string }>;
  tasks: Array<{ id: string; title: string; status: string; priority: string | null; dueAt: string | null; createdAt: string }>;
  creator: { id: string; fullName: string | null; email: string } | null;
  customer: { id: string; fullName: string; email: string | null; phone: string | null } | null;
  lead: { id: string; title: string; fullName: string | null; email: string | null; phone: string | null; status: string } | null;
  summary: { openTasks: number; completedTasks: number; timelineEvents: number };
};

type PipelineSettings = {
  defaultDealPipeline: string;
  dealPipelines: Array<{ key: string; label: string; stages: Array<{ key: string; label: string }> }>;
};

type DealFormState = {
  title: string;
  pipeline: string;
  stage: string;
  status: DealStatus;
  value: string;
  dealType: string;
  priority: string;
  referralSource: string;
  ownerLabel: string;
  productTags: string;
  expectedCloseDate: string;
  lostReason: string;
  notes: string;
};

type TaskFormState = {
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done" | "overdue";
  priority: "low" | "medium" | "high";
  dueAt: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not Available";
  return new Date(value).toLocaleString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not Available";
  return new Date(value).toLocaleDateString();
}

function dealToForm(deal: DealHistoryResponse["deal"]): DealFormState {
  return {
    title: deal.title,
    pipeline: deal.pipeline,
    stage: deal.stage,
    status: deal.status,
    value: String(deal.value),
    dealType: deal.dealType ?? "",
    priority: deal.priority ?? "",
    referralSource: deal.referralSource ?? "",
    ownerLabel: deal.ownerLabel ?? "",
    productTags: deal.productTags.join(", "),
    expectedCloseDate: deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toISOString().slice(0, 10) : "",
    lostReason: deal.lostReason ?? "",
    notes: deal.notes ?? "",
  };
}

function parseTags(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function fallback(value: string | null | undefined) {
  return value?.trim() ? value : "Not Available";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
}

function getStatusTone(status: DealStatus) {
  if (status === "won") return "default";
  if (status === "lost") return "destructive";
  return "outline";
}

function OverlayModal({
  title,
  description,
  onClose,
  children,
  maxWidth = "max-w-3xl",
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <CrmModalShell open title={title} description={description} onClose={onClose} maxWidthClassName={maxWidth}>
      {children}
    </CrmModalShell>
  );
}

function InfoGrid({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.6rem] border border-white/75 bg-white/90 shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
        <div className="flex items-center gap-2 text-slate-900">
          <CircleDot className="size-3 text-sky-500" fill="currentColor" />
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        {actionLabel ? (
          <button type="button" onClick={onAction} className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 transition-colors hover:text-sky-800">
            <PencilLine className="size-4" />
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

const DetailItem = CrmDetailItem;

export default function DealProfilePage() {
  const params = useParams<{ dealId: string }>();
  const dealId = params?.dealId;

  const [data, setData] = useState<DealHistoryResponse | null>(null);
  const [pipelines, setPipelines] = useState<PipelineSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<DealFormState | null>(null);
  const [note, setNote] = useState("");
  const [taskForm, setTaskForm] = useState<TaskFormState>({
    title: "",
    description: "",
    status: "todo",
    priority: "medium",
    dueAt: "",
  });

  const activePipeline = useMemo(
    () => pipelines?.dealPipelines.find((item) => item.key === form?.pipeline) ?? null,
    [form?.pipeline, pipelines],
  );

  const loadProfile = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    setError(null);
    try {
      const [history, pipelineSettings] = await Promise.all([
        apiRequest<DealHistoryResponse>(`/deals/${dealId}/history`, { skipCache: true }),
        apiRequest<PipelineSettings>("/settings/pipelines"),
      ]);
      setData(history);
      setForm(dealToForm(history.deal));
      setPipelines(pipelineSettings);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load deal profile.");
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSave = async () => {
    if (!dealId || !form || !form.title.trim()) {
      toast.error("Deal name is required.");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest(`/deals/${dealId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title.trim(),
          pipeline: form.pipeline,
          stage: form.stage,
          status: form.status,
          value: Number(form.value) || 0,
          dealType: form.dealType.trim() || undefined,
          priority: form.priority.trim() || undefined,
          referralSource: form.referralSource.trim() || undefined,
          ownerLabel: form.ownerLabel.trim() || undefined,
          productTags: parseTags(form.productTags),
          expectedCloseDate: form.expectedCloseDate ? new Date(`${form.expectedCloseDate}T00:00:00.000Z`).toISOString() : null,
          lostReason: form.lostReason.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });
      toast.success("Deal updated.");
      setEditOpen(false);
      await loadProfile();
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to update deal.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddNote = async () => {
    if (!dealId || !note.trim()) {
      toast.error("Note is required.");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest(`/deals/${dealId}/timeline`, {
        method: "POST",
        body: JSON.stringify({ type: "note", message: note.trim() }),
      });
      toast.success("Timeline note added.");
      setNote("");
      setNoteOpen(false);
      await loadProfile();
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to add note.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddTask = async () => {
    if (!dealId || !taskForm.title.trim()) {
      toast.error("Task title is required.");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || undefined,
          status: taskForm.status,
          priority: taskForm.priority,
          dueAt: taskForm.dueAt ? new Date(`${taskForm.dueAt}T00:00:00.000Z`).toISOString() : undefined,
          dealId,
        }),
      });
      toast.success("Task added.");
      setTaskForm({ title: "", description: "", status: "todo", priority: "medium", dueAt: "" });
      setTaskOpen(false);
      await loadProfile();
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to add task.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="rounded-[1.6rem] border border-dashed border-border/70 bg-white/70 px-5 py-4 text-sm text-muted-foreground">Loading deal profile...</div>;
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Deal profile error</AlertTitle>
        <AlertDescription>{error ?? "Deal profile was not found."}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        <aside className="grid gap-4 self-start">
          <section className="overflow-hidden rounded-[1.7rem] border border-white/75 bg-white/92 shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
            <div className="border-b border-slate-200/80 px-5 py-4">
              <Link href="/dashboard/deals" className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 transition-colors hover:text-sky-800">
                <ArrowLeft className="size-4" />
                Back To Deals
              </Link>
            </div>
            <div className="grid justify-items-center gap-4 px-6 py-6 text-center">
              <Avatar className="size-32 border border-sky-200/70 bg-sky-50 text-sky-700">
                <AvatarFallback className="text-4xl font-semibold">{getInitials(data.deal.title)}</AvatarFallback>
              </Avatar>
              <div className="grid gap-1">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{data.deal.title}</h1>
                <div className="text-sm text-slate-500">{fallback(data.deal.ownerLabel)}</div>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <Badge variant={getStatusTone(data.deal.status)} className="capitalize">{data.deal.status}</Badge>
                  <Badge variant="secondary">{data.deal.pipeline}</Badge>
                  <Badge variant="outline">{data.deal.stage}</Badge>
                </div>
              </div>
              <div className="grid gap-2 text-sm">
                <div className="text-slate-900">{formatCurrency(data.deal.value)}</div>
                <div className="text-slate-500">{formatDate(data.deal.expectedCloseDate)}</div>
              </div>
            </div>

            <div className="border-t border-slate-200/80 px-5 py-5">
              <div className="text-sm font-semibold text-slate-900">Quick Actions</div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Button type="button" variant="outline" className="h-auto flex-col gap-2 py-3" onClick={() => setTaskOpen(true)}>
                  <Plus className="size-4" />
                  <span className="text-xs">Task</span>
                </Button>
                <Button type="button" variant="outline" className="h-auto flex-col gap-2 py-3" onClick={() => setNoteOpen(true)}>
                  <Plus className="size-4" />
                  <span className="text-xs">Note</span>
                </Button>
                <Button type="button" className="h-auto flex-col gap-2 py-3" onClick={() => setEditOpen(true)}>
                  <PencilLine className="size-4" />
                  <span className="text-xs">Edit</span>
                </Button>
              </div>
            </div>
          </section>
        </aside>

        <main className="grid gap-4">
          <section className="rounded-[1.7rem] border border-white/75 bg-white/92 p-2 sm:p-3 shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
            <Tabs defaultValue="overview" className="grid gap-4">
              <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-2xl p-1">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="links">Links</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="grid gap-4">
                <InfoGrid title="Recent Activities">
                  <div className="grid gap-3">
                    {data.timeline.length ? data.timeline.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium capitalize text-slate-900">{item.type.replaceAll("_", " ")}</div>
                          <div className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</div>
                        </div>
                        <div className="mt-2 text-sm text-slate-600">{String(item.payload?.message ?? item.payload?.title ?? JSON.stringify(item.payload))}</div>
                      </div>
                    )) : <div className="text-sm text-slate-500">No timeline activity yet.</div>}
                  </div>
                </InfoGrid>

                <InfoGrid title="Basic Information" actionLabel="Edit" onAction={() => setEditOpen(true)}>
                  <div className="grid gap-8 md:grid-cols-3">
                    <DetailItem label="Deal Name" value={data.deal.title} />
                    <DetailItem label="Pipeline" value={data.deal.pipeline} />
                    <DetailItem label="Stage" value={data.deal.stage} />
                    <DetailItem label="Status" value={<span className="capitalize">{data.deal.status}</span>} />
                    <DetailItem label="Deal Amount" value={formatCurrency(data.deal.value)} />
                    <DetailItem label="Expected Close Date" value={formatDate(data.deal.expectedCloseDate)} subtle={!data.deal.expectedCloseDate} />
                    <DetailItem label="Deal Type" value={fallback(data.deal.dealType)} subtle={!data.deal.dealType} />
                    <DetailItem label="Priority" value={fallback(data.deal.priority)} subtle={!data.deal.priority} />
                    <DetailItem label="Referral Source" value={fallback(data.deal.referralSource)} subtle={!data.deal.referralSource} />
                    <DetailItem label="Owner Label" value={fallback(data.deal.ownerLabel)} subtle={!data.deal.ownerLabel} />
                    <DetailItem label="Lost Reason" value={fallback(data.deal.lostReason)} subtle={!data.deal.lostReason} />
                    <DetailItem label="Product Tags" value={data.deal.productTags.length ? data.deal.productTags.join(", ") : "No tags added"} subtle={!data.deal.productTags.length} />
                  </div>
                </InfoGrid>

                <InfoGrid title="Deal Notes" actionLabel="Edit" onAction={() => setEditOpen(true)}>
                  <div className="whitespace-pre-wrap break-words text-sm text-slate-600">{data.deal.notes?.trim() || "No notes available."}</div>
                </InfoGrid>
              </TabsContent>

              <TabsContent value="activity" className="grid gap-4">
                <InfoGrid title="Timeline">
                  <div className="grid gap-3">
                    {data.timeline.length ? data.timeline.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium capitalize text-slate-900">{item.type.replaceAll("_", " ")}</div>
                          <div className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</div>
                        </div>
                        <div className="mt-2 text-sm text-slate-600">{String(item.payload?.message ?? item.payload?.title ?? JSON.stringify(item.payload))}</div>
                      </div>
                    )) : <div className="text-sm text-slate-500">No timeline activity yet.</div>}
                  </div>
                </InfoGrid>
              </TabsContent>

              <TabsContent value="tasks" className="grid gap-4">
                <InfoGrid title="Associated Tasks" actionLabel="Add" onAction={() => setTaskOpen(true)}>
                  {data.tasks.length ? (
                    <div className="grid gap-3">
                      {data.tasks.map((task) => (
                        <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="font-medium text-slate-900">{task.title}</div>
                          <div className="mt-1 text-sm text-slate-500">{task.status.replaceAll("_", " ")} • {task.priority ?? "medium"} • {formatDate(task.dueAt)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">No tasks linked to this deal yet.</div>
                  )}
                </InfoGrid>
              </TabsContent>

              <TabsContent value="links" className="grid gap-4">
                <InfoGrid title="Associated Contact">
                  {data.customer ? (
                    <Link href={`/dashboard/contacts/${data.customer.id}`} className="grid gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 hover:border-sky-200">
                      <div className="font-medium text-slate-900">{data.customer.fullName}</div>
                      <div className="text-sm text-slate-500">{data.customer.email ?? data.customer.phone ?? "No contact details"}</div>
                    </Link>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">No contact linked.</div>
                  )}
                </InfoGrid>

                <InfoGrid title="Associated Lead">
                  {data.lead ? (
                    <Link href={`/dashboard/leads/${data.lead.id}`} className="grid gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 hover:border-sky-200">
                      <div className="font-medium text-slate-900">{data.lead.title}</div>
                      <div className="text-sm text-slate-500">{data.lead.fullName ?? data.lead.email ?? data.lead.status}</div>
                    </Link>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">No lead linked.</div>
                  )}
                </InfoGrid>
              </TabsContent>
            </Tabs>
          </section>
        </main>

        <aside className="grid gap-4 self-start">
          <section className="overflow-hidden rounded-[1.7rem] border border-white/75 bg-white/92 shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
            <div className="border-b border-slate-200/80 px-5 py-5">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Data Highlights</h2>
              <div className="mt-4 grid gap-4">
                <DetailItem label="Created On" value={formatDateTime(data.deal.createdAt)} />
                <DetailItem label="Created By" value={data.creator?.fullName ?? "Not Available"} subtle={!data.creator?.fullName} />
                <DetailItem label="Updated On" value={formatDateTime(data.deal.updatedAt)} />
                <DetailItem label="Updated By" value={data.creator?.fullName ?? "Not Available"} subtle={!data.creator?.fullName} />
              </div>
            </div>

            <div className="border-b border-slate-200/80 px-5 py-5">
              <h3 className="text-xl font-semibold text-slate-950">Summary</h3>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Open Tasks</div>
                  <div className="mt-2 text-xl font-semibold text-slate-950">{data.summary.openTasks}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Completed Tasks</div>
                  <div className="mt-2 text-xl font-semibold text-slate-950">{data.summary.completedTasks}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Timeline Events</div>
                  <div className="mt-2 text-xl font-semibold text-slate-950">{data.summary.timelineEvents}</div>
                </div>
              </div>
            </div>

            <div className="px-5 py-5">
              <h3 className="text-xl font-semibold text-slate-950">Quick Snapshot</h3>
              <div className="mt-4 grid gap-3">
                <div className="inline-flex items-center gap-2 text-sm text-slate-600"><Wallet className="size-4 text-slate-400" /> {formatCurrency(data.deal.value)}</div>
                <div className="inline-flex items-center gap-2 text-sm text-slate-600"><CalendarDays className="size-4 text-slate-400" /> {formatDate(data.deal.expectedCloseDate)}</div>
                <div className="inline-flex items-center gap-2 text-sm text-slate-600"><Target className="size-4 text-slate-400" /> {fallback(data.deal.priority)}</div>
                <div className="inline-flex items-center gap-2 text-sm text-slate-600"><UserRound className="size-4 text-slate-400" /> {fallback(data.deal.ownerLabel)}</div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {editOpen && form ? (
        <OverlayModal title="Edit Deal" description="Update any deal field for this profile." onClose={() => setEditOpen(false)} maxWidth="max-w-4xl">
            <div className="grid gap-4">
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field><FieldLabel>Deal Name</FieldLabel><Input value={form.title} onChange={(event) => setForm((current) => current ? { ...current, title: event.target.value } : current)} /></Field>
                <Field>
                  <FieldLabel>Pipeline</FieldLabel>
                  <NativeSelect value={form.pipeline} onChange={(event) => {
                    const nextPipeline = event.target.value;
                    const next = pipelines?.dealPipelines.find((item) => item.key === nextPipeline);
                    setForm((current) => current ? { ...current, pipeline: nextPipeline, stage: next?.stages[0]?.key ?? current.stage } : current);
                  }} className="h-10 rounded-xl px-3 text-sm">
                    {(pipelines?.dealPipelines ?? []).map((pipeline) => <option key={pipeline.key} value={pipeline.key}>{pipeline.label}</option>)}
                  </NativeSelect>
                </Field>
                <Field><FieldLabel>Amount</FieldLabel><Input type="number" min={0} value={form.value} onChange={(event) => setForm((current) => current ? { ...current, value: event.target.value } : current)} /></Field>
                <Field>
                  <FieldLabel>Stage</FieldLabel>
                  <NativeSelect value={form.stage} onChange={(event) => setForm((current) => current ? { ...current, stage: event.target.value } : current)} className="h-10 rounded-xl px-3 text-sm">
                    {(activePipeline?.stages ?? []).map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <NativeSelect value={form.status} onChange={(event) => setForm((current) => current ? { ...current, status: event.target.value as DealStatus } : current)} className="h-10 rounded-xl px-3 text-sm">
                    <option value="open">Open</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </NativeSelect>
                </Field>
                <Field><FieldLabel>Expected Close Date</FieldLabel><Input type="date" value={form.expectedCloseDate} onChange={(event) => setForm((current) => current ? { ...current, expectedCloseDate: event.target.value } : current)} /></Field>
                <Field><FieldLabel>Deal Type</FieldLabel><Input value={form.dealType} onChange={(event) => setForm((current) => current ? { ...current, dealType: event.target.value } : current)} /></Field>
                <Field><FieldLabel>Priority</FieldLabel><Input value={form.priority} onChange={(event) => setForm((current) => current ? { ...current, priority: event.target.value } : current)} /></Field>
                <Field><FieldLabel>Referral Source</FieldLabel><Input value={form.referralSource} onChange={(event) => setForm((current) => current ? { ...current, referralSource: event.target.value } : current)} /></Field>
                <Field><FieldLabel>Owner Label</FieldLabel><Input value={form.ownerLabel} onChange={(event) => setForm((current) => current ? { ...current, ownerLabel: event.target.value } : current)} /></Field>
                <Field className="md:col-span-2"><FieldLabel>Product Tags</FieldLabel><Input value={form.productTags} onChange={(event) => setForm((current) => current ? { ...current, productTags: event.target.value } : current)} /></Field>
                <Field className="md:col-span-2"><FieldLabel>Lost Reason</FieldLabel><Input value={form.lostReason} onChange={(event) => setForm((current) => current ? { ...current, lostReason: event.target.value } : current)} /></Field>
              </FieldGroup>
              <Field><FieldLabel>Notes</FieldLabel><Textarea value={form.notes} onChange={(event) => setForm((current) => current ? { ...current, notes: event.target.value } : current)} className="min-h-28 text-sm" /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="destructive" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="button" onClick={() => void handleSave()} disabled={submitting}>{submitting ? "Saving..." : "Save changes"}</Button>
            </div>
          </div>
        </OverlayModal>
      ) : null}

      {noteOpen ? (
        <OverlayModal title="Add Timeline Note" description="Record a new timeline note for this deal." onClose={() => setNoteOpen(false)} maxWidth="max-w-xl">
          <div className="grid gap-4">
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-28 text-sm" placeholder="Add note" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="destructive" onClick={() => setNoteOpen(false)}>Cancel</Button>
              <Button type="button" onClick={() => void handleAddNote()} disabled={submitting}>{submitting ? "Saving..." : "Add note"}</Button>
            </div>
          </div>
        </OverlayModal>
      ) : null}

      {taskOpen ? (
        <OverlayModal title="Add Task" description="Create a task linked to this deal." onClose={() => setTaskOpen(false)} maxWidth="max-w-2xl">
          <div className="grid gap-4">
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field><FieldLabel>Task title</FieldLabel><Input value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} /></Field>
              <Field><FieldLabel>Due date</FieldLabel><Input type="date" value={taskForm.dueAt} onChange={(event) => setTaskForm((current) => ({ ...current, dueAt: event.target.value }))} /></Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <NativeSelect value={taskForm.status} onChange={(event) => setTaskForm((current) => ({ ...current, status: event.target.value as TaskFormState["status"] }))} className="h-10 rounded-xl px-3 text-sm">
                  <option value="todo">Todo</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                  <option value="overdue">Overdue</option>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Priority</FieldLabel>
                <NativeSelect value={taskForm.priority} onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value as TaskFormState["priority"] }))} className="h-10 rounded-xl px-3 text-sm">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </NativeSelect>
              </Field>
            </FieldGroup>
            <Field><FieldLabel>Description</FieldLabel><Textarea value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} className="min-h-24 text-sm" /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="destructive" onClick={() => setTaskOpen(false)}>Cancel</Button>
              <Button type="button" onClick={() => void handleAddTask()} disabled={submitting}>{submitting ? "Saving..." : "Add task"}</Button>
            </div>
          </div>
        </OverlayModal>
      ) : null}
    </>
  );
}
