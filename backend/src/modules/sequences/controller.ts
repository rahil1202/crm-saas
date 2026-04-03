import { and, desc, eq } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { sequenceEnrollments, sequenceRuns, sequenceSteps } from "@/db/schema";
import { ok } from "@/lib/api";
import { createSequence, enrollSequence, getSequenceAnalytics, listSequences, replaceSequenceSteps } from "@/lib/sequence-runtime";
import { sequenceParamSchema } from "@/modules/sequences/schema";
import type { CreateSequenceInput, EnrollSequenceInput } from "@/modules/sequences/schema";

export function getSequenceOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "sequences",
    capabilities: ["definitions", "steps", "enrollments", "scheduler", "analytics"],
  });
}

export async function listSequencesHandler(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const items = await listSequences(tenant.companyId);
  return ok(c, { items });
}

export async function createSequenceHandler(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateSequenceInput;

  const sequence = await createSequence({
    companyId: tenant.companyId,
    createdBy: user.id,
    name: body.name,
    status: body.status,
    description: body.description,
    triggerConfig: body.triggerConfig,
  });

  await replaceSequenceSteps({
    companyId: tenant.companyId,
    sequenceId: sequence.id,
    steps: body.steps,
  });

  return ok(c, sequence, 201);
}

export async function listSequenceSteps(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = sequenceParamSchema.parse(c.req.param());

  const items = await db
    .select()
    .from(sequenceSteps)
    .where(and(eq(sequenceSteps.companyId, tenant.companyId), eq(sequenceSteps.sequenceId, params.sequenceId)))
    .orderBy(sequenceSteps.stepIndex);

  return ok(c, { items });
}

export async function enrollSequenceHandler(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = sequenceParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as EnrollSequenceInput;

  const enrollment = await enrollSequence({
    companyId: tenant.companyId,
    sequenceId: params.sequenceId,
    leadId: body.leadId ?? null,
    customerId: body.customerId ?? null,
    metadata: body.metadata,
    createdBy: user.id,
  });

  return ok(c, enrollment, 201);
}

export async function listSequenceEnrollments(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = sequenceParamSchema.parse(c.req.param());

  const items = await db
    .select()
    .from(sequenceEnrollments)
    .where(and(eq(sequenceEnrollments.companyId, tenant.companyId), eq(sequenceEnrollments.sequenceId, params.sequenceId)))
    .orderBy(desc(sequenceEnrollments.createdAt))
    .limit(100);

  return ok(c, { items });
}

export async function listSequenceRuns(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = sequenceParamSchema.parse(c.req.param());

  const items = await db
    .select()
    .from(sequenceRuns)
    .where(and(eq(sequenceRuns.companyId, tenant.companyId), eq(sequenceRuns.sequenceId, params.sequenceId)))
    .orderBy(desc(sequenceRuns.createdAt))
    .limit(100);

  return ok(c, { items });
}

export async function getSequenceAnalyticsHandler(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = sequenceParamSchema.parse(c.req.param());

  const analytics = await getSequenceAnalytics(tenant.companyId, params.sequenceId);
  return ok(c, analytics);
}
