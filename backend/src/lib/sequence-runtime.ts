import { and, asc, desc, eq, isNull, lte } from "drizzle-orm";

import { db } from "@/db/client";
import { sequenceDefinitions, sequenceEnrollments, sequenceRuns, sequenceSteps } from "@/db/schema";
import { queueLeadEmail } from "@/lib/email-runtime";
import { AppError } from "@/lib/errors";
import { sendWhatsappMessage } from "@/lib/whatsapp-runtime";

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getByPath(source: Record<string, unknown>, path: string) {
  const segments = path.split(".").filter(Boolean);
  let cursor: unknown = source;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object") {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

async function bumpSequenceAnalytics(companyId: string, sequenceId: string, key: "enrolled" | "completed" | "failed" | "skipped") {
  const [sequence] = await db
    .select()
    .from(sequenceDefinitions)
    .where(and(eq(sequenceDefinitions.companyId, companyId), eq(sequenceDefinitions.id, sequenceId), isNull(sequenceDefinitions.deletedAt)))
    .limit(1);
  if (!sequence) {
    return;
  }
  const analytics = (sequence.analytics ?? {}) as Record<string, unknown>;
  const current = asNumber(analytics[key], 0);
  await db
    .update(sequenceDefinitions)
    .set({
      analytics: {
        ...analytics,
        [key]: current + 1,
      },
      updatedAt: new Date(),
    })
    .where(eq(sequenceDefinitions.id, sequence.id));
}

function conditionMatches(conditions: Record<string, unknown>, payload: Record<string, unknown>): boolean {
  const all = Array.isArray(conditions.all) ? conditions.all : null;
  if (all) {
    return all.every((item) => conditionMatches((item as Record<string, unknown>) ?? {}, payload));
  }

  const any = Array.isArray(conditions.any) ? conditions.any : null;
  if (any) {
    return any.some((item) => conditionMatches((item as Record<string, unknown>) ?? {}, payload));
  }

  if (conditions.not && typeof conditions.not === "object") {
    return !conditionMatches(conditions.not as Record<string, unknown>, payload);
  }

  const field = asString(conditions.field);
  if (!field) {
    return true;
  }
  const operator = asString(conditions.operator) ?? "equals";
  const expected = conditions.value;
  const actual = getByPath(payload, field);

  if (operator === "equals") {
    return actual === expected;
  }
  if (operator === "not_equals") {
    return actual !== expected;
  }
  if (operator === "gt") {
    return asNumber(actual, Number.NEGATIVE_INFINITY) > asNumber(expected, Number.POSITIVE_INFINITY);
  }
  if (operator === "gte") {
    return asNumber(actual, Number.NEGATIVE_INFINITY) >= asNumber(expected, Number.POSITIVE_INFINITY);
  }
  if (operator === "contains") {
    return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  }

  return true;
}

export async function listSequences(companyId: string) {
  return db
    .select()
    .from(sequenceDefinitions)
    .where(and(eq(sequenceDefinitions.companyId, companyId), isNull(sequenceDefinitions.deletedAt)))
    .orderBy(desc(sequenceDefinitions.updatedAt));
}

export async function createSequence(input: {
  companyId: string;
  createdBy: string;
  name: string;
  status?: "draft" | "active" | "paused" | "archived";
  description?: string | null;
  triggerConfig?: Record<string, unknown>;
}) {
  const [sequence] = await db
    .insert(sequenceDefinitions)
    .values({
      companyId: input.companyId,
      name: input.name,
      status: input.status ?? "draft",
      description: input.description ?? null,
      triggerConfig: input.triggerConfig ?? {},
      analytics: {},
      createdBy: input.createdBy,
    })
    .returning();

  return sequence;
}

export async function replaceSequenceSteps(input: {
  companyId: string;
  sequenceId: string;
  steps: Array<{
    stepIndex: number;
    channel: "email" | "whatsapp";
    stepType: string;
    delayMinutes?: number;
    conditions?: Record<string, unknown>;
    config?: Record<string, unknown>;
  }>;
}) {
  await db.delete(sequenceSteps).where(and(eq(sequenceSteps.companyId, input.companyId), eq(sequenceSteps.sequenceId, input.sequenceId)));
  if (input.steps.length === 0) {
    return [];
  }

  return db
    .insert(sequenceSteps)
    .values(
      input.steps.map((step) => ({
        companyId: input.companyId,
        sequenceId: input.sequenceId,
        stepIndex: step.stepIndex,
        channel: step.channel,
        stepType: step.stepType,
        delayMinutes: step.delayMinutes ?? 0,
        conditions: step.conditions ?? {},
        config: step.config ?? {},
      })),
    )
    .returning();
}

export async function enrollSequence(input: {
  companyId: string;
  sequenceId: string;
  createdBy?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const [sequence] = await db
    .select()
    .from(sequenceDefinitions)
    .where(and(eq(sequenceDefinitions.companyId, input.companyId), eq(sequenceDefinitions.id, input.sequenceId), isNull(sequenceDefinitions.deletedAt)))
    .limit(1);

  if (!sequence) {
    throw AppError.notFound("Sequence not found");
  }
  if (sequence.status !== "active" && sequence.status !== "draft") {
    throw AppError.badRequest("Sequence is not active");
  }

  const [enrollment] = await db
    .insert(sequenceEnrollments)
    .values({
      companyId: input.companyId,
      sequenceId: input.sequenceId,
      leadId: input.leadId ?? null,
      customerId: input.customerId ?? null,
      status: "queued",
      currentStepIndex: 0,
      nextRunAt: new Date(),
      metadata: input.metadata ?? {},
      createdBy: input.createdBy ?? null,
    })
    .returning();

  await bumpSequenceAnalytics(input.companyId, input.sequenceId, "enrolled");

  return enrollment;
}

export async function processDueSequenceRuns(limit = 20) {
  const due = await db
    .select()
    .from(sequenceEnrollments)
    .where(and(eq(sequenceEnrollments.status, "queued"), lte(sequenceEnrollments.nextRunAt, new Date())))
    .orderBy(asc(sequenceEnrollments.nextRunAt))
    .limit(limit);

  let processed = 0;

  for (const enrollment of due) {
    const [step] = await db
      .select()
      .from(sequenceSteps)
      .where(and(eq(sequenceSteps.companyId, enrollment.companyId), eq(sequenceSteps.sequenceId, enrollment.sequenceId), eq(sequenceSteps.stepIndex, enrollment.currentStepIndex)))
      .limit(1);

      if (!step) {
        await db
        .update(sequenceEnrollments)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
          .where(eq(sequenceEnrollments.id, enrollment.id));
        await bumpSequenceAnalytics(enrollment.companyId, enrollment.sequenceId, "completed");
        continue;
      }

    const [run] = await db
      .insert(sequenceRuns)
      .values({
        companyId: enrollment.companyId,
        sequenceId: enrollment.sequenceId,
        enrollmentId: enrollment.id,
        stepId: step.id,
        stepIndex: step.stepIndex,
        status: "running",
        runAt: new Date(),
        startedAt: new Date(),
      })
      .returning();

    try {
      const metadata = (enrollment.metadata ?? {}) as Record<string, unknown>;
      if (!conditionMatches((step.conditions ?? {}) as Record<string, unknown>, metadata)) {
        await db
          .update(sequenceRuns)
          .set({
            status: "skipped",
            completedAt: new Date(),
            output: { skipped: true, reason: "condition_mismatch" },
            updatedAt: new Date(),
          })
          .where(eq(sequenceRuns.id, run.id));
        await bumpSequenceAnalytics(enrollment.companyId, enrollment.sequenceId, "skipped");
      } else if (step.channel === "email") {
        const config = (step.config ?? {}) as Record<string, unknown>;
        await queueLeadEmail({
          companyId: enrollment.companyId,
          leadId: enrollment.leadId,
          customerId: enrollment.customerId,
          recipientEmail: asString(config.recipientEmail),
          recipientName: asString(config.recipientName),
          subjectTemplate: asString(config.subject) ?? "Sequence email",
          bodyTemplate: asString(config.body) ?? "",
          variables: metadata,
          createdBy: enrollment.createdBy,
        });
        await db
          .update(sequenceRuns)
          .set({
            status: "completed",
            completedAt: new Date(),
            output: { channel: "email", queued: true },
            updatedAt: new Date(),
          })
          .where(eq(sequenceRuns.id, run.id));
      } else {
        const config = (step.config ?? {}) as Record<string, unknown>;
        const handle = asString(config.contactHandle) ?? asString(metadata.contactHandle);
        if (!handle) {
          throw AppError.badRequest("WhatsApp sequence step requires contactHandle");
        }
        if (!enrollment.createdBy) {
          throw AppError.badRequest("Sequence enrollment is missing actor context");
        }
        await sendWhatsappMessage({
          companyId: enrollment.companyId,
          contactHandle: handle,
          contactName: asString(config.contactName),
          messageTemplate: asString(config.message) ?? "",
          leadId: enrollment.leadId,
          customerId: enrollment.customerId,
          createdBy: enrollment.createdBy,
          variables: metadata,
        });
        await db
          .update(sequenceRuns)
          .set({
            status: "completed",
            completedAt: new Date(),
            output: { channel: "whatsapp", sent: true },
            updatedAt: new Date(),
          })
          .where(eq(sequenceRuns.id, run.id));
      }

      const nextIndex = step.stepIndex + 1;
      const [nextStep] = await db
        .select()
        .from(sequenceSteps)
        .where(and(eq(sequenceSteps.companyId, enrollment.companyId), eq(sequenceSteps.sequenceId, enrollment.sequenceId), eq(sequenceSteps.stepIndex, nextIndex)))
        .limit(1);

      if (!nextStep) {
        await db
          .update(sequenceEnrollments)
          .set({
            status: "completed",
            completedAt: new Date(),
            lastRunAt: new Date(),
            currentStepIndex: nextIndex,
            updatedAt: new Date(),
          })
          .where(eq(sequenceEnrollments.id, enrollment.id));
        await bumpSequenceAnalytics(enrollment.companyId, enrollment.sequenceId, "completed");
      } else {
        await db
          .update(sequenceEnrollments)
          .set({
            status: "queued",
            currentStepIndex: nextIndex,
            lastRunAt: new Date(),
            nextRunAt: new Date(Date.now() + Math.max(0, nextStep.delayMinutes) * 60 * 1000),
            updatedAt: new Date(),
          })
          .where(eq(sequenceEnrollments.id, enrollment.id));
      }

      processed += 1;
    } catch (error) {
      await db
        .update(sequenceRuns)
        .set({
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Sequence run failed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(sequenceRuns.id, run.id));
      await bumpSequenceAnalytics(enrollment.companyId, enrollment.sequenceId, "failed");

      await db
        .update(sequenceEnrollments)
        .set({
          status: "failed",
          lastRunAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(sequenceEnrollments.id, enrollment.id));
    }
  }

  return processed;
}

export async function getSequenceAnalytics(companyId: string, sequenceId: string) {
  const [sequence] = await db
    .select()
    .from(sequenceDefinitions)
    .where(and(eq(sequenceDefinitions.companyId, companyId), eq(sequenceDefinitions.id, sequenceId), isNull(sequenceDefinitions.deletedAt)))
    .limit(1);

  if (!sequence) {
    throw AppError.notFound("Sequence not found");
  }

  const [steps, enrollments, runs] = await Promise.all([
    db
      .select()
      .from(sequenceSteps)
      .where(and(eq(sequenceSteps.companyId, companyId), eq(sequenceSteps.sequenceId, sequenceId)))
      .orderBy(asc(sequenceSteps.stepIndex)),
    db
      .select()
      .from(sequenceEnrollments)
      .where(and(eq(sequenceEnrollments.companyId, companyId), eq(sequenceEnrollments.sequenceId, sequenceId))),
    db
      .select()
      .from(sequenceRuns)
      .where(and(eq(sequenceRuns.companyId, companyId), eq(sequenceRuns.sequenceId, sequenceId))),
  ]);

  const stepStats = new Map<
    number,
    { completed: number; failed: number; skipped: number; responseCount: number; dropoffCount: number }
  >();

  for (const step of steps) {
    stepStats.set(step.stepIndex, { completed: 0, failed: 0, skipped: 0, responseCount: 0, dropoffCount: 0 });
  }

  for (const run of runs) {
    const stat = stepStats.get(run.stepIndex) ?? { completed: 0, failed: 0, skipped: 0, responseCount: 0, dropoffCount: 0 };
    if (run.status === "completed") {
      stat.completed += 1;
    } else if (run.status === "failed") {
      stat.failed += 1;
      stat.dropoffCount += 1;
    } else if (run.status === "skipped") {
      stat.skipped += 1;
      stat.dropoffCount += 1;
    }
    const output = (run.output ?? {}) as Record<string, unknown>;
    if (output.replyReceived === true || output.responseReceived === true) {
      stat.responseCount += 1;
    }
    stepStats.set(run.stepIndex, stat);
  }

  return {
    sequenceId,
    totals: {
      enrolled: enrollments.length,
      active: enrollments.filter((row) => row.status === "queued" || row.status === "running").length,
      completed: enrollments.filter((row) => row.status === "completed").length,
      failed: enrollments.filter((row) => row.status === "failed").length,
      dropoff: enrollments.filter((row) => row.status === "failed" || row.status === "canceled").length,
    },
    steps: steps.map((step) => ({
      stepId: step.id,
      stepIndex: step.stepIndex,
      channel: step.channel,
      stepType: step.stepType,
      completed: stepStats.get(step.stepIndex)?.completed ?? 0,
      failed: stepStats.get(step.stepIndex)?.failed ?? 0,
      skipped: stepStats.get(step.stepIndex)?.skipped ?? 0,
      responseCount: stepStats.get(step.stepIndex)?.responseCount ?? 0,
      dropoffCount: stepStats.get(step.stepIndex)?.dropoffCount ?? 0,
    })),
    aggregate: sequence.analytics ?? {},
  };
}
