"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PencilLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  CrmAppliedFiltersBar,
  CrmColumnSettings,
  CrmConfirmDialog,
  CrmDataTable,
  CrmFilterDrawer,
  CrmListPageHeader,
  CrmListToolbar,
  CrmModalShell,
  CrmPaginationBar,
} from "@/components/crm/crm-list-primitives";
import type { ColumnDefinition } from "@/components/crm/types";
import { useCrmListState } from "@/components/crm/use-crm-list-state";
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
type TaskSortKey = "title" | "status" | "priority" | "taskType" | "dueAt" | "assignee" | "createdAt";
type TaskColumnKey = TaskSortKey;
type GroupByKey = "none" | "assignedTo" | "status" | "taskType" | "priority";

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

type TaskListResponse = {
  items: TaskItem[];
  total: number;
  limit: number;
  offset: number;
};

type TaskAssigneeResponse = {
  items: TaskAssignee[];
};

type TaskFilters = {
  q: string;
  status: string;
  priority: string;
  taskType: string;
  assignedToUserId: string;
  overdueOnly: string;
};

const rowsPerPageOptions = [10, 20, 50, 100] as const;
const taskColumnStorageKey = "crm-saas-tasks-columns";

const taskStatuses: TaskStatus[] = ["todo", "in_progress", "done", "overdue"];
const taskPriorities: TaskPriority[] = ["low", "medium", "high"];
const taskTypes: TaskType[] = ["to_do", "call", "meeting", "follow_up"];

const emptyFilters: TaskFilters = {
  q: "",
  status: "",
  priority: "",
  taskType: "",
  assignedToUserId: "",
  overdueOnly: "",
};

const defaultColumnVisibility: Record<TaskColumnKey, boolean> = {
  title: true,
  status: true,
  priority: true,
  taskType: true,
  dueAt: true,
  assignee: true,
  createdAt: true,
};

const taskColumnDefinitions: Array<{ key: TaskColumnKey; label: string }> = [
  { key: "title", label: "Task" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "taskType", label: "Task Type" },
  { key: "dueAt", label: "Due Date" },
  { key: "assignee", label: "Assigned To" },
  { key: "createdAt", label: "Created" },
];

const groupByOptions: Array<{ value: GroupByKey; label: string }> = [
  { value: "none", label: "No Group" },
  { value: "assignedTo", label: "Assigned To" },
  { value: "status", label: "Status" },
  { value: "taskType", label: "Task Type" },
  { value: "priority", label: "Priority" },
];

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

const emptyTaskForm: TaskFormState = {
  title: "",
  description: "",
  taskType: "to_do",
  status: "todo",
  priority: "medium",
  dueDate: "",
  dueTime: "09:00",
  reminderMinutesBefore: "30",
  isRecurring: false,
  recurrenceRule: "",
  assignedToUserId: "",
  associations: [],
};

const associationEntityOptions: Array<{ value: TaskAssociationEntityType; label: string }> = [
  { value: "contact", label: "Contacts" },
  { value: "lead", label: "Leads" },
  { value: "deal", label: "Deals" },
  { value: "template", label: "Templates" },
  { value: "campaign", label: "Campaigns" },
];

function formatTitleCase(value: string) {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatDate(value: string | null) {
  if (!value) {
    return "No due date";
  }
  return new Date(value).toLocaleString();
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
  if (!dueDate) {
    return undefined;
  }
  const timeValue = dueTime || "09:00";
  return new Date(`${dueDate}T${timeValue}:00`).toISOString();
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

function getFilterChips(filters: TaskFilters, assignees: TaskAssignee[]) {
  const chips: Array<{ key: keyof TaskFilters; label: string; value: string }> = [];
  if (filters.q.trim()) chips.push({ key: "q", label: "Search", value: filters.q.trim() });
  if (filters.status) chips.push({ key: "status", label: "Status", value: formatTitleCase(filters.status) });
  if (filters.priority) chips.push({ key: "priority", label: "Priority", value: formatTitleCase(filters.priority) });
  if (filters.taskType) chips.push({ key: "taskType", label: "Task Type", value: formatTitleCase(filters.taskType) });
  if (filters.assignedToUserId) {
    const assignee = assignees.find((item) => item.userId === filters.assignedToUserId);
    chips.push({ key: "assignedToUserId", label: "Assigned", value: assignee?.fullName ?? "Unknown" });
  }
  if (filters.overdueOnly === "true") chips.push({ key: "overdueOnly", label: "Due", value: "Overdue" });
  return chips;
}

export default function TasksListPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupByKey>("none");

  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<TaskFormState>(emptyTaskForm);
  const [saving, setSaving] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [assigneeModalOpen, setAssigneeModalOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [assigneeLoading, setAssigneeLoading] = useState(false);
  const [associationModalOpen, setAssociationModalOpen] = useState(false);
  const [associationEntityType, setAssociationEntityType] = useState<TaskAssociationEntityType>("contact");
  const [associationSearch, setAssociationSearch] = useState("");
  const [associationLoading, setAssociationLoading] = useState(false);
  const [associationOptions, setAssociationOptions] = useState<TaskAssociation[]>([]);

  const {
    filters,
    setFilters,
    filterDraft,
    setFilterDraft,
    applyFilterDraft,
    clearFilterDraft,
    clearAllFilters,
    removeAppliedFilter,
    page,
    setPage,
    limit,
    setLimit,
    sortBy,
    sortDir,
    requestSort,
    columnVisibility,
    toggleColumn,
    resetColumns,
  } = useCrmListState<TaskFilters, TaskSortKey, TaskColumnKey>({
    defaultFilters: emptyFilters,
    defaultSortBy: "createdAt",
    defaultSortDir: "desc",
    defaultLimit: 20,
    rowsPerPageOptions,
    parseFilters: (params) => ({
      q: params.get("q") ?? "",
      status: params.get("status") ?? "",
      priority: params.get("priority") ?? "",
      taskType: params.get("taskType") ?? "",
      assignedToUserId: params.get("assignedToUserId") ?? "",
      overdueOnly: params.get("overdueOnly") ?? "",
    }),
    writeFilters: (params, nextFilters) => {
      if (nextFilters.q) params.set("q", nextFilters.q);
      if (nextFilters.status) params.set("status", nextFilters.status);
      if (nextFilters.priority) params.set("priority", nextFilters.priority);
      if (nextFilters.taskType) params.set("taskType", nextFilters.taskType);
      if (nextFilters.assignedToUserId) params.set("assignedToUserId", nextFilters.assignedToUserId);
      if (nextFilters.overdueOnly) params.set("overdueOnly", nextFilters.overdueOnly);
    },
    normalizeSortBy: (value) => {
      if (!value) return "createdAt";
      if (["title", "status", "priority", "taskType", "dueAt", "assignee", "createdAt"].includes(value)) {
        return value as TaskSortKey;
      }
      return "createdAt";
    },
    columnStorageKey: taskColumnStorageKey,
    defaultColumnVisibility,
  });

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const loadAssignees = useCallback(async (queryText = "") => {
    setAssigneeLoading(true);
    try {
      const params = new URLSearchParams();
      if (queryText.trim()) {
        params.set("q", queryText.trim());
      }
      const response = await apiRequest<TaskAssigneeResponse>(`/tasks/assignees?${params.toString()}`);
      setAssignees(response.items);
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to load assignees.");
    } finally {
      setAssigneeLoading(false);
    }
  }, []);

  const loadAssociationOptions = useCallback(async (entityType: TaskAssociationEntityType, queryText = "") => {
    setAssociationLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("entityType", entityType);
      if (queryText.trim()) {
        params.set("q", queryText.trim());
      }
      const response = await apiRequest<TaskAssociationOptionResponse>(`/tasks/association-options?${params.toString()}`);
      setAssociationOptions(response.items);
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to load associated records.");
    } finally {
      setAssociationLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.status) params.set("status", filters.status);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.taskType) params.set("taskType", filters.taskType);
      if (filters.assignedToUserId) params.set("assignedToUserId", filters.assignedToUserId);
      if (filters.overdueOnly) params.set("overdueOnly", filters.overdueOnly);
      params.set("limit", String(limit));
      params.set("offset", String((page - 1) * limit));

      const response = await apiRequest<TaskListResponse>(`/tasks?${params.toString()}`, { skipCache: true });
      setTasks(response.items);
      setTotal(response.total);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [filters, limit, page]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadAssignees();
  }, [loadAssignees]);

  useEffect(() => {
    if (!associationModalOpen) {
      return;
    }
    void loadAssociationOptions(associationEntityType, associationSearch);
  }, [associationEntityType, associationModalOpen, associationSearch, loadAssociationOptions]);

  const sortedRows = useMemo(() => {
    const rows = [...tasks];
    rows.sort((left, right) => {
      let leftValue: string | number = "";
      let rightValue: string | number = "";

      if (sortBy === "title") {
        leftValue = left.title;
        rightValue = right.title;
      } else if (sortBy === "status") {
        leftValue = left.status;
        rightValue = right.status;
      } else if (sortBy === "priority") {
        leftValue = left.priority;
        rightValue = right.priority;
      } else if (sortBy === "taskType") {
        leftValue = left.taskType;
        rightValue = right.taskType;
      } else if (sortBy === "dueAt") {
        leftValue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        rightValue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      } else if (sortBy === "assignee") {
        leftValue = left.assigneeName ?? "";
        rightValue = right.assigneeName ?? "";
      } else {
        leftValue = new Date(left.createdAt).getTime();
        rightValue = new Date(right.createdAt).getTime();
      }

      const direction = sortDir === "asc" ? 1 : -1;
      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return (leftValue - rightValue) * direction;
      }
      return String(leftValue).localeCompare(String(rightValue), undefined, { sensitivity: "base" }) * direction;
    });
    return rows;
  }, [sortBy, sortDir, tasks]);

  const groupedRows = useMemo(() => {
    if (groupBy === "none") {
      return [{ key: "all", label: "All Tasks", rows: sortedRows }];
    }

    const map = new Map<string, TaskItem[]>();
    for (const row of sortedRows) {
      let key = "";
      if (groupBy === "assignedTo") {
        key = row.assigneeName ?? "Unassigned";
      } else if (groupBy === "status") {
        key = formatTitleCase(row.status);
      } else if (groupBy === "priority") {
        key = formatTitleCase(row.priority);
      } else {
        key = formatTitleCase(row.taskType);
      }

      const bucket = map.get(key) ?? [];
      bucket.push(row);
      map.set(key, bucket);
    }

    return Array.from(map.entries()).map(([key, rows]) => ({ key, label: key, rows }));
  }, [groupBy, sortedRows]);

  const columns = useMemo<Array<ColumnDefinition<TaskItem, TaskColumnKey, TaskSortKey>>>(
    () => [
      {
        key: "title",
        label: "Task",
        sortable: true,
        sortKey: "title",
        renderCell: (task) => (
          <div className="grid gap-1">
            <Link href={`/dashboard/tasks/${task.id}`} className="font-medium text-slate-900 transition-colors hover:text-sky-700">
              {task.title}
            </Link>
            <div className="text-xs text-muted-foreground line-clamp-2">{task.description || "No notes"}</div>
          </div>
        ),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        sortKey: "status",
        renderCell: (task) => <Badge variant={getStatusTone(task.status)}>{formatTitleCase(task.status)}</Badge>,
      },
      {
        key: "priority",
        label: "Priority",
        sortable: true,
        sortKey: "priority",
        renderCell: (task) => <Badge variant={getPriorityTone(task.priority)}>{formatTitleCase(task.priority)}</Badge>,
      },
      {
        key: "taskType",
        label: "Task Type",
        sortable: true,
        sortKey: "taskType",
        renderCell: (task) => <span>{formatTitleCase(task.taskType)}</span>,
      },
      {
        key: "dueAt",
        label: "Due Date",
        sortable: true,
        sortKey: "dueAt",
        renderCell: (task) => <span>{formatDate(task.dueAt)}</span>,
      },
      {
        key: "assignee",
        label: "Assigned To",
        sortable: true,
        sortKey: "assignee",
        renderCell: (task) => (
          <div className="grid gap-0.5">
            <span>{task.assigneeName ?? "Unassigned"}</span>
            {task.assigneeEmail ? <span className="text-xs text-muted-foreground">{task.assigneeEmail}</span> : null}
          </div>
        ),
      },
      {
        key: "createdAt",
        label: "Created",
        sortable: true,
        sortKey: "createdAt",
        renderCell: (task) => <span>{new Date(task.createdAt).toLocaleDateString()}</span>,
      },
    ],
    [],
  );

  const activeFilterChips = useMemo(() => getFilterChips(filters, assignees), [assignees, filters]);
  const activeAssignee = assignees.find((item) => item.userId === form.assignedToUserId) ?? null;

  const openCreateModal = () => {
    setFormMode("create");
    setEditingTaskId(null);
    setForm(emptyTaskForm);
    setFormOpen(true);
  };

  const openEditModal = (task: TaskItem) => {
    setFormMode("edit");
    setEditingTaskId(task.id);
    setForm(taskToForm(task));
    setFormOpen(true);
  };

  const handleCreateOrUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) {
      toast.error("Task name is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
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
      };

      if (formMode === "create") {
        await apiRequest("/tasks", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Task created.");
      } else if (editingTaskId) {
        await apiRequest(`/tasks/${editingTaskId}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast.success("Task updated.");
      }

      setFormOpen(false);
      setForm(emptyTaskForm);
      await loadTasks();
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to save task.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTaskId) {
      return;
    }

    setDeleting(true);
    try {
      await apiRequest(`/tasks/${deleteTaskId}`, { method: "DELETE", body: JSON.stringify({}) });
      toast.success("Task deleted.");
      setDeleteTaskId(null);
      await loadTasks();
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to delete task.");
    } finally {
      setDeleting(false);
    }
  };

  const handleAssigneeSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadAssignees(assigneeSearch);
  };

  const toggleAssociation = (association: TaskAssociation) => {
    setForm((current) => {
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
    setForm((current) => ({
      ...current,
      associations: current.associations.filter(
        (item) => !(item.entityType === association.entityType && item.entityId === association.entityId),
      ),
    }));
  };

  return (
    <div className="grid gap-4">
      <CrmListPageHeader
        title="Tasks"
        actions={
          <>
            <Button type="button" onClick={openCreateModal}>
              <Plus className="size-4" />
              Add New Task
            </Button>
          </>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load tasks</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-[1.35rem] border border-border/60 bg-white shadow-[0_18px_40px_-34px_rgba(15,23,42,0.18)]">
        <CrmListToolbar
          searchValue={filters.q}
          searchPlaceholder="Search by task name"
          onSearchChange={(value) => {
            setFilters((current) => ({ ...current, q: value }));
            setFilterDraft((current) => ({ ...current, q: value }));
            setPage(1);
          }}
          onOpenFilters={() => setFilterOpen(true)}
          filterCount={activeFilterChips.length}
          onOpenColumns={() => setColumnSettingsOpen(true)}
          onRefresh={() => void loadTasks()}
          extraContent={
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Group by</span>
              <NativeSelect
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value as GroupByKey)}
                className="h-11 min-w-[170px] rounded-2xl border-border/70 bg-white text-sm"
              >
                {groupByOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          }
        />

        <CrmAppliedFiltersBar chips={activeFilterChips} onRemove={removeAppliedFilter} onClear={clearAllFilters} emptyLabel="No active filters." />

        <div className="grid gap-5 p-4">
          {groupedRows.map((group) => (
            <div key={group.key} className="grid gap-2">
              {groupBy !== "none" ? (
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">{group.label}</div>
                  <Badge variant="outline">{group.rows.length}</Badge>
                </div>
              ) : null}
              <CrmDataTable
                columns={columns}
                rows={group.rows}
                rowKey={(task) => task.id}
                loading={loading}
                emptyLabel="No tasks found."
                columnVisibility={columnVisibility}
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={requestSort}
                actionColumn={{
                  header: "Actions",
                  renderCell: (task) => (
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="xs" onClick={() => openEditModal(task)}>
                        <PencilLine className="size-4" />
                      </Button>
                      <Button type="button" variant="destructive" size="xs" onClick={() => setDeleteTaskId(task.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ),
                }}
              />
            </div>
          ))}
        </div>

        <CrmPaginationBar
          limit={limit}
          onLimitChange={(value) => {
            setLimit(value);
            setPage(1);
          }}
          rowsPerPageOptions={rowsPerPageOptions}
          total={total}
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage(Math.max(1, page - 1))}
          onNext={() => setPage(Math.min(totalPages, page + 1))}
        />
      </div>

      <CrmColumnSettings
        open={columnSettingsOpen}
        title="Task table columns"
        description="Pick the fields your team should see in task list view."
        columns={taskColumnDefinitions}
        columnVisibility={columnVisibility}
        onToggleColumn={toggleColumn}
        onReset={resetColumns}
        onClose={() => setColumnSettingsOpen(false)}
      />

      <CrmFilterDrawer
        open={filterOpen}
        title="Task filters"
        description="Apply filters to narrow the task list."
        onClose={() => setFilterOpen(false)}
        onClear={clearFilterDraft}
        onApply={() => {
          applyFilterDraft();
          setFilterOpen(false);
        }}
      >
        <div className="grid gap-4">
          <Field>
            <FieldLabel>Status</FieldLabel>
            <NativeSelect value={filterDraft.status} onChange={(event) => setFilterDraft((current) => ({ ...current, status: event.target.value }))}>
              <option value="">All statuses</option>
              {taskStatuses.map((status) => (
                <option key={status} value={status}>
                  {formatTitleCase(status)}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel>Priority</FieldLabel>
            <NativeSelect value={filterDraft.priority} onChange={(event) => setFilterDraft((current) => ({ ...current, priority: event.target.value }))}>
              <option value="">All priorities</option>
              {taskPriorities.map((priority) => (
                <option key={priority} value={priority}>
                  {formatTitleCase(priority)}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel>Task type</FieldLabel>
            <NativeSelect value={filterDraft.taskType} onChange={(event) => setFilterDraft((current) => ({ ...current, taskType: event.target.value }))}>
              <option value="">All types</option>
              {taskTypes.map((taskType) => (
                <option key={taskType} value={taskType}>
                  {formatTitleCase(taskType)}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel>Assigned to</FieldLabel>
            <NativeSelect
              value={filterDraft.assignedToUserId}
              onChange={(event) => setFilterDraft((current) => ({ ...current, assignedToUserId: event.target.value }))}
            >
              <option value="">All assignees</option>
              {assignees.map((assignee) => (
                <option key={assignee.userId} value={assignee.userId}>
                  {assignee.fullName}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel>Due date</FieldLabel>
            <NativeSelect value={filterDraft.overdueOnly} onChange={(event) => setFilterDraft((current) => ({ ...current, overdueOnly: event.target.value }))}>
              <option value="">All tasks</option>
              <option value="true">Overdue only</option>
            </NativeSelect>
          </Field>
        </div>
      </CrmFilterDrawer>

      <CrmModalShell
        open={formOpen}
        title={formMode === "create" ? "Create Task" : "Edit Task"}
        description="Capture due work with assignment, reminders, and recurrence."
        onClose={() => setFormOpen(false)}
        maxWidthClassName="max-w-5xl"
      >
        <form className="grid gap-4" onSubmit={handleCreateOrUpdate}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field>
              <FieldLabel>Task name</FieldLabel>
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Follow up with ACME" required />
            </Field>

            <Field>
              <FieldLabel>Task type</FieldLabel>
              <NativeSelect value={form.taskType} onChange={(event) => setForm((current) => ({ ...current, taskType: event.target.value as TaskType }))}>
                {taskTypes.map((taskType) => (
                  <option key={taskType} value={taskType}>
                    {formatTitleCase(taskType)}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel>Status</FieldLabel>
              <NativeSelect value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as TaskStatus }))}>
                {taskStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatTitleCase(status)}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel>Priority</FieldLabel>
              <NativeSelect value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as TaskPriority }))}>
                {taskPriorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {formatTitleCase(priority)}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel>Due date</FieldLabel>
              <Input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
            </Field>

            <Field>
              <FieldLabel>Reminder</FieldLabel>
              <NativeSelect
                value={form.reminderMinutesBefore}
                onChange={(event) => setForm((current) => ({ ...current, reminderMinutesBefore: event.target.value }))}
              >
                <option value="0">No reminder</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="60">1 hour before</option>
                <option value="1440">1 day before</option>
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel>Time</FieldLabel>
              <Input type="time" value={form.dueTime} onChange={(event) => setForm((current) => ({ ...current, dueTime: event.target.value }))} />
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
            <Textarea
              rows={6}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Add context and follow-up notes"
            />
          </Field>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Close
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </CrmModalShell>

      <CrmModalShell
        open={assigneeModalOpen}
        title="Assign task"
        description="Choose from team members and partner users."
        onClose={() => setAssigneeModalOpen(false)}
        maxWidthClassName="max-w-3xl"
      >
        <div className="grid gap-4">
          <form className="flex gap-2" onSubmit={handleAssigneeSearch}>
            <Input value={assigneeSearch} onChange={(event) => setAssigneeSearch(event.target.value)} placeholder="Search people" />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>

          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setForm((current) => ({ ...current, assignedToUserId: "" }));
              setAssigneeModalOpen(false);
            }}
          >
            Unassign task
          </Button>

          <div className="grid gap-2">
            {assigneeLoading ? <div className="text-sm text-muted-foreground">Loading assignees...</div> : null}
            {assignees.map((assignee) => (
              <button
                key={assignee.userId}
                type="button"
                className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-left transition hover:bg-slate-50"
                onClick={() => {
                  setForm((current) => ({ ...current, assignedToUserId: assignee.userId }));
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
      </CrmModalShell>

      <CrmConfirmDialog
        open={Boolean(deleteTaskId)}
        title="Delete Task"
        description="This action cannot be undone."
        warning="The selected task will be removed from your workspace."
        confirmLabel="Delete"
        submitting={deleting}
        onCancel={() => setDeleteTaskId(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
