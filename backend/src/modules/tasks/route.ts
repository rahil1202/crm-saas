import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  createFollowUp,
  createTask,
  deleteFollowUp,
  deleteTask,
  getTaskCalendar,
  getTaskReminders,
  getTaskSummary,
  listFollowUps,
  listTasks,
  sendTaskReminder,
  updateFollowUp,
  updateTask,
} from "@/modules/tasks/controller";
import {
  createFollowUpSchema,
  createTaskSchema,
  listFollowUpsSchema,
  listTasksSchema,
  taskCalendarQuerySchema,
  taskReminderQuerySchema,
  updateFollowUpSchema,
  updateTaskSchema,
} from "@/modules/tasks/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const taskRoutes = new Hono<AppEnv>().basePath("/tasks");
taskRoutes.use("*", requireAuth, requireTenant, requireModuleAccess("tasks"));

taskRoutes.get("/", validateQuery(listTasksSchema), listTasks);
taskRoutes.get("/summary", getTaskSummary);
taskRoutes.get("/calendar", validateQuery(taskCalendarQuerySchema), getTaskCalendar);
taskRoutes.get("/reminders", validateQuery(taskReminderQuerySchema), getTaskReminders);
taskRoutes.get("/follow-ups", validateQuery(listFollowUpsSchema), listFollowUps);
taskRoutes.post("/", validateJson(createTaskSchema), createTask);
taskRoutes.post("/follow-ups", validateJson(createFollowUpSchema), createFollowUp);
taskRoutes.post("/:taskId/send-reminder", sendTaskReminder);
taskRoutes.patch("/:taskId", validateJson(updateTaskSchema), updateTask);
taskRoutes.patch("/follow-ups/:followUpId", validateJson(updateFollowUpSchema), updateFollowUp);
taskRoutes.delete("/:taskId", deleteTask);
taskRoutes.delete("/follow-ups/:followUpId", deleteFollowUp);
