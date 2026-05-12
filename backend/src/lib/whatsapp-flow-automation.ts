import { and, asc, desc, eq, ilike, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  chatbotFlows,
  conversationTags,
  socialConversations,
  tasks,
  whatsappAutomationRules,
  whatsappKeywordTriggers,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { startFlowExecution } from "@/lib/chatbot-flow-engine";
import { sendWhatsappMessage } from "@/lib/whatsapp-runtime";
import { patchConversation } from "@/lib/whatsapp-inbox";
import { publishWhatsappEvent } from "@/lib/whatsapp-realtime";

/**
 * WhatsApp CRM — Phase 4: Keyword automation + automation rules engine.
 *
 * This service is called from the webhook ingest path (after ingestWhatsappReply)
 * to evaluate keyword triggers and automation rules against inbound messages.
 *
 * Architecture:
 *   Inbound message → evaluateKeywordTriggers → matched? → execute action
 *   Inbound message → evaluateAutomationRules → matched? → execute action
 *
 * Actions:
 *   - reply: send a text reply
 *   - assign_flow: start a chatbot flow execution
 *   - assign_agent: assign conversation to a user
 *   - assign_tag: add a tag to the conversation
 *   - create_task: create a CRM task
 *   - human_handoff: enable human takeover + assign
 */

export interface InboundMessageContext {
  companyId: string;
  conversationId: string;
  contactHandle: string;
  contactName: string | null;
  messageBody: string;
  messageId: string;
  createdBy: string;
}

// -----------------------------------------------------------------
// Keyword triggers
// -----------------------------------------------------------------

export async function evaluateKeywordTriggers(ctx: InboundMessageContext): Promise<boolean> {
  const triggers = await db
    .select()
    .from(whatsappKeywordTriggers)
    .where(
      and(
        eq(whatsappKeywordTriggers.companyId, ctx.companyId),
        eq(whatsappKeywordTriggers.isActive, true),
        isNull(whatsappKeywordTriggers.deletedAt),
      ),
    )
    .orderBy(asc(whatsappKeywordTriggers.priority));

  const body = ctx.messageBody.toLowerCase().trim();
  if (!body) return false;

  for (const trigger of triggers) {
    const keyword = trigger.keyword.toLowerCase().trim();
    let matched = false;

    switch (trigger.matchType) {
      case "exact":
        matched = body === keyword;
        break;
      case "contains":
        matched = body.includes(keyword);
        break;
      case "starts_with":
        matched = body.startsWith(keyword);
        break;
      case "regex":
        try {
          matched = new RegExp(trigger.keyword, "i").test(ctx.messageBody);
        } catch {
          matched = false;
        }
        break;
      default:
        matched = body === keyword;
    }

    if (!matched) continue;

    // Execute the trigger action
    await executeKeywordAction(trigger, ctx);
    return true;
  }

  return false;
}

async function executeKeywordAction(
  trigger: typeof whatsappKeywordTriggers.$inferSelect,
  ctx: InboundMessageContext,
) {
  switch (trigger.actionType) {
    case "reply":
      if (trigger.replyBody) {
        await sendWhatsappMessage({
          companyId: ctx.companyId,
          contactHandle: ctx.contactHandle,
          contactName: ctx.contactName,
          messageTemplate: trigger.replyBody,
          createdBy: ctx.createdBy,
          skipConversationStateSync: true,
        });
      }
      break;

    case "assign_flow":
      if (trigger.flowId) {
        await startFlowExecution({
          companyId: ctx.companyId,
          flowId: trigger.flowId,
          socialConversationId: ctx.conversationId,
          createdBy: ctx.createdBy,
          triggerSource: `keyword:${trigger.keyword}`,
          context: {
            triggerKeyword: trigger.keyword,
            inboundMessage: ctx.messageBody,
          },
          lastInboundMessageId: ctx.messageId,
        });
      }
      break;

    case "assign_agent":
      if (trigger.assignToUserId) {
        await patchConversation(ctx.companyId, ctx.conversationId, {
          assignedToUserId: trigger.assignToUserId,
        });
      }
      break;

    case "assign_tag":
      if (trigger.tagId) {
        const [conversation] = await db
          .select({ tagIds: socialConversations.tagIds })
          .from(socialConversations)
          .where(eq(socialConversations.id, ctx.conversationId))
          .limit(1);
        if (conversation) {
          const currentTags = (conversation.tagIds ?? []) as string[];
          if (!currentTags.includes(trigger.tagId)) {
            await patchConversation(ctx.companyId, ctx.conversationId, {
              tagIds: [...currentTags, trigger.tagId],
            });
          }
        }
      }
      break;

    case "human_handoff":
      await patchConversation(ctx.companyId, ctx.conversationId, {
        humanTakeoverEnabled: true,
        ...(trigger.assignToUserId ? { assignedToUserId: trigger.assignToUserId } : {}),
      });
      break;

    case "create_task":
      await db.insert(tasks).values({
        companyId: ctx.companyId,
        title: `Follow up: keyword "${trigger.keyword}" from ${ctx.contactName ?? ctx.contactHandle}`,
        taskType: "follow_up",
        status: "todo",
        priority: "medium",
        assignedToUserId: trigger.assignToUserId ?? null,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdBy: ctx.createdBy,
      });
      break;
  }

  // Update trigger metadata
  await db
    .update(whatsappKeywordTriggers)
    .set({
      metadata: sql`jsonb_set(${whatsappKeywordTriggers.metadata}, '{lastTriggeredAt}', to_jsonb(now()::text))`,
      updatedAt: new Date(),
    })
    .where(eq(whatsappKeywordTriggers.id, trigger.id));
}

// -----------------------------------------------------------------
// Automation rules
// -----------------------------------------------------------------

export async function evaluateAutomationRules(ctx: InboundMessageContext): Promise<boolean> {
  const rules = await db
    .select()
    .from(whatsappAutomationRules)
    .where(
      and(
        eq(whatsappAutomationRules.companyId, ctx.companyId),
        eq(whatsappAutomationRules.isActive, true),
        eq(whatsappAutomationRules.triggerType, "inbound_message"),
        isNull(whatsappAutomationRules.deletedAt),
      ),
    )
    .orderBy(asc(whatsappAutomationRules.priority));

  for (const rule of rules) {
    const conditions = (rule.conditions ?? []) as Array<{ field: string; operator: string; value: unknown }>;
    const allMatch = conditions.every((condition) => {
      const actual = getContextField(ctx, condition.field);
      return evaluateRuleCondition(condition.operator, actual, condition.value);
    });

    if (!allMatch && conditions.length > 0) continue;

    await executeRuleAction(rule, ctx);

    // Increment run count
    await db
      .update(whatsappAutomationRules)
      .set({
        runCount: sql`${whatsappAutomationRules.runCount} + 1`,
        lastRunAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(whatsappAutomationRules.id, rule.id));

    return true;
  }

  return false;
}

function getContextField(ctx: InboundMessageContext, field: string): unknown {
  switch (field) {
    case "messageBody":
      return ctx.messageBody;
    case "contactHandle":
      return ctx.contactHandle;
    case "contactName":
      return ctx.contactName;
    default:
      return undefined;
  }
}

function evaluateRuleCondition(operator: string, actual: unknown, expected: unknown): boolean {
  const actualStr = String(actual ?? "").toLowerCase();
  const expectedStr = String(expected ?? "").toLowerCase();

  switch (operator) {
    case "equals":
      return actualStr === expectedStr;
    case "contains":
      return actualStr.includes(expectedStr);
    case "starts_with":
      return actualStr.startsWith(expectedStr);
    case "not_equals":
      return actualStr !== expectedStr;
    case "exists":
      return actual !== undefined && actual !== null && actualStr.length > 0;
    case "regex":
      try {
        return new RegExp(String(expected ?? ""), "i").test(String(actual ?? ""));
      } catch {
        return false;
      }
    default:
      return false;
  }
}

async function executeRuleAction(
  rule: typeof whatsappAutomationRules.$inferSelect,
  ctx: InboundMessageContext,
) {
  const config = (rule.actionConfig ?? {}) as Record<string, unknown>;

  switch (rule.actionType) {
    case "reply":
      if (typeof config.body === "string" && config.body) {
        await sendWhatsappMessage({
          companyId: ctx.companyId,
          contactHandle: ctx.contactHandle,
          contactName: ctx.contactName,
          messageTemplate: config.body,
          createdBy: ctx.createdBy,
          skipConversationStateSync: true,
        });
      }
      break;

    case "assign_flow":
      if (typeof config.flowId === "string") {
        await startFlowExecution({
          companyId: ctx.companyId,
          flowId: config.flowId,
          socialConversationId: ctx.conversationId,
          createdBy: ctx.createdBy,
          triggerSource: `rule:${rule.id}`,
          context: { inboundMessage: ctx.messageBody },
          lastInboundMessageId: ctx.messageId,
        });
      }
      break;

    case "assign_agent":
      if (typeof config.userId === "string") {
        await patchConversation(ctx.companyId, ctx.conversationId, {
          assignedToUserId: config.userId,
        });
      }
      break;

    case "assign_tag":
      if (typeof config.tagId === "string") {
        const [conversation] = await db
          .select({ tagIds: socialConversations.tagIds })
          .from(socialConversations)
          .where(eq(socialConversations.id, ctx.conversationId))
          .limit(1);
        if (conversation) {
          const currentTags = (conversation.tagIds ?? []) as string[];
          if (!currentTags.includes(config.tagId)) {
            await patchConversation(ctx.companyId, ctx.conversationId, {
              tagIds: [...currentTags, config.tagId],
            });
          }
        }
      }
      break;

    case "human_handoff":
      await patchConversation(ctx.companyId, ctx.conversationId, {
        humanTakeoverEnabled: true,
        ...(typeof config.userId === "string" ? { assignedToUserId: config.userId } : {}),
      });
      break;

    case "set_priority":
      if (typeof config.priority === "string") {
        await patchConversation(ctx.companyId, ctx.conversationId, {
          priority: config.priority as "low" | "normal" | "high" | "urgent",
        });
      }
      break;
  }
}

// -----------------------------------------------------------------
// CRUD for keyword triggers
// -----------------------------------------------------------------

export async function listKeywordTriggers(companyId: string) {
  return db
    .select()
    .from(whatsappKeywordTriggers)
    .where(and(eq(whatsappKeywordTriggers.companyId, companyId), isNull(whatsappKeywordTriggers.deletedAt)))
    .orderBy(asc(whatsappKeywordTriggers.priority), asc(whatsappKeywordTriggers.keyword));
}

export async function upsertKeywordTrigger(params: {
  companyId: string;
  id?: string;
  keyword: string;
  matchType?: string;
  actionType: string;
  replyBody?: string | null;
  flowId?: string | null;
  assignToUserId?: string | null;
  tagId?: string | null;
  priority?: number;
  isActive?: boolean;
  createdBy?: string | null;
}) {
  if (params.id) {
    const [updated] = await db
      .update(whatsappKeywordTriggers)
      .set({
        keyword: params.keyword,
        matchType: params.matchType ?? "exact",
        actionType: params.actionType,
        replyBody: params.replyBody ?? null,
        flowId: params.flowId ?? null,
        assignToUserId: params.assignToUserId ?? null,
        tagId: params.tagId ?? null,
        priority: params.priority ?? 100,
        isActive: params.isActive ?? true,
        updatedAt: new Date(),
      })
      .where(and(eq(whatsappKeywordTriggers.id, params.id), eq(whatsappKeywordTriggers.companyId, params.companyId)))
      .returning();
    if (!updated) throw AppError.notFound("Keyword trigger not found");
    return updated;
  }

  const [created] = await db
    .insert(whatsappKeywordTriggers)
    .values({
      companyId: params.companyId,
      keyword: params.keyword,
      matchType: params.matchType ?? "exact",
      actionType: params.actionType,
      replyBody: params.replyBody ?? null,
      flowId: params.flowId ?? null,
      assignToUserId: params.assignToUserId ?? null,
      tagId: params.tagId ?? null,
      priority: params.priority ?? 100,
      isActive: params.isActive ?? true,
      createdBy: params.createdBy ?? null,
    })
    .returning();
  return created;
}

export async function deleteKeywordTrigger(companyId: string, triggerId: string) {
  const [deleted] = await db
    .update(whatsappKeywordTriggers)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(whatsappKeywordTriggers.id, triggerId), eq(whatsappKeywordTriggers.companyId, companyId)))
    .returning({ id: whatsappKeywordTriggers.id });
  if (!deleted) throw AppError.notFound("Keyword trigger not found");
  return deleted;
}

// -----------------------------------------------------------------
// CRUD for automation rules
// -----------------------------------------------------------------

export async function listAutomationRules(companyId: string) {
  return db
    .select()
    .from(whatsappAutomationRules)
    .where(and(eq(whatsappAutomationRules.companyId, companyId), isNull(whatsappAutomationRules.deletedAt)))
    .orderBy(asc(whatsappAutomationRules.priority));
}

export async function upsertAutomationRule(params: {
  companyId: string;
  id?: string;
  name: string;
  description?: string | null;
  triggerType: string;
  triggerConfig?: Record<string, unknown>;
  actionType: string;
  actionConfig?: Record<string, unknown>;
  conditions?: Array<Record<string, unknown>>;
  priority?: number;
  isActive?: boolean;
  createdBy?: string | null;
}) {
  if (params.id) {
    const [updated] = await db
      .update(whatsappAutomationRules)
      .set({
        name: params.name,
        description: params.description ?? null,
        triggerType: params.triggerType,
        triggerConfig: params.triggerConfig ?? {},
        actionType: params.actionType,
        actionConfig: params.actionConfig ?? {},
        conditions: params.conditions ?? [],
        priority: params.priority ?? 100,
        isActive: params.isActive ?? true,
        updatedAt: new Date(),
      })
      .where(and(eq(whatsappAutomationRules.id, params.id), eq(whatsappAutomationRules.companyId, params.companyId)))
      .returning();
    if (!updated) throw AppError.notFound("Automation rule not found");
    return updated;
  }

  const [created] = await db
    .insert(whatsappAutomationRules)
    .values({
      companyId: params.companyId,
      name: params.name,
      description: params.description ?? null,
      triggerType: params.triggerType,
      triggerConfig: params.triggerConfig ?? {},
      actionType: params.actionType,
      actionConfig: params.actionConfig ?? {},
      conditions: params.conditions ?? [],
      priority: params.priority ?? 100,
      isActive: params.isActive ?? true,
      createdBy: params.createdBy ?? null,
    })
    .returning();
  return created;
}

export async function deleteAutomationRule(companyId: string, ruleId: string) {
  const [deleted] = await db
    .update(whatsappAutomationRules)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(whatsappAutomationRules.id, ruleId), eq(whatsappAutomationRules.companyId, companyId)))
    .returning({ id: whatsappAutomationRules.id });
  if (!deleted) throw AppError.notFound("Automation rule not found");
  return deleted;
}
