import { and, asc, count, desc, eq, ilike, isNull, lte } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { tasks } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { taskParamSchema } from "@/modules/tasks/schema";
import type { CreateTaskInput, ListTasksQuery, TaskCalendarQuery, UpdateTaskInput } from "@/modules/tasks/schema";

export async function listTasks(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListTasksQuery;

  const conditions = [eq(tasks.companyId, tenant.companyId), isNull(tasks.deletedAt)];
  if (query.q) {
    conditions.push(ilike(tasks.title, `%${query.q}%`));
  }
  if (query.status) {
    conditions.push(eq(tasks.status, query.status));
  }
  if (query.priority) {
    conditions.push(eq(tasks.priority, query.priority));
  }
  if (query.assignedToUserId) {
    conditions.push(eq(tasks.assignedToUserId, query.assignedToUserId));
  }
  if (query.overdueOnly) {
    conditions.push(lte(tasks.dueAt, new Date()));
  }

  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    db.select().from(tasks).where(where).orderBy(desc(tasks.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(tasks).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

function getMonthBounds(monthValue?: string) {
  const now = new Date();
  const [year, month] = monthValue
    ? monthValue.split("-").map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  return { start, end };
}

export async function getTaskSummary(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const now = new Date();

  const items = await db
    .select({
      id: tasks.id,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
    })
    .from(tasks)
    .where(and(eq(tasks.companyId, tenant.companyId), isNull(tasks.deletedAt)));

  const openTasks = items.filter((task) => task.status !== "done");
  const overdueTasks = openTasks.filter((task) => task.dueAt && new Date(task.dueAt) <= now);
  const dueTodayTasks = openTasks.filter((task) => {
    if (!task.dueAt) {
      return false;
    }

    const dueAt = new Date(task.dueAt);
    return dueAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  });

  return ok(c, {
    total: items.length,
    open: openTasks.length,
    overdue: overdueTasks.length,
    dueToday: dueTodayTasks.length,
    highPriorityOpen: openTasks.filter((task) => task.priority === "high").length,
    completed: items.filter((task) => task.status === "done").length,
  });
}

export async function getTaskCalendar(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as TaskCalendarQuery;
  const { start, end } = getMonthBounds(query.month);

  const items = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.companyId, tenant.companyId), isNull(tasks.deletedAt), lte(tasks.dueAt, end)))
    .orderBy(asc(tasks.dueAt), desc(tasks.createdAt));

  const days = new Map<string, Array<(typeof items)[number]>>();

  for (const task of items) {
    if (!task.dueAt) {
      continue;
    }

    const dueAt = new Date(task.dueAt);
    if (dueAt < start || dueAt >= end) {
      continue;
    }

    const key = dueAt.toISOString().slice(0, 10);
    const bucket = days.get(key) ?? [];
    bucket.push(task);
    days.set(key, bucket);
  }

  return ok(c, {
    month: start.toISOString().slice(0, 7),
    days: Array.from(days.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, dayItems]) => ({
        date,
        total: dayItems.length,
        overdue: dayItems.filter((task) => task.status !== "done" && task.dueAt && new Date(task.dueAt) < new Date()).length,
        items: dayItems,
      })),
  });
}

export async function createTask(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateTaskInput;

  const [created] = await db
    .insert(tasks)
    .values({
      companyId: tenant.companyId,
      storeId: body.storeId ?? tenant.storeId ?? null,
      customerId: body.customerId ?? null,
      dealId: body.dealId ?? null,
      assignedToUserId: body.assignedToUserId ?? null,
      title: body.title,
      description: body.description ?? null,
      status: body.status,
      priority: body.priority,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      completedAt: body.status === "done" ? new Date() : null,
      isRecurring: body.isRecurring,
      recurrenceRule: body.recurrenceRule ?? null,
      createdBy: user.id,
    })
    .returning();

  return ok(c, created, 201);
}

export async function updateTask(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = taskParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateTaskInput;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  let completedAt: Date | null | undefined = undefined;
  if (body.status === "done") {
    completedAt = new Date();
  } else if (body.status !== undefined) {
    completedAt = null;
  }

  const [updated] = await db
    .update(tasks)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description ?? null } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(body.dueAt) : null } : {}),
      ...(completedAt !== undefined ? { completedAt } : {}),
      ...(body.isRecurring !== undefined ? { isRecurring: body.isRecurring } : {}),
      ...(body.recurrenceRule !== undefined ? { recurrenceRule: body.recurrenceRule ?? null } : {}),
      ...(body.assignedToUserId !== undefined ? { assignedToUserId: body.assignedToUserId ?? null } : {}),
      ...(body.customerId !== undefined ? { customerId: body.customerId ?? null } : {}),
      ...(body.dealId !== undefined ? { dealId: body.dealId ?? null } : {}),
      ...(body.storeId !== undefined ? { storeId: body.storeId ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, params.taskId), eq(tasks.companyId, tenant.companyId), isNull(tasks.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Task not found");
  }

  return ok(c, updated);
}

export async function deleteTask(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = taskParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, params.taskId), eq(tasks.companyId, tenant.companyId), isNull(tasks.deletedAt)))
    .returning({ id: tasks.id });

  if (!deleted) {
    throw AppError.notFound("Task not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
}
