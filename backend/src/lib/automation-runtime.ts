import { and, asc, desc, eq, ilike, isNull, lte } from "drizzle-orm";

import { db } from "@/db/client";
import {
  automationRunSteps,
  automationRuns,
  automationTriggerEvents,
  automations,
  customers,
  dealActivities,
  deals,
  leadActivities,
  leads,
  tasks,
} from "@/db/schema";
import { processQueuedEmailMessages, queueLeadEmail } from "@/lib/email-runtime";
import { AppError } from "@/lib/errors";
import { processDueSequenceRuns } from "@/lib/sequence-runtime";
import { sendWhatsappMessage, expireConversationStates } from "@/lib/whatsapp-runtime";

type RuntimeContext = Record<string, unknown> & {
  leadId?: string | null;
  dealId?: string | null;
  customerId?: string | null;
  variables?: Record<string, unknown>;
  __testMode?: boolean;
};

type AutomationActionRecord = {
  type: string;
  config: Record<string, unknown>;
};

type ExecutorResult =
  | { status: "completed"; output?: Record<string, unknown>; nextActionIndex?: number }
  | { status: "scheduled"; nextRunAt: Date; output?: Record<string, unknown> };

let workerStarted = false;
let workerTimer: Timer | null = null;
let workerBusy = false;
let lastLeadInactiveScanAt = 0;

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function actionParallelKey(action: AutomationActionRecord) {
  const parallelKey = asString(action.config.parallelKey);
  return parallelKey;
}

function resolveId(configValue: unknown, contextValue: unknown) {
  return asString(configValue) ?? asString(contextValue);
}

function getContextValue(context: Record<string, unknown>, fieldPath: string) {
  const segments = fieldPath.split(".").filter(Boolean);
  let cursor: unknown = context;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object") {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function evaluateSimpleCondition(condition: Record<string, unknown>, context: Record<string, unknown>) {
  const field = asString(condition.field);
  if (!field) {
    return true;
  }
  const operator = asString(condition.operator) ?? "equals";
  const expected = condition.value;
  const actual = getContextValue(context, field);

  if (operator === "equals") return actual === expected;
  if (operator === "not_equals") return actual !== expected;
  if (operator === "gt") return asNumber(actual, Number.NEGATIVE_INFINITY) > asNumber(expected, Number.POSITIVE_INFINITY);
  if (operator === "gte") return asNumber(actual, Number.NEGATIVE_INFINITY) >= asNumber(expected, Number.POSITIVE_INFINITY);
  if (operator === "lt") return asNumber(actual, Number.POSITIVE_INFINITY) < asNumber(expected, Number.NEGATIVE_INFINITY);
  if (operator === "lte") return asNumber(actual, Number.POSITIVE_INFINITY) <= asNumber(expected, Number.NEGATIVE_INFINITY);
  if (operator === "contains") return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  if (operator === "in") return Array.isArray(expected) && expected.includes(actual);

  return true;
}

export function evaluateActionCondition(condition: Record<string, unknown> | undefined, context: RuntimeContext): boolean {
  if (!condition) {
    return true;
  }
  const scope = context as Record<string, unknown>;

  const all = Array.isArray(condition.all) ? condition.all : null;
  if (all) {
    return all.every((item) => evaluateActionCondition((item as Record<string, unknown>) ?? {}, context));
  }

  const any = Array.isArray(condition.any) ? condition.any : null;
  if (any) {
    return any.some((item) => evaluateActionCondition((item as Record<string, unknown>) ?? {}, context));
  }

  if (condition.not && typeof condition.not === "object") {
    return !evaluateActionCondition(condition.not as Record<string, unknown>, context);
  }

  return evaluateSimpleCondition(condition, scope);
}

async function upsertRunStep(input: {
  companyId: string;
  automationRunId: string;
  actionIndex: number;
  actionType: string;
  status: "pending" | "running" | "completed" | "failed" | "canceled" | "scheduled";
  attemptCount?: number;
  parallelKey?: string | null;
  nextAttemptAt?: Date | null;
  lastError?: string | null;
  output?: Record<string, unknown>;
  startedAt?: Date | null;
  completedAt?: Date | null;
}) {
  const [row] = await db
    .insert(automationRunSteps)
    .values({
      companyId: input.companyId,
      automationRunId: input.automationRunId,
      actionIndex: input.actionIndex,
      actionType: input.actionType,
      status: input.status,
      attemptCount: input.attemptCount ?? 0,
      parallelKey: input.parallelKey ?? null,
      nextAttemptAt: input.nextAttemptAt ?? null,
      lastError: input.lastError ?? null,
      output: input.output ?? {},
      startedAt: input.startedAt ?? null,
      completedAt: input.completedAt ?? null,
    })
    .onConflictDoUpdate({
      target: [automationRunSteps.automationRunId, automationRunSteps.actionIndex],
      set: {
        status: input.status,
        attemptCount: input.attemptCount ?? 0,
        parallelKey: input.parallelKey ?? null,
        nextAttemptAt: input.nextAttemptAt ?? null,
        lastError: input.lastError ?? null,
        output: input.output ?? {},
        startedAt: input.startedAt ?? null,
        completedAt: input.completedAt ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}

async function addLeadActivity(input: { companyId: string; leadId: string; actorUserId: string; type: string; payload: Record<string, unknown> }) {
  await db.insert(leadActivities).values(input);
}

async function addDealActivity(input: { companyId: string; dealId: string; actorUserId: string; type: string; payload: Record<string, unknown> }) {
  await db.insert(dealActivities).values(input);
}

async function executeAction(input: {
  companyId: string;
  createdBy: string;
  automationId: string;
  automationRunId: string;
  actionIndex: number;
  action: AutomationActionRecord;
  context: RuntimeContext;
}) {
  const { action, context } = input;
  const config = action.config ?? {};
  const isTestMode = context.__testMode === true;

  if (!evaluateActionCondition((action as { condition?: Record<string, unknown> }).condition, context)) {
    return {
      status: "completed",
      output: { skipped: true, reason: "condition_not_met" },
    } satisfies ExecutorResult;
  }

  if (action.type === "condition.branch") {
    const field = asString(config.field);
    const equals = config.equals;
    const actual = field ? (context as Record<string, unknown>)[field] : undefined;
    const isTrue = field ? actual === equals : false;
    const nextActionIndex = isTrue ? asNumber(config.onTrueActionIndex, input.actionIndex + 1) : asNumber(config.onFalseActionIndex, input.actionIndex + 1);
    return {
      status: "completed",
      output: { branchResult: isTrue, field, actual, expected: equals },
      nextActionIndex,
    } satisfies ExecutorResult;
  }

  if (action.type === "delay") {
    const runAtRaw = asString(config.runAt);
    if (runAtRaw) {
      const absolute = new Date(runAtRaw);
      if (Number.isNaN(absolute.valueOf())) {
        throw AppError.badRequest("delay action has invalid runAt timestamp");
      }
      const nextRunAt = absolute > new Date() ? absolute : new Date(Date.now() + 1000);
      return {
        status: "scheduled",
        nextRunAt,
        output: { delayedUntil: nextRunAt.toISOString() },
      } satisfies ExecutorResult;
    }

    const amount = Math.max(1, asNumber(config.amount ?? config.minutes, 5));
    const unit = asString(config.unit) ?? "minutes";
    const minutes =
      unit === "hours"
        ? amount * 60
        : unit === "days"
          ? amount * 24 * 60
          : amount;
    return {
      status: "scheduled",
      nextRunAt: new Date(Date.now() + minutes * 60 * 1000),
      output: { delayedMinutes: minutes, amount, unit },
    } satisfies ExecutorResult;
  }

  if (action.type === "task.create") {
    if (isTestMode) {
      return {
        status: "completed",
        output: { simulated: true, action: "task.create" },
      } satisfies ExecutorResult;
    }
    const dueAtOffsetMinutes = asNumber(config.dueAtOffsetMinutes, 0);
    const dueAt = dueAtOffsetMinutes > 0 ? new Date(Date.now() + dueAtOffsetMinutes * 60 * 1000) : null;
    const [task] = await db
      .insert(tasks)
      .values({
        companyId: input.companyId,
        customerId: resolveId(config.customerId, context.customerId),
        dealId: resolveId(config.dealId, context.dealId),
        assignedToUserId: asString(config.assignedToUserId),
        title: asString(config.title) ?? `Automation task ${input.actionIndex + 1}`,
        description: asString(config.description),
        status: "todo",
        priority: (asString(config.priority) as "low" | "medium" | "high" | null) ?? "medium",
        dueAt,
        isRecurring: false,
        recurrenceRule: null,
        createdBy: input.createdBy,
      })
      .returning();

    return { status: "completed", output: { taskId: task.id } } satisfies ExecutorResult;
  }

  if (action.type === "lead.update") {
    const leadId = resolveId(config.leadId, context.leadId);
    if (!leadId) {
      throw AppError.badRequest("lead.update action requires leadId in config or runtime context");
    }

    const [existingLead] = await db.select().from(leads).where(and(eq(leads.companyId, input.companyId), eq(leads.id, leadId), isNull(leads.deletedAt))).limit(1);
    if (!existingLead) {
      throw AppError.notFound("Lead not found for automation action");
    }

    const nextTags = config.appendTags
      ? Array.from(new Set([...(existingLead.tags ?? []), ...asStringArray(config.appendTags)]))
      : existingLead.tags;
    const notesAppend = asString(config.notesAppend);
    const [lead] = await db
      .update(leads)
      .set({
        ...(asString(config.status) ? { status: asString(config.status) as typeof existingLead.status } : {}),
        ...(typeof config.score === "number" ? { score: Number(config.score) } : {}),
        ...(asString(config.source) ? { source: asString(config.source) } : {}),
        ...(notesAppend ? { notes: [existingLead.notes, notesAppend].filter(Boolean).join("\n\n") } : {}),
        tags: nextTags,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId))
      .returning();

    await addLeadActivity({
      companyId: input.companyId,
      leadId: lead.id,
      actorUserId: input.createdBy,
      type: "lead_automation_updated",
      payload: {
        automationRunId: input.automationRunId,
        actionIndex: input.actionIndex,
      },
    });

    return { status: "completed", output: { leadId: lead.id, score: lead.score, statusValue: lead.status } } satisfies ExecutorResult;
  }

  if (action.type === "lead.tag") {
    const leadId = resolveId(config.leadId, context.leadId);
    if (!leadId) {
      throw AppError.badRequest("lead.tag action requires leadId in config or runtime context");
    }

    const [existingLead] = await db.select().from(leads).where(and(eq(leads.companyId, input.companyId), eq(leads.id, leadId), isNull(leads.deletedAt))).limit(1);
    if (!existingLead) {
      throw AppError.notFound("Lead not found for automation tag action");
    }

    const mergedTags = Array.from(new Set([...(existingLead.tags ?? []), ...asStringArray(config.tags)]));
    const [lead] = await db
      .update(leads)
      .set({
        tags: mergedTags,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, leadId))
      .returning();

    await addLeadActivity({
      companyId: input.companyId,
      leadId: lead.id,
      actorUserId: input.createdBy,
      type: "lead_tags_updated",
      payload: {
        tags: mergedTags,
        source: "automation",
      },
    });

    return { status: "completed", output: { leadId: lead.id, tags: mergedTags } } satisfies ExecutorResult;
  }

  if (action.type === "deal.stage") {
    const dealId = resolveId(config.dealId, context.dealId);
    if (!dealId) {
      throw AppError.badRequest("deal.stage action requires dealId in config or runtime context");
    }

    const [deal] = await db
      .update(deals)
      .set({
        ...(asString(config.pipeline) ? { pipeline: asString(config.pipeline) as string } : {}),
        ...(asString(config.stage) ? { stage: asString(config.stage) as string } : {}),
        ...(asString(config.status) ? { status: asString(config.status) as "open" | "won" | "lost" } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(deals.companyId, input.companyId), eq(deals.id, dealId), isNull(deals.deletedAt)))
      .returning();

    if (!deal) {
      throw AppError.notFound("Deal not found for automation action");
    }

    await addDealActivity({
      companyId: input.companyId,
      dealId: deal.id,
      actorUserId: input.createdBy,
      type: "deal_stage_changed",
      payload: {
        pipeline: deal.pipeline,
        stage: deal.stage,
        source: "automation",
      },
    });

    return { status: "completed", output: { dealId: deal.id, stage: deal.stage } } satisfies ExecutorResult;
  }

  if (action.type === "email.send") {
    if (isTestMode) {
      return {
        status: "completed",
        output: { simulated: true, action: "email.send" },
      } satisfies ExecutorResult;
    }
    const email = await queueLeadEmail({
      companyId: input.companyId,
      automationId: input.automationId,
      automationRunId: input.automationRunId,
      leadId: resolveId(config.leadId, context.leadId),
      customerId: resolveId(config.customerId, context.customerId),
      recipientEmail: asString(config.recipientEmail),
      recipientName: asString(config.recipientName),
      subjectTemplate: asString(config.subject) ?? "Automation email",
      bodyTemplate: asString(config.body) ?? "",
      variables: (context.variables as Record<string, unknown> | undefined) ?? {},
      createdBy: input.createdBy,
    });

    return { status: "completed", output: { emailMessageId: email.id } } satisfies ExecutorResult;
  }

  if (action.type === "whatsapp.send") {
    if (isTestMode) {
      return {
        status: "completed",
        output: { simulated: true, action: "whatsapp.send" },
      } satisfies ExecutorResult;
    }
    const contactHandle = asString(config.contactHandle) ?? asString((context.variables ?? {})["contactHandle"]);
    if (!contactHandle) {
      throw AppError.badRequest("whatsapp.send action requires contactHandle");
    }

    const sent = await sendWhatsappMessage({
      companyId: input.companyId,
      accountId: asString(config.accountId),
      contactHandle,
      contactName: asString(config.contactName),
      messageTemplate: asString(config.message) ?? "",
      createdBy: input.createdBy,
      automationId: input.automationId,
      automationRunId: input.automationRunId,
      leadId: resolveId(config.leadId, context.leadId),
      customerId: resolveId(config.customerId, context.customerId),
      variables: (context.variables as Record<string, unknown> | undefined) ?? {},
    });

    return { status: "completed", output: { conversationId: sent.conversation.id, messageId: sent.message.id } } satisfies ExecutorResult;
  }

  throw AppError.badRequest(`Unsupported automation action type: ${action.type}`);
}

function batchActions(actions: AutomationActionRecord[], startIndex: number) {
  const first = actions[startIndex];
  const parallelKey = actionParallelKey(first);
  if (!parallelKey || first.type === "delay") {
    return {
      items: [{ action: first, actionIndex: startIndex }],
      nextIndex: startIndex + 1,
    };
  }

  const items: Array<{ action: AutomationActionRecord; actionIndex: number }> = [];
  let cursor = startIndex;
  while (cursor < actions.length && actionParallelKey(actions[cursor]) === parallelKey && actions[cursor].type !== "delay") {
    items.push({ action: actions[cursor], actionIndex: cursor });
    cursor += 1;
  }

  return { items, nextIndex: cursor };
}

async function markRunFailure(runId: string, errorMessage: string, retryCount: number, maxRetries: number) {
  const retryable = retryCount < maxRetries;
  await db
    .update(automationRuns)
    .set({
      status: retryable ? "queued" : "failed",
      retryCount: retryable ? retryCount + 1 : retryCount,
      nextRunAt: retryable ? new Date(Date.now() + (retryCount + 1) * 60 * 1000) : new Date(),
      claimedAt: null,
      completedAt: retryable ? null : new Date(),
      lastError: errorMessage,
      message: retryable ? `Retry scheduled: ${errorMessage}` : errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(automationRuns.id, runId));
}

async function isRunCanceled(runId: string) {
  const [run] = await db.select({ canceledAt: automationRuns.canceledAt, status: automationRuns.status }).from(automationRuns).where(eq(automationRuns.id, runId)).limit(1);
  return !!run && (!!run.canceledAt || run.status === "canceled");
}

export async function processAutomationRun(runId: string) {
  const [run] = await db.select().from(automationRuns).where(eq(automationRuns.id, runId)).limit(1);
  if (!run) {
    return false;
  }

  const [automation] = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, run.automationId), eq(automations.companyId, run.companyId), eq(automations.status, "active"), isNull(automations.deletedAt)))
    .limit(1);

  if (!automation) {
    await db
      .update(automationRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        claimedAt: null,
        lastError: "Automation definition is unavailable",
        message: "Automation definition is unavailable",
        updatedAt: new Date(),
      })
      .where(eq(automationRuns.id, runId));
    return false;
  }

  const actions = (automation.actions ?? []) as AutomationActionRecord[];
  const context = (run.payload ?? {}) as RuntimeContext;
  let currentIndex = run.currentActionIndex;

  while (currentIndex < actions.length) {
    if (await isRunCanceled(run.id)) {
      await db
        .update(automationRuns)
        .set({
          status: "canceled",
          canceledAt: new Date(),
          claimedAt: null,
          completedAt: new Date(),
          message: "Run canceled",
          updatedAt: new Date(),
        })
        .where(eq(automationRuns.id, run.id));
      return false;
    }

    const { items, nextIndex } = batchActions(actions, currentIndex);
    const startedAt = new Date();

    for (const item of items) {
      await upsertRunStep({
        companyId: run.companyId,
        automationRunId: run.id,
        actionIndex: item.actionIndex,
        actionType: item.action.type,
        status: "running",
        attemptCount: run.retryCount + 1,
        parallelKey: actionParallelKey(item.action),
        startedAt,
      });
    }

    try {
      const results = await Promise.all(
        items.map(({ action, actionIndex }) =>
          executeAction({
            companyId: run.companyId,
            createdBy: automation.createdBy,
            automationId: automation.id,
            automationRunId: run.id,
            actionIndex,
            action,
            context,
          }).then((result) => ({ result, action, actionIndex })),
        ),
      );

      const scheduledResult = results.find(
        (item): item is typeof item & { result: Extract<ExecutorResult, { status: "scheduled" }> } => item.result.status === "scheduled",
      );
      for (const item of results) {
        await upsertRunStep({
          companyId: run.companyId,
          automationRunId: run.id,
          actionIndex: item.actionIndex,
          actionType: item.action.type,
          status: item.result.status === "scheduled" ? "scheduled" : "completed",
          attemptCount: run.retryCount + 1,
          parallelKey: actionParallelKey(item.action),
          completedAt: new Date(),
          output: item.result.output ?? {},
        });
      }

      if (scheduledResult) {
        const nextRunAt = scheduledResult.result.nextRunAt;
        await db
          .update(automationRuns)
          .set({
            status: "queued",
            currentActionIndex: nextIndex,
            nextRunAt,
            claimedAt: null,
            message: `Delayed until ${nextRunAt.toISOString()}`,
            updatedAt: new Date(),
          })
          .where(eq(automationRuns.id, run.id));
        return true;
      }

      const branchJump = results
        .map((item) => item.result.nextActionIndex)
        .find((value): value is number => typeof value === "number" && Number.isFinite(value));
      currentIndex = branchJump ?? nextIndex;
      await db
        .update(automationRuns)
        .set({
          currentActionIndex: currentIndex,
          message: currentIndex >= actions.length ? "Completed" : `Completed action batch through ${currentIndex - 1}`,
          updatedAt: new Date(),
        })
        .where(eq(automationRuns.id, run.id));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Automation action failed";
      for (const item of items) {
        await upsertRunStep({
          companyId: run.companyId,
          automationRunId: run.id,
          actionIndex: item.actionIndex,
          actionType: item.action.type,
          status: "failed",
          attemptCount: run.retryCount + 1,
          parallelKey: actionParallelKey(item.action),
          completedAt: new Date(),
          lastError: errorMessage,
        });
      }

      await markRunFailure(run.id, errorMessage, run.retryCount, run.maxRetries);
      return false;
    }
  }

  await db
    .update(automationRuns)
    .set({
      status: "completed",
      completedAt: new Date(),
      claimedAt: null,
      message: "Run completed",
      updatedAt: new Date(),
    })
    .where(eq(automationRuns.id, run.id));

  return true;
}

export async function enqueueAutomationRun(input: {
  companyId: string;
  automationId: string;
  triggerType: string;
  payload?: Record<string, unknown>;
  correlationKey?: string | null;
  executeAfter?: Date | null;
}) {
  const [run] = await db
    .insert(automationRuns)
    .values({
      companyId: input.companyId,
      automationId: input.automationId,
      status: "queued",
      triggerType: input.triggerType,
      payload: input.payload ?? {},
      correlationKey: input.correlationKey ?? null,
      nextRunAt: input.executeAfter ?? new Date(),
      message: "Queued for execution",
    })
    .returning();

  return run;
}

function triggerMatchesConfig(triggerConfig: Record<string, unknown>, payload: Record<string, unknown>) {
  if (triggerConfig.entityId && triggerConfig.entityId !== payload.entityId) {
    return false;
  }

  if (triggerConfig.stage && triggerConfig.stage !== payload.stage) {
    return false;
  }

  return true;
}

export async function recordTriggerEvent(input: {
  companyId: string;
  triggerType: string;
  eventKey: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const [event] = await db
    .insert(automationTriggerEvents)
    .values({
      companyId: input.companyId,
      triggerType: input.triggerType,
      eventKey: input.eventKey,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      payload: {
        ...(input.payload ?? {}),
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    })
    .onConflictDoNothing({
      target: [automationTriggerEvents.companyId, automationTriggerEvents.eventKey],
    })
    .returning();

  if (!event) {
    return [];
  }

  const matchingAutomations = await db
    .select()
    .from(automations)
    .where(and(eq(automations.companyId, input.companyId), eq(automations.status, "active"), eq(automations.triggerType, input.triggerType), isNull(automations.deletedAt)));

  const runs = [];
  for (const automation of matchingAutomations) {
    if (!triggerMatchesConfig((automation.triggerConfig ?? {}) as Record<string, unknown>, event.payload)) {
      continue;
    }

    runs.push(
      enqueueAutomationRun({
        companyId: input.companyId,
        automationId: automation.id,
        triggerType: input.triggerType,
        payload: event.payload,
        correlationKey: input.eventKey,
      }),
    );
  }

  return Promise.all(runs);
}

export async function queueLeadScoreChangedTrigger(input: {
  companyId: string;
  leadId: string;
  previousScore: number;
  score: number;
}) {
  return recordTriggerEvent({
    companyId: input.companyId,
    triggerType: "lead.score_changed",
    eventKey: `lead.score_changed:${input.leadId}:${input.score}:${Date.now()}`,
    entityType: "lead",
    entityId: input.leadId,
    payload: {
      leadId: input.leadId,
      previousScore: input.previousScore,
      score: input.score,
    },
  });
}

export async function queueLeadInactiveTriggers() {
  const now = Date.now();
  if (now - lastLeadInactiveScanAt < 5 * 60 * 1000) {
    return 0;
  }
  lastLeadInactiveScanAt = now;

  const inactiveAutomations = await db
    .select()
    .from(automations)
    .where(and(eq(automations.triggerType, "lead.inactive"), eq(automations.status, "active"), isNull(automations.deletedAt)));

  let queued = 0;
  for (const automation of inactiveAutomations) {
    const inactiveDays = Math.max(1, asNumber((automation.triggerConfig as Record<string, unknown> | null)?.inactiveDays, 14));
    const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);
    const staleLeads = await db
      .select()
      .from(leads)
      .where(and(eq(leads.companyId, automation.companyId), isNull(leads.deletedAt), lte(leads.updatedAt, cutoff)))
      .limit(100);

    for (const lead of staleLeads) {
      const dayKey = new Date().toISOString().slice(0, 10);
      const runs = await recordTriggerEvent({
        companyId: automation.companyId,
        triggerType: "lead.inactive",
        eventKey: `lead.inactive:${lead.id}:${dayKey}:${inactiveDays}`,
        entityType: "lead",
        entityId: lead.id,
        payload: {
          leadId: lead.id,
          inactiveDays,
          lastActivityAt: lead.updatedAt,
        },
      });
      queued += runs.length;
    }
  }

  return queued;
}

export async function claimDueAutomationRuns(limit = 10) {
  const now = new Date();
  const dueRuns = await db
    .select()
    .from(automationRuns)
    .where(and(eq(automationRuns.status, "queued"), lte(automationRuns.nextRunAt, now)))
    .orderBy(asc(automationRuns.nextRunAt), asc(automationRuns.executedAt))
    .limit(limit);

  const claimed: string[] = [];
  for (const run of dueRuns) {
    const [updated] = await db
      .update(automationRuns)
      .set({
        status: "running",
        claimedAt: now,
        startedAt: run.startedAt ?? now,
        message: "Running",
        updatedAt: now,
      })
      .where(and(eq(automationRuns.id, run.id), eq(automationRuns.status, "queued")))
      .returning({ id: automationRuns.id });

    if (updated) {
      claimed.push(updated.id);
    }
  }

  return claimed;
}

export async function listAutomationRuns(companyId: string, automationId?: string | null) {
  const conditions = [eq(automationRuns.companyId, companyId)];
  if (automationId) {
    conditions.push(eq(automationRuns.automationId, automationId));
  }

  return db
    .select()
    .from(automationRuns)
    .where(and(...conditions))
    .orderBy(desc(automationRuns.executedAt))
    .limit(100);
}

export async function getAutomationRunDetail(companyId: string, runId: string) {
  const [run] = await db
    .select()
    .from(automationRuns)
    .where(and(eq(automationRuns.companyId, companyId), eq(automationRuns.id, runId)))
    .limit(1);

  if (!run) {
    throw AppError.notFound("Automation run not found");
  }

  const steps = await db
    .select()
    .from(automationRunSteps)
    .where(and(eq(automationRunSteps.companyId, companyId), eq(automationRunSteps.automationRunId, runId)))
    .orderBy(asc(automationRunSteps.actionIndex));

  return {
    run,
    steps,
  };
}

export async function cancelAutomationRun(companyId: string, runId: string) {
  const [run] = await db
    .update(automationRuns)
    .set({
      status: "canceled",
      canceledAt: new Date(),
      claimedAt: null,
      completedAt: new Date(),
      message: "Canceled by user",
      updatedAt: new Date(),
    })
    .where(and(eq(automationRuns.companyId, companyId), eq(automationRuns.id, runId)))
    .returning();

  if (!run) {
    throw AppError.notFound("Automation run not found");
  }

  return run;
}

async function runtimeTick() {
  if (workerBusy) {
    return;
  }
  workerBusy = true;

  try {
    const claimedRunIds = await claimDueAutomationRuns(10);
    for (const runId of claimedRunIds) {
      await processAutomationRun(runId);
    }

    await processQueuedEmailMessages(25);
    await processDueSequenceRuns(25);
    await queueLeadInactiveTriggers();
    await expireConversationStates();
  } finally {
    workerBusy = false;
  }
}

export function startAutomationRuntimeWorker(intervalMs: number) {
  if (workerStarted) {
    return;
  }

  workerStarted = true;
  workerTimer = setInterval(() => {
    void runtimeTick();
  }, intervalMs);

  void runtimeTick();

  if ("unref" in workerTimer && typeof workerTimer.unref === "function") {
    workerTimer.unref();
  }
}

export function stopAutomationRuntimeWorker() {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
  workerStarted = false;
}
