import { and, asc, count, desc, eq, gte, isNull } from "drizzle-orm";

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

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
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

export type LeadPriorityBand = "hot" | "warm" | "nurture" | "cold";

export const leadPriorityBands: Array<{ key: LeadPriorityBand; label: string; min: number; max: number }> = [
  { key: "hot", label: "Hot", min: 75, max: 100 },
  { key: "warm", label: "Warm", min: 50, max: 74 },
  { key: "nurture", label: "Nurture", min: 25, max: 49 },
  { key: "cold", label: "Cold", min: 0, max: 24 },
];

export const defaultLeadScoringRules = [
  { name: "Meta lead created", eventType: "lead.created", channel: "meta", conditions: {}, weight: 25, priority: 10 },
  { name: "WhatsApp inbound reply", eventType: "whatsapp.replied", channel: "whatsapp", conditions: {}, weight: 25, priority: 20 },
  { name: "Email reply", eventType: "email.replied", channel: "email", conditions: {}, weight: 20, priority: 30 },
  { name: "Website form submitted", eventType: "form.submitted", channel: "website", conditions: {}, weight: 18, priority: 40 },
  { name: "Qualified status", eventType: "lead.status_changed", channel: "crm", conditions: { toStatus: "qualified" }, weight: 15, priority: 50 },
  { name: "Booked meeting", eventType: "meeting.booked", channel: "crm", conditions: {}, weight: 15, priority: 60 },
  { name: "High-intent tag added", eventType: "lead.activity_updated", channel: "crm", conditions: { requiredTags: ["priority"] }, weight: 12, priority: 70 },
  { name: "Email clicked", eventType: "email.clicked", channel: "email", conditions: {}, weight: 8, priority: 80 },
  { name: "Email opened", eventType: "email.opened", channel: "email", conditions: {}, weight: 4, priority: 90 },
  { name: "Lead lost", eventType: "lead.status_changed", channel: "crm", conditions: { toStatus: "lost" }, weight: -35, priority: 100 },
] as const;

export function getLeadPriority(score: number | null | undefined) {
  const boundedScore = Math.max(0, Math.min(100, asNumber(score, 0)));
  const band = leadPriorityBands.find((item) => boundedScore >= item.min && boundedScore <= item.max) ?? leadPriorityBands[3]!;
  return {
    priorityBand: band.key,
    priorityLabel: band.label,
    priorityReason: `${band.label} lead based on score ${boundedScore}`,
  };
}

function normalizeComparable(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : value;
}

function matchesOperator(actual: unknown, operator: string, expected: unknown) {
  const normalizedActual = normalizeComparable(actual);
  const normalizedExpected = normalizeComparable(expected);
  switch (operator) {
    case "equals":
    case "eq":
      return normalizedActual === normalizedExpected;
    case "not_equals":
    case "neq":
      return normalizedActual !== normalizedExpected;
    case "contains":
      return Array.isArray(actual)
        ? actual.map((item) => String(item).toLowerCase()).includes(String(expected).toLowerCase())
        : String(actual ?? "").toLowerCase().includes(String(expected).toLowerCase());
    case "in":
      return Array.isArray(expected) && expected.map((item) => String(item).toLowerCase()).includes(String(actual ?? "").toLowerCase());
    case "gte":
      return asNumber(actual, Number.NEGATIVE_INFINITY) >= asNumber(expected, Number.POSITIVE_INFINITY);
    case "gt":
      return asNumber(actual, Number.NEGATIVE_INFINITY) > asNumber(expected, Number.POSITIVE_INFINITY);
    case "lte":
      return asNumber(actual, Number.POSITIVE_INFINITY) <= asNumber(expected, Number.NEGATIVE_INFINITY);
    case "lt":
      return asNumber(actual, Number.POSITIVE_INFINITY) < asNumber(expected, Number.NEGATIVE_INFINITY);
    case "exists":
      return actual !== undefined && actual !== null && String(actual).length > 0;
    case "not_exists":
      return actual === undefined || actual === null || String(actual).length === 0;
    default:
      return false;
  }
}

export function matchRuleConditions(conditions: Record<string, unknown>, context: Record<string, unknown>) {
  const source = asString(conditions.source);
  if (source && source !== asString(context.source)) {
    return false;
  }

  const channel = asString(conditions.channel);
  if (channel && channel !== asString(context.channel)) {
    return false;
  }

  const status = asString(conditions.status);
  if (status && status !== asString(context.status)) {
    return false;
  }

  const fromStatus = asString(conditions.fromStatus);
  if (fromStatus && fromStatus !== asString(context.fromStatus)) {
    return false;
  }

  const toStatus = asString(conditions.toStatus);
  if (toStatus && toStatus !== asString(context.toStatus)) {
    return false;
  }

  const assignedToUserId = asString(conditions.assignedToUserId);
  if (assignedToUserId && assignedToUserId !== asString(context.assignedToUserId)) {
    return false;
  }

  const origin = asString(conditions.origin);
  if (origin && origin !== asString(context.origin)) {
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

  const priorityBands = asStringArray(conditions.priorityBands);
  if (priorityBands.length > 0 && !priorityBands.includes(getLeadPriority(score).priorityBand)) {
    return false;
  }

  const fields = Array.isArray(conditions.fields) ? conditions.fields : [];
  for (const fieldCondition of fields) {
    if (!fieldCondition || typeof fieldCondition !== "object") {
      continue;
    }
    const condition = fieldCondition as Record<string, unknown>;
    const field = asString(condition.field);
    if (!field) {
      continue;
    }
    const operator = asString(condition.operator) ?? "equals";
    if (!matchesOperator(getByPath(context, field), operator, condition.value)) {
      return false;
    }
  }

  return true;
}

function withLeadPriority<T extends typeof leads.$inferSelect>(lead: T) {
  return {
    ...lead,
    ...getLeadPriority(lead.score),
  };
}

function summarizeRule(rule: typeof leadScoringRules.$inferSelect | (typeof defaultLeadScoringRules)[number]) {
  return {
    ruleId: "id" in rule ? rule.id : null,
    name: rule.name,
    eventType: rule.eventType,
    channel: rule.channel,
    weight: rule.weight,
  };
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

export async function updateLeadScoringRule(input: {
  companyId: string;
  ruleId: string;
  name?: string;
  eventType?: string;
  channel?: string | null;
  conditions?: Record<string, unknown>;
  weight?: number;
  isActive?: boolean;
  priority?: number;
}) {
  const [rule] = await db
    .update(leadScoringRules)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.eventType !== undefined ? { eventType: input.eventType } : {}),
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(input.conditions !== undefined ? { conditions: input.conditions } : {}),
      ...(input.weight !== undefined ? { weight: input.weight } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(leadScoringRules.id, input.ruleId), eq(leadScoringRules.companyId, input.companyId), isNull(leadScoringRules.deletedAt)))
    .returning();

  if (!rule) {
    throw AppError.notFound("Lead scoring rule not found");
  }

  return rule;
}

export async function deleteLeadScoringRule(companyId: string, ruleId: string) {
  const [rule] = await db
    .update(leadScoringRules)
    .set({ deletedAt: new Date(), updatedAt: new Date(), isActive: false })
    .where(and(eq(leadScoringRules.id, ruleId), eq(leadScoringRules.companyId, companyId), isNull(leadScoringRules.deletedAt)))
    .returning({ id: leadScoringRules.id });

  if (!rule) {
    throw AppError.notFound("Lead scoring rule not found");
  }

  return { deleted: true, id: rule.id };
}

export async function installDefaultLeadScoringRules(input: { companyId: string; createdBy: string }) {
  const existing = await listLeadScoringRules(input.companyId);
  const existingKeys = new Set(existing.map((rule) => `${rule.eventType}:${rule.channel ?? ""}:${rule.name}`));
  const inserted = [];

  for (const rule of defaultLeadScoringRules) {
    const key = `${rule.eventType}:${rule.channel ?? ""}:${rule.name}`;
    if (existingKeys.has(key)) {
      continue;
    }

    inserted.push(
      upsertLeadScoringRule({
        companyId: input.companyId,
        createdBy: input.createdBy,
        name: rule.name,
        eventType: rule.eventType,
        channel: rule.channel,
        conditions: rule.conditions,
        weight: rule.weight,
        priority: rule.priority,
        isActive: true,
      }),
    );
  }

  return Promise.all(inserted);
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

  const effectiveRules = rules.length > 0 ? rules : [...defaultLeadScoringRules];
  let computed = 0;
  const matchedRules: Array<ReturnType<typeof summarizeRule>> = [];
  for (const event of events) {
    if (event.eventType === "lead.manual_adjustment") {
      computed += asNumber((event.payload ?? {}).adjustment, 0);
      matchedRules.push({
        ruleId: null,
        name: "Manual adjustment",
        eventType: event.eventType,
        channel: event.channel,
        weight: asNumber((event.payload ?? {}).adjustment, 0),
      });
      continue;
    }

    for (const rule of effectiveRules) {
      if (rule.eventType !== event.eventType) {
        continue;
      }
      if (rule.channel && rule.channel !== event.channel) {
        continue;
      }
      if (!matchRuleConditions((rule.conditions ?? {}) as Record<string, unknown>, {
        ...(event.payload ?? {}),
        channel: event.channel,
        score: lead.score,
        leadScore: lead.score,
        source: lead.source,
        status: lead.status,
        tags: lead.tags,
        assignedToUserId: lead.assignedToUserId,
      })) {
        continue;
      }
      computed += rule.weight;
      matchedRules.push(summarizeRule(rule));
    }
  }

  const boundedScore = Math.max(0, Math.min(100, computed));
  const previousScore = lead.score ?? 0;
  const previousPriority = getLeadPriority(previousScore);
  const nextPriority = getLeadPriority(boundedScore);

  if (boundedScore === previousScore) {
    return { leadId: lead.id, previousScore, score: boundedScore, changed: false, ...nextPriority };
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
      rulesEvaluated: effectiveRules.length,
      matchedRules: matchedRules.slice(0, 25),
      previousPriority,
      priority: nextPriority,
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
    payload: { score: boundedScore, previousScore },
  });
}

  if (previousPriority.priorityBand !== nextPriority.priorityBand) {
    await recordTriggerEvent({
      companyId: input.companyId,
      triggerType: "lead.priority_changed",
      eventKey: `lead.priority_changed:${lead.id}:${nextPriority.priorityBand}:${Date.now()}`,
      entityType: "lead",
      entityId: lead.id,
      payload: {
        leadId: lead.id,
        previousScore,
        score: boundedScore,
        previousPriorityBand: previousPriority.priorityBand,
        previousPriorityLabel: previousPriority.priorityLabel,
        priorityBand: nextPriority.priorityBand,
        priorityLabel: nextPriority.priorityLabel,
      },
    });
  }

  if (previousPriority.priorityBand !== "hot" && nextPriority.priorityBand === "hot") {
    await recordTriggerEvent({
      companyId: input.companyId,
      triggerType: "lead.became_hot",
      eventKey: `lead.became_hot:${lead.id}:${boundedScore}:${Date.now()}`,
      entityType: "lead",
      entityId: lead.id,
      payload: {
        leadId: lead.id,
        previousScore,
        score: boundedScore,
        priorityBand: nextPriority.priorityBand,
        priorityLabel: nextPriority.priorityLabel,
      },
    });
  }

  return { leadId: lead.id, previousScore, score: boundedScore, changed: true, ...nextPriority };
}

export async function listLeadScoreHistory(companyId: string, leadId: string) {
  return db
    .select()
    .from(leadScoreHistory)
    .where(and(eq(leadScoreHistory.companyId, companyId), eq(leadScoreHistory.leadId, leadId)))
    .orderBy(desc(leadScoreHistory.createdAt))
    .limit(100);
}

export async function listLeadScoreEvents(companyId: string, leadId: string) {
  return db
    .select()
    .from(leadScoreEvents)
    .where(and(eq(leadScoreEvents.companyId, companyId), eq(leadScoreEvents.leadId, leadId)))
    .orderBy(desc(leadScoreEvents.createdAt))
    .limit(100);
}

function routingRuleMatches(rule: (typeof leadRoutingRules.$inferSelect), lead: typeof leads.$inferSelect) {
  const predicates = (rule.predicates ?? {}) as Record<string, unknown>;
  const minScore = asNumber(predicates.minScore, Number.NEGATIVE_INFINITY);
  const maxScore = asNumber(predicates.maxScore, Number.POSITIVE_INFINITY);
  if ((lead.score ?? 0) < minScore || (lead.score ?? 0) > maxScore) {
    return false;
  }

  const priorityBands = asStringArray(predicates.priorityBands);
  if (priorityBands.length > 0 && !priorityBands.includes(getLeadPriority(lead.score).priorityBand)) {
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

export async function updateLeadRoutingRule(input: {
  companyId: string;
  ruleId: string;
  name?: string;
  priority?: number;
  isActive?: boolean;
  strategy?: string;
  predicates?: Record<string, unknown>;
  assignmentConfig?: Record<string, unknown>;
}) {
  const [rule] = await db
    .update(leadRoutingRules)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
      ...(input.predicates !== undefined ? { predicates: input.predicates } : {}),
      ...(input.assignmentConfig !== undefined ? { assignmentConfig: input.assignmentConfig } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(leadRoutingRules.id, input.ruleId), eq(leadRoutingRules.companyId, input.companyId), isNull(leadRoutingRules.deletedAt)))
    .returning();

  if (!rule) {
    throw AppError.notFound("Lead routing rule not found");
  }

  return rule;
}

export async function deleteLeadRoutingRule(companyId: string, ruleId: string) {
  const [rule] = await db
    .update(leadRoutingRules)
    .set({ deletedAt: new Date(), updatedAt: new Date(), isActive: false })
    .where(and(eq(leadRoutingRules.id, ruleId), eq(leadRoutingRules.companyId, companyId), isNull(leadRoutingRules.deletedAt)))
    .returning({ id: leadRoutingRules.id });

  if (!rule) {
    throw AppError.notFound("Lead routing rule not found");
  }

  return { deleted: true, id: rule.id };
}

export async function getLeadPrioritizationSummary(companyId: string) {
  const [leadRows, totalRows] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(and(eq(leads.companyId, companyId), isNull(leads.deletedAt)))
      .orderBy(desc(leads.score), desc(leads.updatedAt))
      .limit(20),
    db.select({ count: count() }).from(leads).where(and(eq(leads.companyId, companyId), isNull(leads.deletedAt))),
  ]);

  const bandCounts = Object.fromEntries(leadPriorityBands.map((band) => [band.key, 0])) as Record<LeadPriorityBand, number>;
  const scoreBuckets = await Promise.all(
    leadPriorityBands.map(async (band) => {
      const rows = await db
        .select({ count: count() })
        .from(leads)
        .where(and(eq(leads.companyId, companyId), isNull(leads.deletedAt), gte(leads.score, band.min)));
      return { band, count: Number(rows[0]?.count ?? 0) };
    }),
  );

  for (const { band, count: aboveMinCount } of scoreBuckets) {
    if (band.key === "hot") {
      bandCounts[band.key] = aboveMinCount;
      continue;
    }
    const nextHigher = leadPriorityBands[leadPriorityBands.findIndex((item) => item.key === band.key) - 1];
    const higherCount = nextHigher ? scoreBuckets.find((item) => item.band.key === nextHigher.key)?.count ?? 0 : 0;
    bandCounts[band.key] = Math.max(0, aboveMinCount - higherCount);
  }

  return {
    total: Number(totalRows[0]?.count ?? 0),
    bands: leadPriorityBands.map((band) => ({
      ...band,
      count: bandCounts[band.key],
    })),
    topLeads: leadRows.map(withLeadPriority),
  };
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
      score: lead.score ?? 0,
      priority: getLeadPriority(lead.score),
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
