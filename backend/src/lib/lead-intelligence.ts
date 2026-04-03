import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import {
  companyMemberships,
  leadAssignmentAudits,
  leadRoutingRules,
  leadScoreEvents,
  leadScoreHistory,
  leadScoringRules,
  leads,
} from "@/db/schema";
import { queueLeadScoreChangedTrigger, recordTriggerEvent } from "@/lib/automation-runtime";
import { AppError } from "@/lib/errors";
import { createNotification } from "@/lib/notifications";

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
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

function matchRuleConditions(conditions: Record<string, unknown>, context: Record<string, unknown>) {
  const source = asString(conditions.source);
  if (source && source !== asString(context.source)) {
    return false;
  }

  const channel = asString(conditions.channel);
  if (channel && channel !== asString(context.channel)) {
    return false;
  }

  const minScore = asNumber(conditions.minScore, Number.NEGATIVE_INFINITY);
  const maxScore = asNumber(conditions.maxScore, Number.POSITIVE_INFINITY);
  const score = asNumber(context.score, 0);
  if (score < minScore || score > maxScore) {
    return false;
  }

  const requiredTags = asStringArray(conditions.requiredTags);
  if (requiredTags.length > 0) {
    const eventTags = new Set(asStringArray(context.tags));
    const missing = requiredTags.some((tag) => !eventTags.has(tag));
    if (missing) {
      return false;
    }
  }

  return true;
}

export async function listLeadScoringRules(companyId: string) {
  return db
    .select()
    .from(leadScoringRules)
    .where(and(eq(leadScoringRules.companyId, companyId), isNull(leadScoringRules.deletedAt)))
    .orderBy(asc(leadScoringRules.priority), desc(leadScoringRules.createdAt));
}

export async function upsertLeadScoringRule(input: {
  companyId: string;
  createdBy: string;
  name: string;
  eventType: string;
  channel?: string | null;
  conditions?: Record<string, unknown>;
  weight: number;
  isActive?: boolean;
  priority?: number;
}) {
  const [rule] = await db
    .insert(leadScoringRules)
    .values({
      companyId: input.companyId,
      name: input.name,
      eventType: input.eventType,
      channel: input.channel ?? null,
      conditions: input.conditions ?? {},
      weight: input.weight,
      isActive: input.isActive ?? true,
      priority: input.priority ?? 100,
      createdBy: input.createdBy,
    })
    .returning();

  return rule;
}

export async function recordLeadScoringEvent(input: {
  companyId: string;
  leadId: string;
  eventType: string;
  channel?: string | null;
  sourceId?: string | null;
  payload?: Record<string, unknown>;
  createdBy?: string | null;
}) {
  const [event] = await db
    .insert(leadScoreEvents)
    .values({
      companyId: input.companyId,
      leadId: input.leadId,
      eventType: input.eventType,
      channel: input.channel ?? null,
      sourceId: input.sourceId ?? null,
      payload: input.payload ?? {},
    })
    .returning();

  await recalculateLeadScore({
    companyId: input.companyId,
    leadId: input.leadId,
    reason: input.eventType,
    createdBy: input.createdBy ?? null,
  });

  return event;
}

export async function recalculateLeadScore(input: {
  companyId: string;
  leadId: string;
  reason: string;
  createdBy?: string | null;
}) {
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.companyId, input.companyId), eq(leads.id, input.leadId), isNull(leads.deletedAt)))
    .limit(1);

  if (!lead) {
    throw AppError.notFound("Lead not found");
  }

  const [rules, events] = await Promise.all([
    db
      .select()
      .from(leadScoringRules)
      .where(and(eq(leadScoringRules.companyId, input.companyId), eq(leadScoringRules.isActive, true), isNull(leadScoringRules.deletedAt)))
      .orderBy(asc(leadScoringRules.priority), desc(leadScoringRules.createdAt)),
    db
      .select()
      .from(leadScoreEvents)
      .where(and(eq(leadScoreEvents.companyId, input.companyId), eq(leadScoreEvents.leadId, input.leadId)))
      .orderBy(desc(leadScoreEvents.createdAt))
      .limit(200),
  ]);

  let computed = 0;
  for (const event of events) {
    for (const rule of rules) {
      if (rule.eventType !== event.eventType) {
        continue;
      }
      if (rule.channel && rule.channel !== event.channel) {
        continue;
      }
      if (!matchRuleConditions((rule.conditions ?? {}) as Record<string, unknown>, { ...(event.payload ?? {}), channel: event.channel, score: lead.score })) {
        continue;
      }
      computed += rule.weight;
    }
  }

  const boundedScore = Math.max(0, Math.min(100, computed));
  const previousScore = lead.score ?? 0;

  if (boundedScore === previousScore) {
    return { leadId: lead.id, previousScore, score: boundedScore, changed: false };
  }

  await db
    .update(leads)
    .set({
      score: boundedScore,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, lead.id));

  await db.insert(leadScoreHistory).values({
    companyId: input.companyId,
    leadId: lead.id,
    previousScore,
    newScore: boundedScore,
    delta: boundedScore - previousScore,
    reason: input.reason,
    detail: {
      eventsEvaluated: events.length,
      rulesEvaluated: rules.length,
    },
    createdBy: input.createdBy ?? null,
  });

  await queueLeadScoreChangedTrigger({
    companyId: input.companyId,
    leadId: lead.id,
    previousScore,
    score: boundedScore,
  });

  const hotLead = boundedScore >= 75;
  if (hotLead) {
    await createNotification({
      companyId: input.companyId,
      type: "lead",
      title: "Hot lead detected",
      message: `${lead.title} score reached ${boundedScore}`,
      entityId: lead.id,
      entityPath: "/dashboard/leads",
      payload: { score: boundedScore, previousScore },
    });
  }

  await recordTriggerEvent({
    companyId: input.companyId,
    triggerType: "lead.score_changed",
    eventKey: `lead.score_changed:${lead.id}:${boundedScore}:${Date.now()}`,
    entityType: "lead",
    entityId: lead.id,
    payload: {
      leadId: lead.id,
      previousScore,
      score: boundedScore,
      hotLead,
    },
  });

  return { leadId: lead.id, previousScore, score: boundedScore, changed: true };
}

export async function listLeadScoreHistory(companyId: string, leadId: string) {
  return db
    .select()
    .from(leadScoreHistory)
    .where(and(eq(leadScoreHistory.companyId, companyId), eq(leadScoreHistory.leadId, leadId)))
    .orderBy(desc(leadScoreHistory.createdAt))
    .limit(100);
}

function routingRuleMatches(rule: (typeof leadRoutingRules.$inferSelect), lead: typeof leads.$inferSelect) {
  const predicates = (rule.predicates ?? {}) as Record<string, unknown>;
  const minScore = asNumber(predicates.minScore, Number.NEGATIVE_INFINITY);
  const maxScore = asNumber(predicates.maxScore, Number.POSITIVE_INFINITY);
  if ((lead.score ?? 0) < minScore || (lead.score ?? 0) > maxScore) {
    return false;
  }

  const source = asString(predicates.source);
  if (source && source !== lead.source) {
    return false;
  }

  const product = asString(predicates.product);
  if (product) {
    const productField = asString(predicates.productField) ?? "source";
    const leadSnapshot = lead as unknown as Record<string, unknown>;
    const fieldValue = asString(getByPath(leadSnapshot, productField));
    const leadTags = new Set((lead.tags ?? []).map((tag) => tag.toLowerCase()));
    if (fieldValue !== product && !leadTags.has(product.toLowerCase())) {
      return false;
    }
  }

  const regionField = asString(predicates.regionField) ?? "region";
  const regionValue = asString(predicates.region);
  if (regionValue) {
    const leadRegion = asString((lead as unknown as Record<string, unknown>)[regionField]);
    if (leadRegion !== regionValue) {
      return false;
    }
  }

  return true;
}

async function resolveRoundRobinUser(input: {
  companyId: string;
  rule?: (typeof leadRoutingRules.$inferSelect) | null;
  allowedUserIds?: string[];
  maxOpenLeads?: number | null;
}) {
  const memberships = await db
    .select()
    .from(companyMemberships)
    .where(and(eq(companyMemberships.companyId, input.companyId), eq(companyMemberships.status, "active"), isNull(companyMemberships.deletedAt)))
    .orderBy(asc(companyMemberships.createdAt));

  let candidates = memberships.filter((member) => !input.allowedUserIds || input.allowedUserIds.includes(member.userId));
  if (input.maxOpenLeads && input.maxOpenLeads > 0) {
    const loadRows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.companyId, input.companyId), isNull(leads.deletedAt), eq(leads.status, "new")));
    const load = new Map<string, number>();
    for (const row of loadRows) {
      if (!row.assignedToUserId) {
        continue;
      }
      load.set(row.assignedToUserId, (load.get(row.assignedToUserId) ?? 0) + 1);
    }
    candidates = candidates.filter((member) => (load.get(member.userId) ?? 0) < input.maxOpenLeads!);
  }

  if (candidates.length === 0) {
    return { userId: null, updatedRuleState: null as Record<string, unknown> | null };
  }

  const ruleState = (input.rule?.state ?? {}) as Record<string, unknown>;
  const cursor = asNumber(ruleState.cursor, -1);
  const nextIndex = (cursor + 1) % candidates.length;
  const selected = candidates[nextIndex]!;

  return {
    userId: selected.userId,
    updatedRuleState: {
      ...ruleState,
      cursor: nextIndex,
      lastAssignedToUserId: selected.userId,
      updatedAt: new Date().toISOString(),
      candidateCount: candidates.length,
    },
  };
}

export async function listLeadRoutingRules(companyId: string) {
  return db
    .select()
    .from(leadRoutingRules)
    .where(and(eq(leadRoutingRules.companyId, companyId), isNull(leadRoutingRules.deletedAt)))
    .orderBy(asc(leadRoutingRules.priority), desc(leadRoutingRules.createdAt));
}

export async function listLeadAssignmentAudits(companyId: string, leadId: string) {
  return db
    .select()
    .from(leadAssignmentAudits)
    .where(and(eq(leadAssignmentAudits.companyId, companyId), eq(leadAssignmentAudits.leadId, leadId)))
    .orderBy(desc(leadAssignmentAudits.createdAt))
    .limit(100);
}

export async function createLeadRoutingRule(input: {
  companyId: string;
  createdBy: string;
  name: string;
  priority?: number;
  isActive?: boolean;
  strategy?: string;
  predicates?: Record<string, unknown>;
  assignmentConfig?: Record<string, unknown>;
}) {
  const [rule] = await db
    .insert(leadRoutingRules)
    .values({
      companyId: input.companyId,
      name: input.name,
      priority: input.priority ?? 100,
      isActive: input.isActive ?? true,
      strategy: input.strategy ?? "rule_match",
      predicates: input.predicates ?? {},
      assignmentConfig: input.assignmentConfig ?? {},
      state: {},
      createdBy: input.createdBy,
    })
    .returning();

  return rule;
}

export async function routeLead(input: {
  companyId: string;
  leadId: string;
  reason: string;
  createdBy?: string | null;
}) {
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.companyId, input.companyId), eq(leads.id, input.leadId), isNull(leads.deletedAt)))
    .limit(1);

  if (!lead) {
    throw AppError.notFound("Lead not found");
  }

  const rules = await db
    .select()
    .from(leadRoutingRules)
    .where(and(eq(leadRoutingRules.companyId, input.companyId), eq(leadRoutingRules.isActive, true), isNull(leadRoutingRules.deletedAt)))
    .orderBy(asc(leadRoutingRules.priority), asc(leadRoutingRules.createdAt));

  let selectedRule: (typeof leadRoutingRules.$inferSelect) | null = null;
  let nextAssignee: string | null = null;

  for (const rule of rules) {
    if (!routingRuleMatches(rule, lead)) {
      continue;
    }

    const assignment = (rule.assignmentConfig ?? {}) as Record<string, unknown>;
    const configuredUserId = asString(assignment.userId);
    if (configuredUserId) {
      selectedRule = rule;
      nextAssignee = configuredUserId;
      break;
    }

    const allowedUsers = asStringArray(assignment.userIds);
    const maxOpenLeads = asNumber(assignment.maxOpenLeads, 0) || null;
    const roundRobin = await resolveRoundRobinUser({
      companyId: input.companyId,
      rule,
      allowedUserIds: allowedUsers.length > 0 ? allowedUsers : undefined,
      maxOpenLeads,
    });
    if (roundRobin.userId) {
      selectedRule = rule;
      nextAssignee = roundRobin.userId;
      if (roundRobin.updatedRuleState) {
        await db
          .update(leadRoutingRules)
          .set({
            state: roundRobin.updatedRuleState,
            updatedAt: new Date(),
          })
          .where(eq(leadRoutingRules.id, rule.id));
      }
      break;
    }
  }

  if (!nextAssignee) {
    const fallbackRule = rules[0] ?? null;
    const fallback = await resolveRoundRobinUser({
      companyId: input.companyId,
      rule: fallbackRule,
      maxOpenLeads: null,
    });
    nextAssignee = fallback.userId;
    if (fallbackRule && fallback.updatedRuleState) {
      await db
        .update(leadRoutingRules)
        .set({
          state: {
            ...fallback.updatedRuleState,
            mode: "fallback_round_robin",
          },
          updatedAt: new Date(),
        })
        .where(eq(leadRoutingRules.id, fallbackRule.id));
    }
  }

  if (!nextAssignee || nextAssignee === lead.assignedToUserId) {
    return {
      leadId: lead.id,
      assignedToUserId: lead.assignedToUserId,
      changed: false,
      ruleId: selectedRule?.id ?? null,
    };
  }

  await db
    .update(leads)
    .set({
      assignedToUserId: nextAssignee,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, lead.id));

  await db.insert(leadAssignmentAudits).values({
    companyId: input.companyId,
    leadId: lead.id,
    previousAssignedToUserId: lead.assignedToUserId,
    newAssignedToUserId: nextAssignee,
    ruleId: selectedRule?.id ?? null,
    reason: input.reason,
    payload: {
      ruleName: selectedRule?.name ?? "fallback_round_robin",
      strategy: selectedRule?.strategy ?? "round_robin_fallback",
    },
    createdBy: input.createdBy ?? null,
  });

  return {
    leadId: lead.id,
    assignedToUserId: nextAssignee,
    changed: true,
    ruleId: selectedRule?.id ?? null,
  };
}
