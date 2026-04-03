import { and, count, desc, eq, ilike, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { automationRuns, automations } from "@/db/schema";
import { ok } from "@/lib/api";
import { cancelAutomationRun, enqueueAutomationRun, getAutomationRunDetail, listAutomationRuns } from "@/lib/automation-runtime";
import { AppError } from "@/lib/errors";
import { automationParamSchema, automationRunParamSchema } from "@/modules/automation/schema";
import type { CreateAutomationInput, ListAutomationRunsQuery, ListAutomationsQuery, UpdateAutomationInput } from "@/modules/automation/schema";

export function getAutomationOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "automation",
    capabilities: ["builder", "trigger-conditions", "actions", "multi-step-workflows", "automation-logs"],
  });
}

async function loadAutomationLogs(companyId: string, automationIds: string[]) {
  if (automationIds.length === 0) {
    return new Map<string, Array<{ id: string; status: "queued" | "running" | "completed" | "failed" | "canceled"; message: string; executedAt: Date }>>();
  }

  const rows = await db
    .select({
      id: automationRuns.id,
      automationId: automationRuns.automationId,
      status: automationRuns.status,
      message: automationRuns.message,
      executedAt: automationRuns.executedAt,
    })
    .from(automationRuns)
    .where(and(eq(automationRuns.companyId, companyId)))
    .orderBy(desc(automationRuns.executedAt));

  const logsByAutomation = new Map<string, Array<{ id: string; status: "queued" | "running" | "completed" | "failed" | "canceled"; message: string; executedAt: Date }>>();

  for (const row of rows) {
    if (!automationIds.includes(row.automationId)) {
      continue;
    }
    const bucket = logsByAutomation.get(row.automationId) ?? [];
    if (bucket.length < 5) {
      bucket.push({
        id: row.id,
        status: row.status,
        message: row.message,
        executedAt: row.executedAt,
      });
      logsByAutomation.set(row.automationId, bucket);
    }
  }

  return logsByAutomation;
}

export async function listAutomations(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListAutomationsQuery;

  const conditions = [eq(automations.companyId, tenant.companyId), isNull(automations.deletedAt)];
  if (query.q) {
    conditions.push(ilike(automations.name, `%${query.q}%`));
  }
  if (query.status) {
    conditions.push(eq(automations.status, query.status));
  }

  const where = and(...conditions);
  const [items, totalRows] = await Promise.all([
    db.select().from(automations).where(where).orderBy(desc(automations.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(automations).where(where),
  ]);

  const logsByAutomation = await loadAutomationLogs(tenant.companyId, items.map((item) => item.id));

  return ok(c, {
    items: items.map((item) => ({
      ...item,
      logs: logsByAutomation.get(item.id) ?? [],
    })),
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function createAutomation(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateAutomationInput;

  const [created] = await db
    .insert(automations)
    .values({
      companyId: tenant.companyId,
      name: body.name,
      status: body.status,
      triggerType: body.triggerType,
      triggerConfig: body.triggerConfig,
      actions: body.actions,
      notes: body.notes ?? null,
      createdBy: user.id,
    })
    .returning();

  return ok(c, created, 201);
}

export async function updateAutomation(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = automationParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateAutomationInput;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  const [updated] = await db
    .update(automations)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.triggerType !== undefined ? { triggerType: body.triggerType } : {}),
      ...(body.triggerConfig !== undefined ? { triggerConfig: body.triggerConfig } : {}),
      ...(body.actions !== undefined ? { actions: body.actions } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(automations.id, params.automationId), eq(automations.companyId, tenant.companyId), isNull(automations.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Automation not found");
  }

  return ok(c, updated);
}

export async function runAutomationTest(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = automationParamSchema.parse(c.req.param());

  const [automation] = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, params.automationId), eq(automations.companyId, tenant.companyId), isNull(automations.deletedAt)))
    .limit(1);

  if (!automation) {
    throw AppError.notFound("Automation not found");
  }

  const run = await enqueueAutomationRun({
    companyId: tenant.companyId,
    automationId: automation.id,
    triggerType: automation.triggerType,
    payload: {
      triggerType: automation.triggerType,
      actionCount: automation.actions.length,
      source: "manual_test",
    },
  });

  return ok(c, run, 201);
}

export async function listRuns(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListAutomationRunsQuery;

  const items = await listAutomationRuns(tenant.companyId, query.automationId);
  return ok(c, { items });
}

export async function getRun(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = automationRunParamSchema.parse(c.req.param());

  const detail = await getAutomationRunDetail(tenant.companyId, params.runId);
  return ok(c, detail);
}

export async function cancelRun(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = automationRunParamSchema.parse(c.req.param());

  const run = await cancelAutomationRun(tenant.companyId, params.runId);
  return ok(c, run);
}

export async function deleteAutomation(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = automationParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(automations)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(automations.id, params.automationId), eq(automations.companyId, tenant.companyId), isNull(automations.deletedAt)))
    .returning({ id: automations.id });

  if (!deleted) {
    throw AppError.notFound("Automation not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
}
