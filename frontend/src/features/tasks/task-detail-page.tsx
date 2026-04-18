"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, PencilLine, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CrmConfirmDialog, CrmModalShell } from "@/components/crm/crm-list-primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";

type TaskStatus = "todo" | "in_progress" | "done" | "overdue";
type TaskPriority = "low" | "medium" | "high";
type TaskType = "to_do" | "call" | "meeting" | "follow_up";
type TaskAssociationEntityType = "contact" | "lead" | "deal" | "template" | "campaign";

type TaskAssignee = {
  userId: string;
  fullName: string;
  email: string;
  kind: "employee" | "partner";
  badges: string[];
  partnerCompanyName: string | null;
};

type TaskAssociation = {
  entityType: TaskAssociationEntityType;
  entityId: string;
  entityLabel: string;
  entitySubtitle: string | null;
};

type TaskAssociationOptionResponse = {
  items: TaskAssociation[];
};

type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  taskType: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  reminderMinutesBefore: number;
  isRecurring: boolean;
  recurrenceRule: string | null;
  assignedToUserId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  associations: TaskAssociation[];
  createdAt: string;
  updatedAt: string;
};

type TaskDetailResponse = {
  task: TaskItem;
};

type TaskAssigneeResponse = {
  items: TaskAssignee[];
};

type TaskFormState = {
  title: string;
  description: string;
  taskType: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  dueTime: string;
  reminderMinutesBefore: string;
  isRecurring: boolean;
  recurrenceRule: string;
  assignedToUserId: string;
  associations: TaskAssociation[];
};

const associationEntityOptions: Array<{ value: TaskAssociationEntityType; label: string }> = [
  { value: "contact", label: "Contacts" },
  { value: "lead", label: "Leads" },
  { value: "deal", label: "Deals" },
  { value: "template", label: "Templates" },
  { value: "campaign", label: "Campaigns" },
];

const taskStatuses: TaskStatus[] = ["todo", "in_progress", "done", "overdue"];
const taskPriorities: TaskPriority[] = ["low", "medium", "high"];
const taskTypes: TaskType[] = ["to_do", "call", "meeting", "follow_up"];

function formatTitleCase(value: string) {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getStatusTone(status: TaskStatus) {
  if (status === "done") return "default" as const;
  if (status === "overdue") return "destructive" as const;
  if (status === "in_progress") return "secondary" as const;
  return "outline" as const;
}

function getPriorityTone(priority: TaskPriority) {
  if (priority === "high") return "destructive" as const;
  if (priority === "medium") return "secondary" as const;
  return "outline" as const;
}

function toDueAtIso(dueDate: string, dueTime: string) {
  if (!dueDate) return undefined;
  const effectiveTime = dueTime || "09:00";
  return new Date(`${dueDate}T${effectiveTime}:00`).toISOString();
}

function taskToForm(task: TaskItem): TaskFormState {
  const dueAt = task.dueAt ? new Date(task.dueAt) : null;
  return {
    title: task.title,
    description: task.description ?? "",
    taskType: task.taskType,
    status: task.status,
    priority: task.priority,
    dueDate: dueAt ? dueAt.toISOString().slice(0, 10) : "",
    dueTime: dueAt ? dueAt.toISOString().slice(11, 16) : "09:00",
    reminderMinutesBefore: String(task.reminderMinutesBefore),
    isRecurring: task.isRecurring,
    recurrenceRule: task.recurrenceRule ?? "",
    assignedToUserId: task.assignedToUserId ?? "",
    associations: task.associations ?? [],
  };
}

export default function TaskDetailPage() {
  const params = useParams<{ taskId: string }>();
  const router = useRouter();
  const taskId = params?.taskId;

  const [task, setTask] = useState<TaskItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<TaskFormState | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [assigneeModalOpen, setAssigneeModalOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [associationModalOpen, setAssociationModalOpen] = useState(false);
  const [associationEntityType, setAssociationEntityType] = useState<TaskAssociationEntityType>("contact");
  const [associationSearch, setAssociationSearch] = useState("");
  const [associationLoading, setAssociationLoading] = useState(false);
  const [associationOptions, setAssociationOptions] = useState<TaskAssociation[]>([]);

  const loadTask = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<TaskDetailResponse>(`/tasks/${taskId}`, { skipCache: true });
      setTask(response.task);
      setForm(taskToForm(response.task));
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load task details.");
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const loadAssignees = useCallback(async (query = "") => {
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      const response = await apiRequest<TaskAssigneeResponse>(`/tasks/assignees?${params.toString()}`);
      setAssignees(response.items);
    } catch {
      // keep current list
    }
  }, []);

  const loadAssociationOptions = useCallback(async (entityType: TaskAssociationEntityType, query = "") => {
    setAssociationLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("entityType", entityType);
      if (query.trim()) params.set("q", query.trim());
      const response = await apiRequest<TaskAssociationOptionResponse>(`/tasks/association-options?${params.toString()}`);
      setAssociationOptions(response.items);
    } catch {
      setAssociationOptions([]);
    } finally {
      setAssociationLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTask();
  }, [loadTask]);

  useEffect(() => {
    void loadAssignees();
  }, [loadAssignees]);

  useEffect(() => {
    if (!associationModalOpen) {
      return;
    }
    void loadAssociationOptions(associationEntityType, associationSearch);
  }, [associationEntityType, associationModalOpen, associationSearch, loadAssociationOptions]);

  const activeAssignee = useMemo(() => {
    if (!form) return null;
    return assignees.find((assignee) => assignee.userId === form.assignedToUserId) ?? null;
  }, [assignees, form]);

  const toggleAssociation = (association: TaskAssociation) => {
    setForm((current) => {
      if (!current) return current;
      const exists = current.associations.some(
        (item) => item.entityType === association.entityType && item.entityId === association.entityId,
      );
      if (exists) {
        return {
          ...current,
          associations: current.associations.filter(
            (item) => !(item.entityType === association.entityType && item.entityId === association.entityId),
          ),
        };
      }
      return {
        ...current,
        associations: [...current.associations, association],
      };
    });
  };

  const removeAssociation = (association: TaskAssociation) => {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        associations: current.associations.filter(
          (item) => !(item.entityType === association.entityType && item.entityId === association.entityId),
        ),
      };
    });
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskId || !form || !form.title.trim()) {
      toast.error("Task name is required.");
      return;
    }

    setSaving(true);
    try {
      await apiRequest(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          taskType: form.taskType,
          status: form.status,
          priority: form.priority,
          dueAt: toDueAtIso(form.dueDate, form.dueTime),
          reminderMinutesBefore: Number(form.reminderMinutesBefore) || 0,
          isRecurring: form.isRecurring,
          recurrenceRule: form.isRecurring ? form.recurrenceRule.trim() || undefined : undefined,
          assignedToUserId: form.assignedToUserId || null,
          associations: form.associations.map((association) => ({
            entityType: association.entityType,
            entityId: association.entityId,
          })),
        }),
      });
      toast.success("Task updated.");
      setEditOpen(false);
      await loadTask();
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to update task.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!taskId) return;
    setDeleting(true);
    try {
      await apiRequest(`/tasks/${taskId}`, { method: "DELETE", body: JSON.stringify({}) });
      toast.success("Task deleted.");
      router.push("/dashboard/tasks");
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to delete task.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading task...</div>;
  }

  if (error || !task) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Task not available</AlertTitle>
        <AlertDescription>{error ?? "Task was not found."}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard/tasks" className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 transition-colors hover:text-sky-800">
          <ArrowLeft className="size-4" />
          Back to tasks
        </Link>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setEditOpen(true)}>
            <PencilLine className="size-4" />
            Edit
          </Button>
          <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      <section className="rounded-[1.35rem] border border-border/60 bg-white p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.18)]">
        <div className="grid gap-4">
          <h1 className="text-2xl font-semibold text-slate-900">{task.title}</h1>
          <div className="flex flex-wrap gap-2">
            <Badge variant={getStatusTone(task.status)}>{formatTitleCase(task.status)}</Badge>
            <Badge variant={getPriorityTone(task.priority)}>{formatTitleCase(task.priority)}</Badge>
            <Badge variant="outline">{formatTitleCase(task.taskType)}</Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border/60 bg-slate-50 px-3 py-2">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Assigned To</div>
              <div className="mt-1 text-sm text-slate-900">{task.assigneeName ?? "Unassigned"}</div>
              {task.assigneeEmail ? <div className="text-xs text-muted-foreground">{task.assigneeEmail}</div> : null}
            </div>
            <div className="rounded-xl border border-border/60 bg-slate-50 px-3 py-2">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Due Date</div>
              <div className="mt-1 text-sm text-slate-900">{task.dueAt ? new Date(task.dueAt).toLocaleString() : "Not set"}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-slate-50 px-3 py-2">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Reminder</div>
              <div className="mt-1 text-sm text-slate-900">{task.reminderMinutesBefore} minutes before</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-slate-50 px-3 py-2">
              <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Recurring</div>
              <div className="mt-1 text-sm text-slate-900">{task.isRecurring ? "Yes" : "No"}</div>
            </div>
          </div>

          <div className="rounded-xl border border-border/70">
            <div className="border-b border-border/60 px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.17em] text-slate-500">Associated With</div>
            <div className="flex min-h-[64px] flex-wrap gap-2 px-3 py-3">
              {task.associations.length ? (
                task.associations.map((association) => (
                  <span key={`${association.entityType}:${association.entityId}`} className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-slate-50 px-3 py-1 text-xs">
                    <span className="font-medium text-slate-900">{association.entityLabel}</span>
                    <span className="text-muted-foreground">{formatTitleCase(association.entityType)}</span>
                  </span>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No associated records.</div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border/70">
            <div className="border-b border-border/60 px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-[0.17em] text-slate-500">Notes</div>
            <div className="min-h-[220px] px-3 py-3 text-sm text-slate-800">{task.description || "No notes provided."}</div>
          </div>
        </div>
      </section>

      <CrmModalShell
        open={editOpen}
        title="Edit Task"
        description="Update task details, assignment, and reminders."
        onClose={() => setEditOpen(false)}
        maxWidthClassName="max-w-5xl"
      >
        {form ? (
          <form className="grid gap-4" onSubmit={handleSave}>
            <div className="grid gap-4 lg:grid-cols-2">
              <Field>
                <FieldLabel>Task name</FieldLabel>
                <Input value={form.title} onChange={(event) => setForm((current) => (current ? { ...current, title: event.target.value } : current))} required />
              </Field>
              <Field>
                <FieldLabel>Task type</FieldLabel>
                <NativeSelect value={form.taskType} onChange={(event) => setForm((current) => (current ? { ...current, taskType: event.target.value as TaskType } : current))}>
                  {taskTypes.map((taskType) => (
                    <option key={taskType} value={taskType}>
                      {formatTitleCase(taskType)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <NativeSelect value={form.status} onChange={(event) => setForm((current) => (current ? { ...current, status: event.target.value as TaskStatus } : current))}>
                  {taskStatuses.map((status) => (
                    <option key={status} value={status}>
                      {formatTitleCase(status)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Priority</FieldLabel>
                <NativeSelect value={form.priority} onChange={(event) => setForm((current) => (current ? { ...current, priority: event.target.value as TaskPriority } : current))}>
                  {taskPriorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {formatTitleCase(priority)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Due date</FieldLabel>
                <Input type="date" value={form.dueDate} onChange={(event) => setForm((current) => (current ? { ...current, dueDate: event.target.value } : current))} />
              </Field>
              <Field>
                <FieldLabel>Time</FieldLabel>
                <Input type="time" value={form.dueTime} onChange={(event) => setForm((current) => (current ? { ...current, dueTime: event.target.value } : current))} />
              </Field>
              <Field>
                <FieldLabel>Reminder</FieldLabel>
                <NativeSelect value={form.reminderMinutesBefore} onChange={(event) => setForm((current) => (current ? { ...current, reminderMinutesBefore: event.target.value } : current))}>
                  <option value="0">No reminder</option>
                  <option value="15">15 minutes before</option>
                  <option value="30">30 minutes before</option>
                  <option value="60">1 hour before</option>
                  <option value="1440">1 day before</option>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Assigned to</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input readOnly value={activeAssignee ? `${activeAssignee.fullName} (${activeAssignee.email})` : "Unassigned"} />
                  <Button type="button" variant="outline" onClick={() => setAssigneeModalOpen(true)}>
                    Choose
                  </Button>
                </div>
              </Field>

              <Field>
                <FieldLabel>Associated with (optional)</FieldLabel>
                <div className="grid gap-2">
                  <div className="flex flex-wrap gap-2">
                    {form.associations.length ? (
                      form.associations.map((association) => (
                        <button
                          key={`${association.entityType}:${association.entityId}`}
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-slate-50 px-3 py-1 text-xs"
                          onClick={() => removeAssociation(association)}
                        >
                          <span className="font-medium">{association.entityLabel}</span>
                          <span className="text-muted-foreground">{formatTitleCase(association.entityType)}</span>
                        </button>
                      ))
                    ) : (
                      <div className="text-xs text-muted-foreground">No associated records selected.</div>
                    )}
                  </div>
                  <Button type="button" variant="outline" className="w-fit" onClick={() => setAssociationModalOpen(true)}>
                    Select Associated Records
                  </Button>
                </div>
              </Field>
            </div>
            <Field>
              <FieldLabel>Notes</FieldLabel>
              <Textarea rows={7} value={form.description} onChange={(event) => setForm((current) => (current ? { ...current, description: event.target.value } : current))} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Close
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        ) : null}
      </CrmModalShell>

      <CrmModalShell
        open={assigneeModalOpen}
        title="Assign task"
        description="Choose from team members and partner users."
        onClose={() => setAssigneeModalOpen(false)}
        maxWidthClassName="max-w-3xl"
      >
        <div className="grid gap-4">
          <form
            className="flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              await loadAssignees(assigneeSearch);
            }}
          >
            <Input value={assigneeSearch} onChange={(event) => setAssigneeSearch(event.target.value)} placeholder="Search people" />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setForm((current) => (current ? { ...current, assignedToUserId: "" } : current));
              setAssigneeModalOpen(false);
            }}
          >
            Unassign task
          </Button>

          <div className="grid gap-2">
            {assignees.map((assignee) => (
              <button
                key={assignee.userId}
                type="button"
                className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-left transition hover:bg-slate-50"
                onClick={() => {
                  setForm((current) => (current ? { ...current, assignedToUserId: assignee.userId } : current));
                  setAssigneeModalOpen(false);
                }}
              >
                <div className="grid gap-0.5">
                  <div className="font-medium text-slate-900">{assignee.fullName}</div>
                  <div className="text-xs text-muted-foreground">
                    {assignee.email}
                    {assignee.partnerCompanyName ? ` · ${assignee.partnerCompanyName}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {assignee.badges.map((badge) => (
                    <Badge key={`${assignee.userId}-${badge}`} variant="secondary" className="text-[0.68rem]">
                      {badge}
                    </Badge>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </CrmModalShell>

      <CrmModalShell
        open={associationModalOpen}
        title="Associated with"
        description="Select contacts, leads, deals, templates, or campaigns for this task."
        onClose={() => setAssociationModalOpen(false)}
        maxWidthClassName="max-w-4xl"
      >
        {form ? (
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <Field>
                <FieldLabel>Category</FieldLabel>
                <NativeSelect
                  value={associationEntityType}
                  onChange={(event) => {
                    setAssociationEntityType(event.target.value as TaskAssociationEntityType);
                    setAssociationSearch("");
                  }}
                >
                  {associationEntityOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Search</FieldLabel>
                <Input
                  value={associationSearch}
                  onChange={(event) => setAssociationSearch(event.target.value)}
                  placeholder="Type to search records"
                />
              </Field>
            </div>

            <div className="rounded-xl border border-border/70">
              <div className="border-b border-border/60 px-3 py-2 text-xs font-semibold uppercase tracking-[0.17em] text-slate-500">
                Available {associationEntityOptions.find((option) => option.value === associationEntityType)?.label}
              </div>
              <div className="grid gap-2 p-3">
                {associationLoading ? <div className="text-sm text-muted-foreground">Loading records...</div> : null}
                {!associationLoading && associationOptions.length === 0 ? <div className="text-sm text-muted-foreground">No records found.</div> : null}
                {associationOptions.map((option) => {
                  const selected = form.associations.some(
                    (association) => association.entityType === option.entityType && association.entityId === option.entityId,
                  );

                  return (
                    <button
                      key={`${option.entityType}:${option.entityId}`}
                      type="button"
                      className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-left transition hover:bg-slate-50"
                      onClick={() => toggleAssociation(option)}
                    >
                      <div className="grid gap-0.5">
                        <div className="font-medium text-slate-900">{option.entityLabel}</div>
                        <div className="text-xs text-muted-foreground">{option.entitySubtitle ?? formatTitleCase(option.entityType)}</div>
                      </div>
                      <Badge variant={selected ? "default" : "outline"}>{selected ? "Selected" : "Select"}</Badge>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border/70">
              <div className="border-b border-border/60 px-3 py-2 text-xs font-semibold uppercase tracking-[0.17em] text-slate-500">Selected Records</div>
              <div className="flex min-h-[64px] flex-wrap gap-2 p-3">
                {form.associations.length ? (
                  form.associations.map((association) => (
                    <button
                      key={`selected-${association.entityType}:${association.entityId}`}
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-slate-50 px-3 py-1 text-xs"
                      onClick={() => removeAssociation(association)}
                    >
                      <span className="font-medium">{association.entityLabel}</span>
                      <span className="text-muted-foreground">{formatTitleCase(association.entityType)}</span>
                    </button>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">No associated records selected.</div>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="button" onClick={() => setAssociationModalOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </CrmModalShell>

      <CrmConfirmDialog
        open={deleteOpen}
        title="Delete Task"
        description="This action cannot be undone."
        warning="The selected task will be permanently removed from this workspace."
        confirmLabel="Delete"
        submitting={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
