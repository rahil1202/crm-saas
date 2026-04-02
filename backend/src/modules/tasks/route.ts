import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { createTask, deleteTask, getTaskCalendar, getTaskSummary, listTasks, updateTask } from "@/modules/tasks/controller";
import { createTaskSchema, listTasksSchema, taskCalendarQuerySchema, updateTaskSchema } from "@/modules/tasks/schema";
import { requireAuth, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const taskRoutes = new Hono<AppEnv>().basePath("/tasks");
taskRoutes.use("*", requireAuth, requireTenant);

taskRoutes.get("/", validateQuery(listTasksSchema), listTasks);
taskRoutes.get("/summary", getTaskSummary);
taskRoutes.get("/calendar", validateQuery(taskCalendarQuerySchema), getTaskCalendar);
taskRoutes.post("/", validateJson(createTaskSchema), createTask);
taskRoutes.patch("/:taskId", validateJson(updateTaskSchema), updateTask);
taskRoutes.delete("/:taskId", deleteTask);
