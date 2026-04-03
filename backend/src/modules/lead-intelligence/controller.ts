import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { ok } from "@/lib/api";
import {
  createLeadRoutingRule,
  listLeadAssignmentAudits,
  listLeadRoutingRules,
  listLeadScoreHistory,
  listLeadScoringRules,
  recordLeadScoringEvent,
  routeLead,
  upsertLeadScoringRule,
} from "@/lib/lead-intelligence";
import { leadIdParamSchema } from "@/modules/lead-intelligence/schema";
import type {
  CreateLeadRoutingRuleInput,
  CreateLeadScoreEventInput,
  CreateLeadScoringRuleInput,
  RouteLeadInput,
} from "@/modules/lead-intelligence/schema";

export function getLeadIntelligenceOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "lead-intelligence",
    capabilities: ["lead-scoring-rules", "score-events", "score-history", "lead-routing-rules", "auto-routing"],
  });
}

export async function getLeadScoringRules(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const items = await listLeadScoringRules(tenant.companyId);
  return ok(c, { items });
}

export async function createLeadScoringRule(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateLeadScoringRuleInput;

  const item = await upsertLeadScoringRule({
    companyId: tenant.companyId,
    createdBy: user.id,
    ...body,
  });
  return ok(c, item, 201);
}

export async function createLeadScoreEvent(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateLeadScoreEventInput;

  const event = await recordLeadScoringEvent({
    companyId: tenant.companyId,
    leadId: body.leadId,
    eventType: body.eventType,
    channel: body.channel,
    sourceId: body.sourceId,
    payload: body.payload,
    createdBy: user.id,
  });

  return ok(c, event, 201);
}

export async function getLeadScoreTimeline(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = leadIdParamSchema.parse(c.req.param());
  const items = await listLeadScoreHistory(tenant.companyId, params.leadId);
  return ok(c, { items });
}

export async function getLeadAssignmentAuditTimeline(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = leadIdParamSchema.parse(c.req.param());
  const items = await listLeadAssignmentAudits(tenant.companyId, params.leadId);
  return ok(c, { items });
}

export async function getLeadRoutingRules(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const items = await listLeadRoutingRules(tenant.companyId);
  return ok(c, { items });
}

export async function createLeadRoutingRuleHandler(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateLeadRoutingRuleInput;

  const item = await createLeadRoutingRule({
    companyId: tenant.companyId,
    createdBy: user.id,
    ...body,
  });
  return ok(c, item, 201);
}

export async function routeLeadHandler(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = leadIdParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as RouteLeadInput;

  const routed = await routeLead({
    companyId: tenant.companyId,
    leadId: params.leadId,
    reason: body.reason,
    createdBy: user.id,
  });
  return ok(c, routed);
}
