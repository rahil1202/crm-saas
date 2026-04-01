"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ApiError, apiRequest } from "@/lib/api";

type TaskStatus = "todo" | "in_progress" | "done" | "overdue";
type TaskPriority = "low" | "medium" | "high";

interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
}

interface ListResponse {
  items: Task[];
}

const statuses: TaskStatus[] = ["todo", "in_progress", "done", "overdue"];
const priorities: TaskPriority[] = ["low", "medium", "high"];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (statusFilter) {
      params.set("status", statusFilter);
    }

    try {
      const data = await apiRequest<ListResponse>(`/tasks?${params.toString()}`);
      setTasks(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load tasks");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await apiRequest("/tasks", {
        method: "POST",
        body: JSON.stringify({ title, priority }),
      });
      setTitle("");
      setPriority("medium");
      await loadTasks();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to create task");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (taskId: string, status: TaskStatus) => {
    try {
      await apiRequest(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadTasks();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update task");
    }
  };

  return (
    <AppShell
      title="Tasks & Follow-ups"
      description="Tenant-scoped task execution workspace with create/list/update operations."
    >
      <section style={{ background: "#fff", border: "1px solid #dbe1e8", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Create task</h2>
        <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Task title" required style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
          <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}>
            {priorities.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button type="submit" disabled={submitting} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#102031", color: "white" }}>
            {submitting ? "Creating..." : "Create"}
          </button>
        </form>
      </section>

      <section style={{ background: "#fff", border: "1px solid #dbe1e8", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Task list</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}>
            <option value="">All statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void loadTasks()} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}>
            Filter
          </button>
        </div>

        {error ? <p style={{ color: "#b02020" }}>{error}</p> : null}
        {loading ? <p>Loading tasks...</p> : null}

        {!loading ? (
          <div style={{ display: "grid", gap: 10 }}>
            {tasks.map((task) => (
              <article key={task.id} style={{ border: "1px solid #e1e6ec", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
                <strong>{task.title}</strong>
                <span style={{ color: "#556371" }}>Priority: {task.priority}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>Status</span>
                  <select value={task.status} onChange={(event) => void updateStatus(task.id, event.target.value as TaskStatus)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d2d9e0" }}>
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))}
            {tasks.length === 0 ? <p>No tasks found.</p> : null}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
