import { Hono } from "hono";

import { ok } from "@/lib/api";

export const taskRoutes = new Hono().basePath("/tasks");

taskRoutes.get("/", (c) =>
  ok(c, {
    module: "tasks",
    capabilities: ["task-creation", "follow-up-reminders", "calendar-view", "recurring-tasks", "overdue-alerts"],
  }),
);
