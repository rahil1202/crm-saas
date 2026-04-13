"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { FormErrorSummary, FormSection } from "@/components/forms/form-primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CrudPanel, EmptyState, FilterBar, LoadingState, PageSection, StatCard } from "@/components/ui/page-patterns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { useAsyncForm } from "@/hooks/use-async-form";

type TaskStatus = "todo" | "in_progress" | "done" | "overdue";
type TaskPriority = "low" | "medium" | "high";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  reminderMinutesBefore: number;
  reminderSentAt?: string | null;
  isRecurring: boolean;
  recurrenceRule: string | null;
}

interface ListResponse {
  items: Task[];
}

interface TaskSummaryResponse {
  total: number;
  open: number;
  overdue: number;
  dueToday: number;
  reminderReady: number;
  highPriorityOpen: number;
  completed: number;
}

interface TaskCalendarResponse {
  month: string;
  days: Array<{
    date: string;
    total: number;
    overdue: number;
    items: Task[];
  }>;
}

interface TaskReminderResponse {
  windowHours: number;
  items: Array<
    Task & {
      reminderAt: string;
      reminderReady: boolean;
      dueSoon: boolean;
    }
  >;
  summary: {
    total: number;
    ready: number;
    sent: number;
  };
}

type FollowUpStatus = "pending" | "completed" | "missed" | "canceled";

interface FollowUp {
  id: string;
  subject: string;
  channel: string;
  status: FollowUpStatus;
  scheduledAt: string;
  notes: string | null;
  outcome: string | null;
}

interface FollowUpListResponse {
  items: FollowUp[];
}

const statuses: TaskStatus[] = ["todo", "in_progress", "done", "overdue"];
const priorities: TaskPriority[] = ["low", "medium", "high"];

const statusTone: Record<TaskStatus, "outline" | "secondary" | "default" | "destructive"> = {
  todo: "outline",
  in_progress: "secondary",
  done: "default",
  overdue: "destructive",
};

const priorityTone: Record<TaskPriority, "outline" | "secondary" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
};

function formatDateLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [summary, setSummary] = useState<TaskSummaryResponse | null>(null);
  const [calendar, setCalendar] = useState<TaskCalendarResponse | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueAt, setDueAt] = useState("");
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState("1440");
  const [recurrenceRule, setRecurrenceRule] = useState("");
  const [followUpSubject, setFollowUpSubject] = useState("");
  const [followUpChannel, setFollowUpChannel] = useState("call");
  const [followUpScheduledAt, setFollowUpScheduledAt] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const [savingFollowUpId, setSavingFollowUpId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reminders, setReminders] = useState<TaskReminderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [sendingReminderTaskId, setSendingReminderTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const taskForm = useAsyncForm();
  const followUpForm = useAsyncForm();

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (statusFilter) {
      params.set("status", statusFilter);
    }
    if (overdueOnly) {
      params.set("overdueOnly", "true");
    }

    try {
      const data = await apiRequest<ListResponse>(`/tasks?${params.toString()}`);
      setTasks(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load tasks");
    } finally {
      setLoading(false);
    }
  }, [overdueOnly, statusFilter]);

  const loadSummary = useCallback(async () => {
    try {
      const data = await apiRequest<TaskSummaryResponse>("/tasks/summary");
      setSummary(data);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load task summary");
    }
  }, []);

  const loadCalendar = useCallback(async () => {
    try {
      const data = await apiRequest<TaskCalendarResponse>(`/tasks/calendar?month=${calendarMonth}`);
      setCalendar(data);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load task calendar");
    }
  }, [calendarMonth]);

  const loadReminders = useCallback(async () => {
    try {
      const data = await apiRequest<TaskReminderResponse>("/tasks/reminders?windowHours=72");
      setReminders(data);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load task reminders");
    }
  }, []);

  const loadFollowUps = useCallback(async () => {
    try {
      const data = await apiRequest<FollowUpListResponse>("/tasks/follow-ups?limit=20");
      setFollowUps(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load follow-ups");
    }
  }, []);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadTasks(), loadSummary(), loadCalendar(), loadReminders(), loadFollowUps()]);
  }, [loadCalendar, loadFollowUps, loadReminders, loadSummary, loadTasks]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    void loadReminders();
  }, [loadReminders]);

  useEffect(() => {
    void loadFollowUps();
  }, [loadFollowUps]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      await taskForm.runSubmit(
        () =>
          apiRequest("/tasks", {
            method: "POST",
            body: JSON.stringify({
              title,
              description: description || undefined,
              priority,
              dueAt: dueAt ? new Date(`${dueAt}T09:00:00.000Z`).toISOString() : undefined,
              reminderMinutesBefore: Number(reminderMinutesBefore) || 0,
              isRecurring: recurrenceRule.trim().length > 0,
              recurrenceRule: recurrenceRule || undefined,
            }),
          }),
        "Unable to create task",
      );
      setTitle("");
      setDescription("");
      setPriority("medium");
      setDueAt("");
      setReminderMinutesBefore("1440");
      setRecurrenceRule("");
      await reloadAll();
    } catch {}
  };

  const updateTask = async (taskId: string, payload: Partial<Pick<Task, "status">> & { dueAt?: string | null }) => {
    setSavingTaskId(taskId);
    setError(null);

    try {
      await apiRequest(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(payload.status ? { status: payload.status } : {}),
          ...(payload.dueAt !== undefined
            ? {
                dueAt: payload.dueAt ? new Date(`${payload.dueAt}T09:00:00.000Z`).toISOString() : null,
              }
            : {}),
        }),
      });
      await reloadAll();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update task");
    } finally {
      setSavingTaskId(null);
    }
  };

  const sendReminder = async (taskId: string) => {
    setSendingReminderTaskId(taskId);
    setError(null);

    try {
      await apiRequest(`/tasks/${taskId}/send-reminder`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await reloadAll();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to send reminder");
    } finally {
      setSendingReminderTaskId(null);
    }
  };

  const handleCreateFollowUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      await followUpForm.runSubmit(
        () =>
          apiRequest("/tasks/follow-ups", {
            method: "POST",
            body: JSON.stringify({
              subject: followUpSubject,
              channel: followUpChannel,
              scheduledAt: new Date(followUpScheduledAt).toISOString(),
              notes: followUpNotes || undefined,
            }),
          }),
        "Unable to create follow-up",
      );
      setFollowUpSubject("");
      setFollowUpChannel("call");
      setFollowUpScheduledAt("");
      setFollowUpNotes("");
      await reloadAll();
    } catch {}
  };

  const updateFollowUp = async (followUpId: string, status: FollowUpStatus) => {
    setSavingFollowUpId(followUpId);
    setError(null);

    try {
      await apiRequest(`/tasks/follow-ups/${followUpId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await reloadAll();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update follow-up");
    } finally {
      setSavingFollowUpId(null);
    }
  };

  return (
    <AppShell
      title="Tasks & Follow-ups"
      description="Task execution workspace with overdue visibility, due-date planning, and month calendar coverage."
    >
      <div className="grid gap-6">
        <FormErrorSummary title="Task request failed" error={error ?? taskForm.formError ?? followUpForm.formError} />

        <PageSection>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          {[
            { label: "Total", value: summary?.total ?? 0 },
            { label: "Open", value: summary?.open ?? 0 },
            { label: "Overdue", value: summary?.overdue ?? 0 },
            { label: "Due today", value: summary?.dueToday ?? 0 },
            { label: "Reminder ready", value: summary?.reminderReady ?? 0 },
            { label: "High priority", value: summary?.highPriorityOpen ?? 0 },
            { label: "Completed", value: summary?.completed ?? 0 },
          ].map((item) => (
            <StatCard key={item.label} label={item.label} value={item.value} />
          ))}
          </div>
        </PageSection>

        {(summary?.overdue ?? 0) > 0 || (summary?.dueToday ?? 0) > 0 ? (
          <Alert variant={(summary?.overdue ?? 0) > 0 ? "destructive" : "default"}>
            <AlertTitle>Follow-up attention required</AlertTitle>
            <AlertDescription>
              {(summary?.overdue ?? 0) > 0
                ? `${summary?.overdue ?? 0} tasks are overdue in the active workspace.`
                : `${summary?.dueToday ?? 0} tasks are due today.`}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <CrudPanel title="Create task" description="Capture due work with a due date and optional recurrence rule.">
              <form className="grid gap-4" onSubmit={handleCreate}>
                <FormSection title="Task details" description="Create a reusable, schedulable work item with reminder timing.">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="task-title">Task title</FieldLabel>
                      <Input id="task-title" value={title} onChange={(event) => { taskForm.clearFieldError("title"); setTitle(event.target.value); }} placeholder="Call customer for proposal review" required />
                      <FieldError errors={taskForm.fieldErrors.title?.map((message) => ({ message }))} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="task-priority">Priority</FieldLabel>
                      <NativeSelect id="task-priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                        {priorities.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="task-dueAt">Due date</FieldLabel>
                      <Input id="task-dueAt" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
                      <FieldDescription>Tasks without a due date stay off the calendar.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="task-reminder">Reminder timing</FieldLabel>
                      <NativeSelect id="task-reminder" value={reminderMinutesBefore} onChange={(event) => setReminderMinutesBefore(event.target.value)}>
                        <option value="0">No reminder</option>
                        <option value="60">1 hour before</option>
                        <option value="180">3 hours before</option>
                        <option value="720">12 hours before</option>
                        <option value="1440">24 hours before</option>
                        <option value="2880">48 hours before</option>
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="task-recurrence">Recurrence rule</FieldLabel>
                      <Input id="task-recurrence" value={recurrenceRule} onChange={(event) => setRecurrenceRule(event.target.value)} placeholder="weekly-follow-up" />
                    </Field>
                  </FieldGroup>
                </FormSection>
                <Field>
                  <FieldLabel htmlFor="task-description">Description</FieldLabel>
                  <Textarea id="task-description" value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-28" placeholder="Context, next steps, owner notes..." />
                </Field>
                <Button type="submit" disabled={taskForm.submitting} className="w-fit">
                  {taskForm.submitting ? "Creating..." : "Create task"}
                </Button>
              </form>
          </CrudPanel>

          <CrudPanel title="Task planning" description="Switch between operational list view and calendar-based due-date planning.">
            <div className="grid gap-4">
              <Tabs defaultValue="list" queryKey="tab" className="grid gap-4">
                <TabsList className="w-fit">
                  <TabsTrigger value="list">List</TabsTrigger>
                  <TabsTrigger value="reminders">Reminders</TabsTrigger>
                  <TabsTrigger value="calendar">Calendar</TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="grid gap-4">
                  <FilterBar className="md:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <Field>
                      <FieldLabel htmlFor="task-status-filter">Status</FieldLabel>
                      <NativeSelect id="task-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                        <option value="">All statuses</option>
                        {statuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <label className="flex items-end gap-2 text-sm text-muted-foreground">
                      <input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} />
                      Overdue only
                    </label>
                    <div className="flex items-end">
                      <Button type="button" variant="outline" onClick={() => void loadTasks()}>
                        Apply
                      </Button>
                    </div>
                  </FilterBar>

                  {loading ? <LoadingState label="Loading tasks..." /> : null}

                  {!loading ? (
                    <div className="grid gap-3">
                      {tasks.map((task) => (
                        <Card key={task.id} size="sm">
                          <CardHeader>
                            <CardTitle className="flex flex-wrap items-center gap-2">
                              <span>{task.title}</span>
                              <Badge variant={statusTone[task.status]}>{task.status}</Badge>
                              <Badge variant={priorityTone[task.priority]}>{task.priority}</Badge>
                              {task.isRecurring ? <Badge variant="outline">recurring</Badge> : null}
                            </CardTitle>
                            <CardDescription>
                              {task.dueAt ? `Due ${new Date(task.dueAt).toLocaleDateString()}` : "No due date"}
                              {task.recurrenceRule ? ` • ${task.recurrenceRule}` : ""}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="grid gap-3">
                            {task.description ? <div className="text-sm text-muted-foreground">{task.description}</div> : null}
                            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_160px]">
                              <Field>
                                <FieldLabel>Due date</FieldLabel>
                                <Input
                                  type="date"
                                  value={task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : ""}
                                  onChange={(event) => void updateTask(task.id, { dueAt: event.target.value || null })}
                                />
                              </Field>
                              <Field>
                                <FieldLabel>Status</FieldLabel>
                                <NativeSelect
                                  value={task.status}
                                  onChange={(event) => void updateTask(task.id, { status: event.target.value as TaskStatus })}
                                  disabled={savingTaskId === task.id}
                                >
                                  {statuses.map((status) => (
                                    <option key={status} value={status}>
                                      {status}
                                    </option>
                                  ))}
                                </NativeSelect>
                              </Field>
                              <div className="flex items-end text-sm text-muted-foreground">
                                {savingTaskId === task.id ? "Saving..." : task.status === "done" ? "Completed task" : "Active task"}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {tasks.length === 0 ? (
                        <EmptyState title="No tasks found" description="Adjust the active filter or create a new task." />
                      ) : null}
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent value="reminders" className="grid gap-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <Card size="sm">
                      <CardHeader>
                        <CardDescription>Due soon</CardDescription>
                        <CardTitle className="text-2xl">{reminders?.summary.total ?? 0}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card size="sm">
                      <CardHeader>
                        <CardDescription>Ready now</CardDescription>
                        <CardTitle className="text-2xl">{reminders?.summary.ready ?? 0}</CardTitle>
                      </CardHeader>
                    </Card>
                    <Card size="sm">
                      <CardHeader>
                        <CardDescription>Sent</CardDescription>
                        <CardTitle className="text-2xl">{reminders?.summary.sent ?? 0}</CardTitle>
                      </CardHeader>
                    </Card>
                  </div>

                  <div className="grid gap-3">
                    {(reminders?.items ?? []).map((task) => (
                      <Card key={task.id} size="sm">
                        <CardHeader>
                          <CardTitle className="flex flex-wrap items-center gap-2">
                            <span>{task.title}</span>
                            <Badge variant={statusTone[task.status]}>{task.status}</Badge>
                            <Badge variant={priorityTone[task.priority]}>{task.priority}</Badge>
                            <Badge variant={task.reminderReady ? "destructive" : task.reminderSentAt ? "secondary" : "outline"}>
                              {task.reminderReady ? "ready" : task.reminderSentAt ? "sent" : "scheduled"}
                            </Badge>
                          </CardTitle>
                          <CardDescription>
                            Due {task.dueAt ? new Date(task.dueAt).toLocaleString() : "No due date"} • Reminder at {new Date(task.reminderAt).toLocaleString()}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-sm text-muted-foreground">{task.description ?? "No description"}</div>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={sendingReminderTaskId === task.id || !task.reminderReady}
                            onClick={() => void sendReminder(task.id)}
                          >
                            {sendingReminderTaskId === task.id ? "Sending..." : task.reminderSentAt ? "Reminder sent" : "Send reminder"}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}

                    {(reminders?.items.length ?? 0) === 0 ? (
                      <EmptyState title="No reminder candidates" description="No reminders are due within the next 72 hours." />
                    ) : null}
                  </div>
                </TabsContent>

                <TabsContent value="calendar" className="grid gap-4">
                  <FilterBar className="flex flex-wrap items-end gap-3">
                    <Field>
                      <FieldLabel htmlFor="task-calendar-month">Month</FieldLabel>
                      <Input id="task-calendar-month" type="month" value={calendarMonth} onChange={(event) => setCalendarMonth(event.target.value)} />
                    </Field>
                    <Button type="button" variant="outline" onClick={() => void loadCalendar()}>
                      Load month
                    </Button>
                  </FilterBar>

                  <div className="grid gap-3">
                    {(calendar?.days ?? []).map((day) => (
                      <Card key={day.date} size="sm">
                        <CardHeader>
                          <CardTitle className="flex flex-wrap items-center gap-2">
                            <span>{formatDateLabel(day.date)}</span>
                            <Badge variant="outline">{day.total} tasks</Badge>
                            {day.overdue > 0 ? <Badge variant="destructive">{day.overdue} overdue</Badge> : null}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-2">
                          {day.items.map((task) => (
                            <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/10 px-3 py-2">
                              <div className="flex flex-col gap-1">
                                <span className="font-medium">{task.title}</span>
                                <span className="text-sm text-muted-foreground">{task.description ?? "No description"}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={statusTone[task.status]}>{task.status}</Badge>
                                <Badge variant={priorityTone[task.priority]}>{task.priority}</Badge>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    ))}

                    {(calendar?.days.length ?? 0) === 0 ? (
                      <EmptyState title="No calendar entries" description={`No tasks with due dates in ${calendarMonth}.`} />
                    ) : null}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </CrudPanel>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <CrudPanel title="Schedule follow-up" description="Create a dedicated follow-up item separate from the task queue.">
              <form className="grid gap-4" onSubmit={handleCreateFollowUp}>
                <FormSection title="Follow-up details" description="Use this for dedicated customer touchpoints that should stay separate from the general task queue.">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="follow-up-subject">Subject</FieldLabel>
                      <Input
                        id="follow-up-subject"
                        value={followUpSubject}
                        onChange={(event) => {
                          followUpForm.clearFieldError("subject");
                          setFollowUpSubject(event.target.value);
                        }}
                        placeholder="Check proposal status with customer"
                        required
                      />
                      <FieldError errors={followUpForm.fieldErrors.subject?.map((message) => ({ message }))} />
                    </Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="follow-up-channel">Channel</FieldLabel>
                        <Input
                          id="follow-up-channel"
                          value={followUpChannel}
                          onChange={(event) => setFollowUpChannel(event.target.value)}
                          placeholder="call"
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="follow-up-at">Scheduled at</FieldLabel>
                        <Input
                          id="follow-up-at"
                          type="datetime-local"
                          value={followUpScheduledAt}
                          onChange={(event) => setFollowUpScheduledAt(event.target.value)}
                          required
                        />
                      </Field>
                    </div>
                  </FieldGroup>
                </FormSection>
                <Field>
                  <FieldLabel htmlFor="follow-up-notes">Notes</FieldLabel>
                  <Textarea
                    id="follow-up-notes"
                    value={followUpNotes}
                    onChange={(event) => setFollowUpNotes(event.target.value)}
                    className="min-h-24"
                    placeholder="Outcome target, talking points, customer context..."
                  />
                </Field>
                <Button type="submit" disabled={followUpForm.submitting} className="w-fit">
                  {followUpForm.submitting ? "Scheduling..." : "Schedule follow-up"}
                </Button>
              </form>
          </CrudPanel>

          <CrudPanel title="Follow-up queue" description="Track scheduled customer touchpoints and mark outcomes as they happen.">
            <div className="grid gap-3">
              {followUps.map((followUp) => (
                <Card key={followUp.id} size="sm">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <span>{followUp.subject}</span>
                      <Badge
                        variant={
                          followUp.status === "completed"
                            ? "default"
                            : followUp.status === "pending"
                              ? "outline"
                              : "destructive"
                        }
                      >
                        {followUp.status}
                      </Badge>
                      <Badge variant="secondary">{followUp.channel}</Badge>
                    </CardTitle>
                    <CardDescription>{new Date(followUp.scheduledAt).toLocaleString()}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {followUp.notes ? <div className="text-sm text-muted-foreground">{followUp.notes}</div> : null}
                    {followUp.outcome ? <div className="text-sm text-muted-foreground">Outcome: {followUp.outcome}</div> : null}
                    <div className="flex flex-wrap gap-2">
                      {(["pending", "completed", "missed", "canceled"] as FollowUpStatus[]).map((status) => (
                        <Button
                          key={status}
                          type="button"
                          variant={followUp.status === status ? "default" : "outline"}
                          disabled={savingFollowUpId === followUp.id}
                          onClick={() => void updateFollowUp(followUp.id, status)}
                        >
                          {status}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {followUps.length === 0 ? (
                <EmptyState title="No follow-ups scheduled yet" description="Create a follow-up to start tracking dedicated customer touchpoints." />
              ) : null}
            </div>
          </CrudPanel>
        </div>
      </div>
    </AppShell>
  );
}
