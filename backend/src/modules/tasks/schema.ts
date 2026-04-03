import { z } from "zod";

export const listTasksSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["todo", "in_progress", "done", "overdue"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  assignedToUserId: z.string().uuid().optional(),
  overdueOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(4000).optional(),
  status: z.enum(["todo", "in_progress", "done", "overdue"]).default("todo"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueAt: z.string().datetime().optional(),
  reminderMinutesBefore: z.coerce.number().int().min(0).max(60 * 24 * 30).default(24 * 60),
  isRecurring: z.boolean().default(false),
  recurrenceRule: z.string().trim().max(120).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
});

export const taskCalendarQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

export const taskReminderQuerySchema = z.object({
  windowHours: z.coerce.number().int().min(1).max(24 * 30).default(48),
  includeSent: z.coerce.boolean().default(false),
});

export const updateTaskSchema = createTaskSchema.partial();
export const taskParamSchema = z.object({ taskId: z.string().uuid() });

export type ListTasksQuery = z.infer<typeof listTasksSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type TaskCalendarQuery = z.infer<typeof taskCalendarQuerySchema>;
export type TaskReminderQuery = z.infer<typeof taskReminderQuerySchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
