import { z } from "zod";

export const taskAssociationEntityTypeSchema = z.enum(["contact", "lead", "deal", "template", "campaign"]);

export const taskAssociationInputSchema = z.object({
  entityType: taskAssociationEntityTypeSchema,
  entityId: z.string().uuid(),
});

export const listTasksSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["todo", "in_progress", "done", "overdue"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  taskType: z.enum(["to_do", "call", "meeting", "follow_up"]).optional(),
  assignedToUserId: z.string().uuid().optional(),
  overdueOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listTaskAssigneesSchema = z.object({
  q: z.string().trim().max(120).optional(),
});

export const listTaskAssociationOptionsSchema = z.object({
  entityType: taskAssociationEntityTypeSchema,
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(4000).optional(),
  taskType: z.enum(["to_do", "call", "meeting", "follow_up"]).default("to_do"),
  status: z.enum(["todo", "in_progress", "done", "overdue"]).default("todo"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueAt: z.string().datetime().optional(),
  reminderMinutesBefore: z.coerce.number().int().min(0).max(60 * 24 * 30).default(24 * 60),
  isRecurring: z.boolean().default(false),
  recurrenceRule: z.string().trim().max(120).optional(),
  associations: z.array(taskAssociationInputSchema).max(50).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
});

export const listFollowUpsSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(["pending", "completed", "missed", "canceled"]).optional(),
  assignedToUserId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createFollowUpSchema = z.object({
  subject: z.string().trim().min(1).max(180),
  channel: z.string().trim().min(2).max(40).default("call"),
  status: z.enum(["pending", "completed", "missed", "canceled"]).default("pending"),
  scheduledAt: z.string().datetime(),
  notes: z.string().trim().max(4000).optional(),
  outcome: z.string().trim().max(240).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
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
export const updateFollowUpSchema = createFollowUpSchema.partial();
export const taskParamSchema = z.object({ taskId: z.string().uuid() });
export const followUpParamSchema = z.object({ followUpId: z.string().uuid() });

export type ListTasksQuery = z.infer<typeof listTasksSchema>;
export type ListTaskAssigneesQuery = z.infer<typeof listTaskAssigneesSchema>;
export type ListTaskAssociationOptionsQuery = z.infer<typeof listTaskAssociationOptionsSchema>;
export type TaskAssociationInput = z.infer<typeof taskAssociationInputSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type ListFollowUpsQuery = z.infer<typeof listFollowUpsSchema>;
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;
export type TaskCalendarQuery = z.infer<typeof taskCalendarQuerySchema>;
export type TaskReminderQuery = z.infer<typeof taskReminderQuerySchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type UpdateFollowUpInput = z.infer<typeof updateFollowUpSchema>;
