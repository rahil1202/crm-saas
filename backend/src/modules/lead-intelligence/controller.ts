import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { ok } from "@/lib/api";
import {
  createLeadRoutingRule,
  deleteLeadRoutingRule,
  deleteLeadScoringRule,
  getLeadPrioritizationSummary,
  getLeadPriority,
  installDefaultLeadScoringRules,
  listLeadAssignmentAudits,
  listLeadScoreEvents,
  listLeadRoutingRules,
  listLeadScoreHistory,
  listLeadScoringRules,
  recordLeadScoringEvent,
  recalculateLeadScore,
  routeLead,
  updateLeadRoutingRule,
  updateLeadScoringRule,
  upsertLeadScoringRule,
} from "@/lib/lead-intelligence";
import { leadIdParamSchema, routingRuleParamSchema, scoringRuleParamSchema } from "@/modules/lead-intelligence/schema";
import type {
  CreateLeadRoutingRuleInput,
  CreateLeadScoreEventInput,
  CreateLeadScoringRuleInput,
  RouteLeadInput,
  UpdateLeadRoutingRuleInput,
  UpdateLeadScoringRuleInput,
} from "@/modules/lead-intelligence/schema";

export function getLeadIntelligenceOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "lead-intelligence",
    capabilities: ["lead-scoring-rules", "score-events", "score-history", "prioritization", "lead-routing-rules", "auto-routing"],
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

export async function updateLeadScoringRuleHandler(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = scoringRuleParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateLeadScoringRuleInput;

  const item = await updateLeadScoringRule({
    companyId: tenant.companyId,
    ruleId: params.ruleId,
    ...body,
  });
  return ok(c, item);
}

export async function deleteLeadScoringRuleHandler(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = scoringRuleParamSchema.parse(c.req.param());
  const result = await deleteLeadScoringRule(tenant.companyId, params.ruleId);
  return ok(c, result);
}

export async function installDefaultLeadScoringRulesHandler(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const items = await installDefaultLeadScoringRules({ companyId: tenant.companyId, createdBy: user.id });
  return ok(c, { items, installedCount: items.length }, 201);
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

export async function recalculateLeadScoreHandler(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = leadIdParamSchema.parse(c.req.param());
  const result = await recalculateLeadScore({
    companyId: tenant.companyId,
    leadId: params.leadId,
    reason: "manual_recalculate",
    createdBy: user.id,
  });
  return ok(c, result);
}

export async function getLeadScoreTimeline(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = leadIdParamSchema.parse(c.req.param());
  const [history, events] = await Promise.all([
    listLeadScoreHistory(tenant.companyId, params.leadId),
    listLeadScoreEvents(tenant.companyId, params.leadId),
  ]);
  return ok(c, { items: history, history, events });
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

export async function getLeadPrioritizationSummaryHandler(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const summary = await getLeadPrioritizationSummary(tenant.companyId);
  return ok(c, summary);
}

export function getLeadPriorityPreview(c: Context<AppEnv>) {
  const score = Number(c.req.query("score") ?? 0);
  return ok(c, getLeadPriority(score));
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

export async function updateLeadRoutingRuleHandler(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = routingRuleParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateLeadRoutingRuleInput;

  const item = await updateLeadRoutingRule({
    companyId: tenant.companyId,
    ruleId: params.ruleId,
    ...body,
  });
  return ok(c, item);
}

export async function deleteLeadRoutingRuleHandler(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = routingRuleParamSchema.parse(c.req.param());
  const result = await deleteLeadRoutingRule(tenant.companyId, params.ruleId);
  return ok(c, result);
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
