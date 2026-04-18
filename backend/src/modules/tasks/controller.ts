import { and, asc, count, desc, eq, ilike, isNotNull, isNull, lte, or } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import {
  campaigns,
  companyCustomRoles,
  companyMemberships,
  customers,
  deals,
  followUps,
  leads,
  partnerCompanies,
  partnerUsers,
  profiles,
  taskAssociations,
  tasks,
  templates,
} from "@/db/schema";
import { ok } from "@/lib/api";
import { getCompanySettings } from "@/lib/company-settings";
import { AppError } from "@/lib/errors";
import { createNotification } from "@/lib/notifications";
import { followUpParamSchema, taskParamSchema } from "@/modules/tasks/schema";
import type {
  CreateFollowUpInput,
  CreateTaskInput,
  ListTaskAssociationOptionsQuery,
  ListTaskAssigneesQuery,
  ListFollowUpsQuery,
  ListTasksQuery,
  TaskAssociationInput,
  TaskCalendarQuery,
  TaskReminderQuery,
  UpdateFollowUpInput,
  UpdateTaskInput,
} from "@/modules/tasks/schema";

function buildTaskVisibilityConditions(input: {
  companyId: string;
  userId: string;
  role: "owner" | "admin" | "member";
}) {
  const conditions = [eq(tasks.companyId, input.companyId), isNull(tasks.deletedAt)];
  if (input.role === "member") {
    conditions.push(eq(tasks.assignedToUserId, input.userId));
  }
  return conditions;
}

type TaskAssociationRecord = {
  entityType: "contact" | "lead" | "deal" | "template" | "campaign";
  entityId: string;
  entityLabel: string;
  entitySubtitle: string | null;
};

function dedupeAssociations(associations: TaskAssociationInput[] | undefined) {
  const unique = new Map<string, TaskAssociationInput>();
  for (const association of associations ?? []) {
    unique.set(`${association.entityType}:${association.entityId}`, association);
  }
  return Array.from(unique.values());
}

async function resolveAssociationRecords(companyId: string, associations: TaskAssociationInput[]) {
  const deduped = dedupeAssociations(associations);
  if (deduped.length === 0) {
    return [] as TaskAssociationRecord[];
  }

  const idsByType = {
    contact: deduped.filter((item) => item.entityType === "contact").map((item) => item.entityId),
    lead: deduped.filter((item) => item.entityType === "lead").map((item) => item.entityId),
    deal: deduped.filter((item) => item.entityType === "deal").map((item) => item.entityId),
    template: deduped.filter((item) => item.entityType === "template").map((item) => item.entityId),
    campaign: deduped.filter((item) => item.entityType === "campaign").map((item) => item.entityId),
  };

  const [contactRows, leadRows, dealRows, templateRows, campaignRows] = await Promise.all([
    idsByType.contact.length
      ? db
          .select({ id: customers.id, label: customers.fullName, subtitle: customers.email })
          .from(customers)
          .where(and(eq(customers.companyId, companyId), isNull(customers.deletedAt), or(...idsByType.contact.map((id) => eq(customers.id, id)))!))
      : Promise.resolve([]),
    idsByType.lead.length
      ? db
          .select({ id: leads.id, label: leads.title, subtitle: leads.fullName })
          .from(leads)
          .where(and(eq(leads.companyId, companyId), isNull(leads.deletedAt), or(...idsByType.lead.map((id) => eq(leads.id, id)))!))
      : Promise.resolve([]),
    idsByType.deal.length
      ? db
          .select({ id: deals.id, label: deals.title, subtitle: deals.stage })
          .from(deals)
          .where(and(eq(deals.companyId, companyId), isNull(deals.deletedAt), or(...idsByType.deal.map((id) => eq(deals.id, id)))!))
      : Promise.resolve([]),
    idsByType.template.length
      ? db
          .select({ id: templates.id, label: templates.name, subtitle: templates.type })
          .from(templates)
          .where(and(eq(templates.companyId, companyId), isNull(templates.deletedAt), or(...idsByType.template.map((id) => eq(templates.id, id)))!))
      : Promise.resolve([]),
    idsByType.campaign.length
      ? db
          .select({ id: campaigns.id, label: campaigns.name, subtitle: campaigns.channel })
          .from(campaigns)
          .where(and(eq(campaigns.companyId, companyId), isNull(campaigns.deletedAt), or(...idsByType.campaign.map((id) => eq(campaigns.id, id)))!))
      : Promise.resolve([]),
  ]);

  const byKey = new Map<string, TaskAssociationRecord>();

  for (const row of contactRows) {
    byKey.set(`contact:${row.id}`, {
      entityType: "contact",
      entityId: row.id,
      entityLabel: row.label,
      entitySubtitle: row.subtitle ?? null,
    });
  }
  for (const row of leadRows) {
    byKey.set(`lead:${row.id}`, {
      entityType: "lead",
      entityId: row.id,
      entityLabel: row.label,
      entitySubtitle: row.subtitle ?? null,
    });
  }
  for (const row of dealRows) {
    byKey.set(`deal:${row.id}`, {
      entityType: "deal",
      entityId: row.id,
      entityLabel: row.label,
      entitySubtitle: row.subtitle ?? null,
    });
  }
  for (const row of templateRows) {
    byKey.set(`template:${row.id}`, {
      entityType: "template",
      entityId: row.id,
      entityLabel: row.label,
      entitySubtitle: row.subtitle ?? null,
    });
  }
  for (const row of campaignRows) {
    byKey.set(`campaign:${row.id}`, {
      entityType: "campaign",
      entityId: row.id,
      entityLabel: row.label,
      entitySubtitle: row.subtitle ?? null,
    });
  }

  const resolved = deduped
    .map((association) => byKey.get(`${association.entityType}:${association.entityId}`))
    .filter(Boolean) as TaskAssociationRecord[];

  if (resolved.length !== deduped.length) {
    throw AppError.badRequest("One or more associated records were not found");
  }

  return resolved;
}

async function syncTaskAssociations(input: {
  companyId: string;
  taskId: string;
  createdBy: string;
  associations: TaskAssociationInput[];
}) {
  const resolved = await resolveAssociationRecords(input.companyId, input.associations);

  await db.delete(taskAssociations).where(and(eq(taskAssociations.companyId, input.companyId), eq(taskAssociations.taskId, input.taskId)));

  if (resolved.length === 0) {
    return;
  }

  await db.insert(taskAssociations).values(
    resolved.map((association) => ({
      companyId: input.companyId,
      taskId: input.taskId,
      entityType: association.entityType,
      entityId: association.entityId,
      entityLabel: association.entityLabel,
      entitySubtitle: association.entitySubtitle,
      createdBy: input.createdBy,
    })),
  );
}

async function getTaskAssociationsByTaskIds(taskIds: string[]) {
  if (taskIds.length === 0) {
    return new Map<string, Array<{ entityType: string; entityId: string; entityLabel: string; entitySubtitle: string | null }>>();
  }

  const rows = await db
    .select({
      taskId: taskAssociations.taskId,
      entityType: taskAssociations.entityType,
      entityId: taskAssociations.entityId,
      entityLabel: taskAssociations.entityLabel,
      entitySubtitle: taskAssociations.entitySubtitle,
    })
    .from(taskAssociations)
    .where(or(...taskIds.map((taskId) => eq(taskAssociations.taskId, taskId)))!);

  const map = new Map<string, Array<{ entityType: string; entityId: string; entityLabel: string; entitySubtitle: string | null }>>();
  for (const row of rows) {
    const bucket = map.get(row.taskId) ?? [];
    bucket.push(row);
    map.set(row.taskId, bucket);
  }
  return map;
}

export async function listTasks(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const query = c.get("validatedQuery") as ListTasksQuery;

  const conditions = buildTaskVisibilityConditions({
    companyId: tenant.companyId,
    userId: user.id,
    role: tenant.role,
  });
  if (query.q) {
    conditions.push(ilike(tasks.title, `%${query.q}%`));
  }
  if (query.status) {
    conditions.push(eq(tasks.status, query.status));
  }
  if (query.priority) {
    conditions.push(eq(tasks.priority, query.priority));
  }
  if (query.taskType) {
    conditions.push(eq(tasks.taskType, query.taskType));
  }
  if (query.assignedToUserId) {
    conditions.push(eq(tasks.assignedToUserId, query.assignedToUserId));
  }
  if (query.overdueOnly) {
    conditions.push(lte(tasks.dueAt, new Date()));
  }

  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: tasks.id,
        companyId: tasks.companyId,
        storeId: tasks.storeId,
        customerId: tasks.customerId,
        dealId: tasks.dealId,
        assignedToUserId: tasks.assignedToUserId,
        title: tasks.title,
        description: tasks.description,
        taskType: tasks.taskType,
        status: tasks.status,
        priority: tasks.priority,
        dueAt: tasks.dueAt,
        reminderMinutesBefore: tasks.reminderMinutesBefore,
        reminderSentAt: tasks.reminderSentAt,
        completedAt: tasks.completedAt,
        isRecurring: tasks.isRecurring,
        recurrenceRule: tasks.recurrenceRule,
        createdBy: tasks.createdBy,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        assigneeName: profiles.fullName,
        assigneeEmail: profiles.email,
      })
      .from(tasks)
      .leftJoin(profiles, eq(profiles.id, tasks.assignedToUserId))
      .where(where)
      .orderBy(desc(tasks.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: count() }).from(tasks).where(where),
  ]);

  const associationsByTaskId = await getTaskAssociationsByTaskIds(items.map((item) => item.id));

  return ok(c, {
    items: items.map((item) => ({
      ...item,
      associations: associationsByTaskId.get(item.id) ?? [],
    })),
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function listTaskAssignees(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListTaskAssigneesQuery;
  const searchTerm = query.q?.trim();

  const memberConditions = [
    eq(companyMemberships.companyId, tenant.companyId),
    eq(companyMemberships.status, "active"),
    isNull(companyMemberships.deletedAt),
  ];
  if (searchTerm) {
    memberConditions.push(or(ilike(profiles.fullName, `%${searchTerm}%`), ilike(profiles.email, `%${searchTerm}%`))!);
  }

  const partnerConditions = [
    eq(partnerUsers.companyId, tenant.companyId),
    eq(partnerUsers.status, "active"),
    isNull(partnerUsers.deletedAt),
    isNotNull(partnerUsers.authUserId),
  ];
  if (searchTerm) {
    partnerConditions.push(
      or(
        ilike(partnerUsers.fullName, `%${searchTerm}%`),
        ilike(partnerUsers.email, `%${searchTerm}%`),
        ilike(partnerCompanies.name, `%${searchTerm}%`),
      )!,
    );
  }

  const [memberRows, partnerRows] = await Promise.all([
    db
      .select({
        userId: profiles.id,
        fullName: profiles.fullName,
        email: profiles.email,
        role: companyMemberships.role,
        customRoleName: companyCustomRoles.name,
      })
      .from(companyMemberships)
      .innerJoin(profiles, eq(profiles.id, companyMemberships.userId))
      .leftJoin(
        companyCustomRoles,
        and(eq(companyCustomRoles.id, companyMemberships.customRoleId), isNull(companyCustomRoles.deletedAt)),
      )
      .where(and(...memberConditions))
      .orderBy(asc(profiles.fullName), asc(profiles.email)),
    db
      .select({
        userId: partnerUsers.authUserId,
        fullName: partnerUsers.fullName,
        email: partnerUsers.email,
        partnerCompanyName: partnerCompanies.name,
      })
      .from(partnerUsers)
      .innerJoin(
        partnerCompanies,
        and(eq(partnerCompanies.id, partnerUsers.partnerCompanyId), isNull(partnerCompanies.deletedAt)),
      )
      .where(and(...partnerConditions))
      .orderBy(asc(partnerUsers.fullName), asc(partnerUsers.email)),
  ]);

  const assigneesByUser = new Map<string, {
    userId: string;
    fullName: string;
    email: string;
    kind: "employee" | "partner";
    badges: string[];
    partnerCompanyName: string | null;
  }>();

  for (const row of memberRows) {
    const fullName = row.fullName?.trim() || row.email;
    const badges = new Set<string>(["Employee"]);
    if (row.role === "member") {
      badges.add("Member");
    }
    if (row.customRoleName?.toLowerCase().includes("sales")) {
      badges.add("Sales");
    }
    assigneesByUser.set(row.userId, {
      userId: row.userId,
      fullName,
      email: row.email,
      kind: "employee",
      badges: Array.from(badges),
      partnerCompanyName: null,
    });
  }

  for (const row of partnerRows) {
    if (!row.userId) {
      continue;
    }

    const fullName = row.fullName?.trim() || row.email;
    const existing = assigneesByUser.get(row.userId);
    const badges = new Set<string>([...(existing?.badges ?? []), "Partner"]);
    if (fullName.toLowerCase().includes("sales")) {
      badges.add("Sales");
    }

    assigneesByUser.set(row.userId, {
      userId: row.userId,
      fullName,
      email: row.email,
      kind: "partner",
      badges: Array.from(badges),
      partnerCompanyName: row.partnerCompanyName,
    });
  }

  return ok(c, {
    items: Array.from(assigneesByUser.values()).sort((left, right) =>
      left.fullName.localeCompare(right.fullName, undefined, { sensitivity: "base" }),
    ),
  });
}

export async function listTaskAssociationOptions(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListTaskAssociationOptionsQuery;
  const searchTerm = query.q?.trim();

  if (query.entityType === "contact") {
    const rows = await db
      .select({ id: customers.id, label: customers.fullName, subtitle: customers.email })
      .from(customers)
      .where(
        and(
          eq(customers.companyId, tenant.companyId),
          isNull(customers.deletedAt),
          searchTerm
            ? or(ilike(customers.fullName, `%${searchTerm}%`), ilike(customers.email, `%${searchTerm}%`), ilike(customers.phone, `%${searchTerm}%`))
            : undefined,
        ),
      )
      .orderBy(asc(customers.fullName), asc(customers.createdAt))
      .limit(query.limit);

    return ok(c, { items: rows.map((row) => ({ entityType: "contact", entityId: row.id, entityLabel: row.label, entitySubtitle: row.subtitle })) });
  }

  if (query.entityType === "lead") {
    const rows = await db
      .select({ id: leads.id, label: leads.title, subtitle: leads.fullName })
      .from(leads)
      .where(
        and(
          eq(leads.companyId, tenant.companyId),
          isNull(leads.deletedAt),
          searchTerm
            ? or(ilike(leads.title, `%${searchTerm}%`), ilike(leads.fullName, `%${searchTerm}%`), ilike(leads.email, `%${searchTerm}%`))
            : undefined,
        ),
      )
      .orderBy(asc(leads.title), asc(leads.createdAt))
      .limit(query.limit);

    return ok(c, { items: rows.map((row) => ({ entityType: "lead", entityId: row.id, entityLabel: row.label, entitySubtitle: row.subtitle })) });
  }

  if (query.entityType === "deal") {
    const rows = await db
      .select({ id: deals.id, label: deals.title, subtitle: deals.stage })
      .from(deals)
      .where(
        and(
          eq(deals.companyId, tenant.companyId),
          isNull(deals.deletedAt),
          searchTerm
            ? or(ilike(deals.title, `%${searchTerm}%`), ilike(deals.stage, `%${searchTerm}%`), ilike(deals.dealType, `%${searchTerm}%`))
            : undefined,
        ),
      )
      .orderBy(asc(deals.title), asc(deals.createdAt))
      .limit(query.limit);

    return ok(c, { items: rows.map((row) => ({ entityType: "deal", entityId: row.id, entityLabel: row.label, entitySubtitle: row.subtitle })) });
  }

  if (query.entityType === "template") {
    const rows = await db
      .select({ id: templates.id, label: templates.name, subtitle: templates.type })
      .from(templates)
      .where(
        and(
          eq(templates.companyId, tenant.companyId),
          isNull(templates.deletedAt),
          searchTerm
            ? or(ilike(templates.name, `%${searchTerm}%`), ilike(templates.type, `%${searchTerm}%`), ilike(templates.subject, `%${searchTerm}%`))
            : undefined,
        ),
      )
      .orderBy(asc(templates.name), asc(templates.createdAt))
      .limit(query.limit);

    return ok(c, { items: rows.map((row) => ({ entityType: "template", entityId: row.id, entityLabel: row.label, entitySubtitle: row.subtitle })) });
  }

  const rows = await db
    .select({ id: campaigns.id, label: campaigns.name, subtitle: campaigns.channel })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.companyId, tenant.companyId),
        isNull(campaigns.deletedAt),
        searchTerm
          ? or(ilike(campaigns.name, `%${searchTerm}%`), ilike(campaigns.channel, `%${searchTerm}%`), ilike(campaigns.status, `%${searchTerm}%`))
          : undefined,
      ),
    )
    .orderBy(asc(campaigns.name), asc(campaigns.createdAt))
    .limit(query.limit);

  return ok(c, { items: rows.map((row) => ({ entityType: "campaign", entityId: row.id, entityLabel: row.label, entitySubtitle: row.subtitle })) });
}

export async function getTaskById(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = taskParamSchema.parse(c.req.param());

  const conditions = [eq(tasks.id, params.taskId), ...buildTaskVisibilityConditions({
    companyId: tenant.companyId,
    userId: user.id,
    role: tenant.role,
  })];

  const [task] = await db
    .select({
      id: tasks.id,
      companyId: tasks.companyId,
      storeId: tasks.storeId,
      customerId: tasks.customerId,
      dealId: tasks.dealId,
      assignedToUserId: tasks.assignedToUserId,
      title: tasks.title,
      description: tasks.description,
      taskType: tasks.taskType,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      reminderMinutesBefore: tasks.reminderMinutesBefore,
      reminderSentAt: tasks.reminderSentAt,
      completedAt: tasks.completedAt,
      isRecurring: tasks.isRecurring,
      recurrenceRule: tasks.recurrenceRule,
      createdBy: tasks.createdBy,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      assigneeName: profiles.fullName,
      assigneeEmail: profiles.email,
    })
    .from(tasks)
    .leftJoin(profiles, eq(profiles.id, tasks.assignedToUserId))
    .where(and(...conditions))
    .limit(1);

  if (!task) {
    throw AppError.notFound("Task not found");
  }

  const associationsByTaskId = await getTaskAssociationsByTaskIds([task.id]);

  return ok(c, { task: { ...task, associations: associationsByTaskId.get(task.id) ?? [] } });
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
  const user = c.get("user");
  const now = new Date();

  const where = and(...buildTaskVisibilityConditions({
    companyId: tenant.companyId,
    userId: user.id,
    role: tenant.role,
  }));

  const items = await db
    .select({
      id: tasks.id,
      status: tasks.status,
      priority: tasks.priority,
      dueAt: tasks.dueAt,
      reminderSentAt: tasks.reminderSentAt,
      reminderMinutesBefore: tasks.reminderMinutesBefore,
    })
    .from(tasks)
    .where(where);

  const openTasks = items.filter((task) => task.status !== "done");
  const overdueTasks = openTasks.filter((task) => task.dueAt && new Date(task.dueAt) <= now);
  const dueTodayTasks = openTasks.filter((task) => {
    if (!task.dueAt) {
      return false;
    }

    const dueAt = new Date(task.dueAt);
    return dueAt.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  });
  const reminderReadyTasks = openTasks.filter((task) => {
    if (!task.dueAt) {
      return false;
    }

    const reminderAt = new Date(new Date(task.dueAt).getTime() - (task.reminderMinutesBefore ?? 0) * 60 * 1000);
    return reminderAt <= now && !task.reminderSentAt;
  });

  return ok(c, {
    total: items.length,
    open: openTasks.length,
    overdue: overdueTasks.length,
    dueToday: dueTodayTasks.length,
    reminderReady: reminderReadyTasks.length,
    highPriorityOpen: openTasks.filter((task) => task.priority === "high").length,
    completed: items.filter((task) => task.status === "done").length,
  });
}

export async function getTaskReminders(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const query = c.get("validatedQuery") as TaskReminderQuery;
  const now = new Date();
  const windowEnd = new Date(now.getTime() + query.windowHours * 60 * 60 * 1000);

  const baseConditions = buildTaskVisibilityConditions({
    companyId: tenant.companyId,
    userId: user.id,
    role: tenant.role,
  });

  const items = await db
    .select()
    .from(tasks)
    .where(
      and(
        ...baseConditions,
        or(eq(tasks.status, "todo"), eq(tasks.status, "in_progress"), eq(tasks.status, "overdue")),
        lte(tasks.dueAt, windowEnd),
      ),
    )
    .orderBy(asc(tasks.dueAt), desc(tasks.priority), desc(tasks.createdAt));

  const reminders = items
    .filter((task) => task.dueAt)
    .filter((task) => query.includeSent || !task.reminderSentAt)
    .map((task) => {
      const dueAt = new Date(task.dueAt as Date | string);
      const reminderAt = new Date(dueAt.getTime() - task.reminderMinutesBefore * 60 * 1000);
      return {
        ...task,
        reminderAt: reminderAt.toISOString(),
        reminderReady: reminderAt <= now && !task.reminderSentAt,
        dueSoon: dueAt <= windowEnd,
      };
    })
    .filter((task) => task.dueSoon);

  return ok(c, {
    windowHours: query.windowHours,
    items: reminders,
    summary: {
      total: reminders.length,
      ready: reminders.filter((task) => task.reminderReady).length,
      sent: reminders.filter((task) => task.reminderSentAt).length,
    },
  });
}

export async function getTaskCalendar(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const query = c.get("validatedQuery") as TaskCalendarQuery;
  const { start, end } = getMonthBounds(query.month);

  const baseConditions = buildTaskVisibilityConditions({
    companyId: tenant.companyId,
    userId: user.id,
    role: tenant.role,
  });

  const items = await db
    .select()
    .from(tasks)
    .where(and(...baseConditions, lte(tasks.dueAt, end)))
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

export async function listFollowUps(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const query = c.get("validatedQuery") as ListFollowUpsQuery;

  const conditions = [eq(followUps.companyId, tenant.companyId), isNull(followUps.deletedAt)];
  if (query.q) {
    conditions.push(ilike(followUps.subject, `%${query.q}%`));
  }
  if (query.status) {
    conditions.push(eq(followUps.status, query.status));
  }
  if (query.assignedToUserId) {
    conditions.push(eq(followUps.assignedToUserId, query.assignedToUserId));
  }
  if (tenant.role === "member") {
    conditions.push(eq(followUps.assignedToUserId, user.id));
  }

  const where = and(...conditions);
  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(followUps)
      .where(where)
      .orderBy(asc(followUps.scheduledAt), desc(followUps.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: count() }).from(followUps).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function createTask(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateTaskInput;
  const defaultAssignee = tenant.role === "member" ? user.id : null;

  const [created] = await db
    .insert(tasks)
    .values({
      companyId: tenant.companyId,
      storeId: body.storeId ?? tenant.storeId ?? null,
      customerId: body.customerId ?? null,
      dealId: body.dealId ?? null,
      assignedToUserId: body.assignedToUserId ?? defaultAssignee,
      title: body.title,
      description: body.description ?? null,
      taskType: body.taskType,
      status: body.status,
      priority: body.priority,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      reminderMinutesBefore: body.reminderMinutesBefore,
      reminderSentAt: null,
      completedAt: body.status === "done" ? new Date() : null,
      isRecurring: body.isRecurring,
      recurrenceRule: body.recurrenceRule ?? null,
      createdBy: user.id,
    })
    .returning();

  await syncTaskAssociations({
    companyId: tenant.companyId,
    taskId: created.id,
    createdBy: user.id,
    associations: body.associations ?? [],
  });

  await createNotification({
    companyId: tenant.companyId,
    type: "task",
    title: "New task created",
    message: created.dueAt
      ? `${created.title} is due ${new Date(created.dueAt).toLocaleDateString("en-US", { timeZone: "UTC" })}`
      : `${created.title} was created without a due date`,
    entityId: created.id,
    entityPath: `/dashboard/tasks/${created.id}`,
    payload: {
      status: created.status,
      priority: created.priority,
    },
  });

  return ok(c, created, 201);
}

export async function createFollowUp(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateFollowUpInput;

  const [created] = await db
    .insert(followUps)
    .values({
      companyId: tenant.companyId,
      storeId: body.storeId ?? tenant.storeId ?? null,
      leadId: body.leadId ?? null,
      customerId: body.customerId ?? null,
      dealId: body.dealId ?? null,
      assignedToUserId: body.assignedToUserId ?? null,
      subject: body.subject,
      channel: body.channel,
      status: body.status,
      scheduledAt: new Date(body.scheduledAt),
      completedAt: body.status === "completed" ? new Date() : null,
      notes: body.notes ?? null,
      outcome: body.outcome ?? null,
      createdBy: user.id,
    })
    .returning();

  await createNotification({
    companyId: tenant.companyId,
    type: "task",
    title: "Follow-up scheduled",
    message: `${created.subject} is scheduled for ${new Date(created.scheduledAt).toLocaleString("en-US", { timeZone: "UTC" })}`,
    entityId: created.id,
    entityPath: "/dashboard/tasks",
    payload: {
      channel: created.channel,
      status: created.status,
    },
  });

  return ok(c, created, 201);
}

export async function updateTask(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = taskParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateTaskInput;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  let completedAt: Date | null | undefined = undefined;
  let reminderSentAt: Date | null | undefined = undefined;
  if (body.status === "done") {
    completedAt = new Date();
  } else if (body.status !== undefined) {
    completedAt = null;
  }
  if (body.dueAt !== undefined || body.reminderMinutesBefore !== undefined) {
    reminderSentAt = null;
  }

  const [updated] = await db
    .update(tasks)
    .set({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description ?? null } : {}),
      ...(body.taskType !== undefined ? { taskType: body.taskType } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(body.dueAt) : null } : {}),
      ...(body.reminderMinutesBefore !== undefined ? { reminderMinutesBefore: body.reminderMinutesBefore } : {}),
      ...(completedAt !== undefined ? { completedAt } : {}),
      ...(reminderSentAt !== undefined ? { reminderSentAt } : {}),
      ...(body.isRecurring !== undefined ? { isRecurring: body.isRecurring } : {}),
      ...(body.recurrenceRule !== undefined ? { recurrenceRule: body.recurrenceRule ?? null } : {}),
      ...(body.assignedToUserId !== undefined ? { assignedToUserId: body.assignedToUserId ?? null } : {}),
      ...(body.customerId !== undefined ? { customerId: body.customerId ?? null } : {}),
      ...(body.dealId !== undefined ? { dealId: body.dealId ?? null } : {}),
      ...(body.storeId !== undefined ? { storeId: body.storeId ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tasks.id, params.taskId),
        ...buildTaskVisibilityConditions({
          companyId: tenant.companyId,
          userId: user.id,
          role: tenant.role,
        }),
      ),
    )
    .returning();

  if (!updated) {
    throw AppError.notFound("Task not found");
  }

  if (body.associations !== undefined) {
    await syncTaskAssociations({
      companyId: tenant.companyId,
      taskId: updated.id,
      createdBy: user.id,
      associations: body.associations,
    });
  }

  return ok(c, updated);
}

export async function updateFollowUp(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = followUpParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateFollowUpInput;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  let completedAt: Date | null | undefined = undefined;
  if (body.status === "completed") {
    completedAt = new Date();
  } else if (body.status !== undefined) {
    completedAt = null;
  }

  const [updated] = await db
    .update(followUps)
    .set({
      ...(body.subject !== undefined ? { subject: body.subject } : {}),
      ...(body.channel !== undefined ? { channel: body.channel } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.scheduledAt !== undefined ? { scheduledAt: new Date(body.scheduledAt) } : {}),
      ...(completedAt !== undefined ? { completedAt } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      ...(body.outcome !== undefined ? { outcome: body.outcome ?? null } : {}),
      ...(body.assignedToUserId !== undefined ? { assignedToUserId: body.assignedToUserId ?? null } : {}),
      ...(body.leadId !== undefined ? { leadId: body.leadId ?? null } : {}),
      ...(body.customerId !== undefined ? { customerId: body.customerId ?? null } : {}),
      ...(body.dealId !== undefined ? { dealId: body.dealId ?? null } : {}),
      ...(body.storeId !== undefined ? { storeId: body.storeId ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(followUps.id, params.followUpId), eq(followUps.companyId, tenant.companyId), isNull(followUps.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Follow-up not found");
  }

  return ok(c, updated);
}

export async function deleteTask(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = taskParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(tasks.id, params.taskId),
        ...buildTaskVisibilityConditions({
          companyId: tenant.companyId,
          userId: user.id,
          role: tenant.role,
        }),
      ),
    )
    .returning({ id: tasks.id });

  if (!deleted) {
    throw AppError.notFound("Task not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
}

export async function deleteFollowUp(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = followUpParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(followUps)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(followUps.id, params.followUpId), eq(followUps.companyId, tenant.companyId), isNull(followUps.deletedAt)))
    .returning({ id: followUps.id });

  if (!deleted) {
    throw AppError.notFound("Follow-up not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
}

export async function sendTaskReminder(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = taskParamSchema.parse(c.req.param());
  const settings = await getCompanySettings(tenant.companyId);

  if (!settings.notificationRules.taskReminders) {
    throw AppError.conflict("Task reminders are disabled in company notification settings");
  }

  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.id, params.taskId),
        ...buildTaskVisibilityConditions({
          companyId: tenant.companyId,
          userId: user.id,
          role: tenant.role,
        }),
      ),
    )
    .limit(1);

  if (!task) {
    throw AppError.notFound("Task not found");
  }

  if (task.status === "done") {
    throw AppError.conflict("Completed tasks cannot send reminders");
  }

  const dueLabel = task.dueAt
    ? new Date(task.dueAt).toLocaleString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "without a due date";

  await createNotification({
    companyId: tenant.companyId,
    type: "task",
    title: "Follow-up reminder",
    message: `${task.title} is due ${dueLabel}`,
    entityId: task.id,
    entityPath: `/dashboard/tasks/${task.id}`,
    payload: {
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt,
      reminderMinutesBefore: task.reminderMinutesBefore,
    },
  });

  const [updated] = await db
    .update(tasks)
    .set({
      reminderSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, task.id))
    .returning();

  return ok(c, updated);
}
