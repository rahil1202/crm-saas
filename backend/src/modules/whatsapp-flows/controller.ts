import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { chatbotFlowExecutions, chatbotFlows, whatsappFlowAnalyticsDaily } from "@/db/schema";
import { ok } from "@/lib/api";
import {
  deleteAutomationRule,
  deleteKeywordTrigger,
  listAutomationRules,
  listKeywordTriggers,
  upsertAutomationRule,
  upsertKeywordTrigger,
} from "@/lib/whatsapp-flow-automation";
import {
  automationRuleParamSchema,
  automationRuleSchema,
  flowAnalyticsQuerySchema,
  keywordTriggerParamSchema,
  keywordTriggerSchema,
} from "@/modules/whatsapp-flows/schema";
import type {
  AutomationRuleInput,
  FlowAnalyticsQuery,
  KeywordTriggerInput,
} from "@/modules/whatsapp-flows/schema";

// -----------------------------------------------------------------
// Keyword triggers
// -----------------------------------------------------------------

export async function getKeywordTriggers(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const items = await listKeywordTriggers(tenant.companyId);
  return ok(c, { items });
}

export async function createKeywordTrigger(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as KeywordTriggerInput;
  const trigger = await upsertKeywordTrigger({ companyId: tenant.companyId, ...body, createdBy: user.id });
  return ok(c, trigger, 201);
}

export async function updateKeywordTrigger(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = keywordTriggerParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as KeywordTriggerInput;
  const trigger = await upsertKeywordTrigger({ companyId: tenant.companyId, id: params.triggerId, ...body });
  return ok(c, trigger);
}

export async function removeKeywordTrigger(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = keywordTriggerParamSchema.parse(c.req.param());
  const result = await deleteKeywordTrigger(tenant.companyId, params.triggerId);
  return ok(c, { deleted: true, ...result });
}

// -----------------------------------------------------------------
// Automation rules
// -----------------------------------------------------------------

export async function getAutomationRules(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const items = await listAutomationRules(tenant.companyId);
  return ok(c, { items });
}

export async function createAutomationRule(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as AutomationRuleInput;
  const rule = await upsertAutomationRule({ companyId: tenant.companyId, ...body, createdBy: user.id });
  return ok(c, rule, 201);
}

export async function updateAutomationRule(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = automationRuleParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as AutomationRuleInput;
  const rule = await upsertAutomationRule({ companyId: tenant.companyId, id: params.ruleId, ...body });
  return ok(c, rule);
}

export async function removeAutomationRule(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = automationRuleParamSchema.parse(c.req.param());
  const result = await deleteAutomationRule(tenant.companyId, params.ruleId);
  return ok(c, { deleted: true, ...result });
}

// -----------------------------------------------------------------
// Flow analytics
// -----------------------------------------------------------------

export async function getFlowAnalytics(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as FlowAnalyticsQuery;
  const since = new Date();
  since.setDate(since.getDate() - query.days);

  // Per-flow summary
  const flows = await db
    .select({
      id: chatbotFlows.id,
      name: chatbotFlows.name,
      status: chatbotFlows.status,
      entryChannel: chatbotFlows.entryChannel,
      createdAt: chatbotFlows.createdAt,
    })
    .from(chatbotFlows)
    .where(and(eq(chatbotFlows.companyId, tenant.companyId), isNull(chatbotFlows.deletedAt)))
    .orderBy(desc(chatbotFlows.updatedAt))
    .limit(50);

  const flowIds = flows.map((f) => f.id);
  const executionStats = flowIds.length
    ? await db
        .select({
          flowId: chatbotFlowExecutions.flowId,
          total: count(),
          completed: sql<number>`count(*) filter (where ${chatbotFlowExecutions.status} = 'completed')`,
          failed: sql<number>`count(*) filter (where ${chatbotFlowExecutions.status} = 'failed')`,
          running: sql<number>`count(*) filter (where ${chatbotFlowExecutions.status} = 'running' or ${chatbotFlowExecutions.status} = 'paused')`,
        })
        .from(chatbotFlowExecutions)
        .where(
          and(
            eq(chatbotFlowExecutions.companyId, tenant.companyId),
            gte(chatbotFlowExecutions.startedAt, since),
          ),
        )
        .groupBy(chatbotFlowExecutions.flowId)
    : [];

  const statsMap = new Map(executionStats.map((s) => [s.flowId, s]));

  const flowsWithStats = flows.map((flow) => {
    const stats = statsMap.get(flow.id);
    const total = Number(stats?.total ?? 0);
    const completed = Number(stats?.completed ?? 0);
    return {
      ...flow,
      executions: {
        total,
        completed,
        failed: Number(stats?.failed ?? 0),
        running: Number(stats?.running ?? 0),
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      },
    };
  });

  // Global totals
  const [globalTotals] = await db
    .select({
      total: count(),
      completed: sql<number>`count(*) filter (where ${chatbotFlowExecutions.status} = 'completed')`,
      failed: sql<number>`count(*) filter (where ${chatbotFlowExecutions.status} = 'failed')`,
    })
    .from(chatbotFlowExecutions)
    .where(
      and(
        eq(chatbotFlowExecutions.companyId, tenant.companyId),
        gte(chatbotFlowExecutions.startedAt, since),
      ),
    );

  return ok(c, {
    flows: flowsWithStats,
    totals: {
      executions: Number(globalTotals?.total ?? 0),
      completed: Number(globalTotals?.completed ?? 0),
      failed: Number(globalTotals?.failed ?? 0),
      completionRate:
        Number(globalTotals?.total ?? 0) > 0
          ? Math.round((Number(globalTotals?.completed ?? 0) / Number(globalTotals?.total ?? 0)) * 100)
          : 0,
    },
  });
}
