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
  isRecurring: z.boolean().default(false),
  recurrenceRule: z.string().trim().max(120).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
});

export const updateTaskSchema = createTaskSchema.partial();
export const taskParamSchema = z.object({ taskId: z.string().uuid() });

export type ListTasksQuery = z.infer<typeof listTasksSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
