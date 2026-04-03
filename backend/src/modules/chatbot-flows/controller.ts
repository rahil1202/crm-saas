import { and, count, desc, eq, ilike, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import {
  chatbotFlowExecutionLogs,
  chatbotFlowExecutions,
  chatbotFlows,
  chatbotFlowVersions,
  conversationStates,
} from "@/db/schema";
import {
  createFlowTestConversation,
  getDefaultFlowDefinition,
  publishFlowVersion,
  startFlowExecution,
  validateFlowDefinition,
} from "@/lib/chatbot-flow-engine";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { recordSecurityAuditLog } from "@/lib/security";
import { chatbotFlowExecutionParamSchema, chatbotFlowParamSchema } from "@/modules/chatbot-flows/schema";
import type {
  ChatbotFlowDefinition,
  CreateChatbotFlowInput,
  CreateChatbotFlowVersionInput,
  ListChatbotFlowsQuery,
  TestRunChatbotFlowInput,
  UpdateChatbotFlowInput,
} from "@/modules/chatbot-flows/schema";

async function loadLatestDraftVersions(companyId: string, flowIds: string[]) {
  if (flowIds.length === 0) {
    return new Map<string, typeof chatbotFlowVersions.$inferSelect>();
  }

  const versions = await db
    .select()
    .from(chatbotFlowVersions)
    .where(and(eq(chatbotFlowVersions.companyId, companyId), eq(chatbotFlowVersions.state, "draft")))
    .orderBy(desc(chatbotFlowVersions.versionNumber));

  const map = new Map<string, typeof chatbotFlowVersions.$inferSelect>();
  for (const version of versions) {
    if (flowIds.includes(version.flowId) && !map.has(version.flowId)) {
      map.set(version.flowId, version);
    }
  }
  return map;
}

async function loadPublishedVersions(companyId: string, versionIds: string[]) {
  if (versionIds.length === 0) {
    return new Map<string, typeof chatbotFlowVersions.$inferSelect>();
  }
  const versions = await db
    .select()
    .from(chatbotFlowVersions)
    .where(and(eq(chatbotFlowVersions.companyId, companyId)));

  return new Map(versions.filter((item) => versionIds.includes(item.id)).map((item) => [item.id, item] as const));
}

async function getFlowOrThrow(companyId: string, flowId: string) {
  const [flow] = await db
    .select()
    .from(chatbotFlows)
    .where(and(eq(chatbotFlows.companyId, companyId), eq(chatbotFlows.id, flowId), isNull(chatbotFlows.deletedAt)))
    .limit(1);

  if (!flow) {
    throw AppError.notFound("Chatbot flow not found");
  }

  return flow;
}

async function getDraftVersionOrThrow(companyId: string, flowId: string) {
  const [version] = await db
    .select()
    .from(chatbotFlowVersions)
    .where(and(eq(chatbotFlowVersions.companyId, companyId), eq(chatbotFlowVersions.flowId, flowId), eq(chatbotFlowVersions.state, "draft")))
    .orderBy(desc(chatbotFlowVersions.versionNumber))
    .limit(1);

  if (!version) {
    throw AppError.notFound("Draft version not found");
  }

  return version;
}

async function serializeFlow(companyId: string, flow: typeof chatbotFlows.$inferSelect) {
  const [draftVersion, publishedVersion] = await Promise.all([
    getDraftVersionOrThrow(companyId, flow.id),
    flow.publishedVersionId
      ? db
          .select()
          .from(chatbotFlowVersions)
          .where(and(eq(chatbotFlowVersions.companyId, companyId), eq(chatbotFlowVersions.id, flow.publishedVersionId)))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
  ]);

  return {
    ...flow,
    draftVersion,
    publishedVersion,
  };
}

export function getChatbotFlowOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "chatbot-flows",
    capabilities: ["flow-definition", "draft-publish", "whatsapp-test-run", "execution-logs"],
  });
}

export async function listChatbotFlows(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListChatbotFlowsQuery;

  const conditions = [eq(chatbotFlows.companyId, tenant.companyId), isNull(chatbotFlows.deletedAt)];
  if (query.q) {
    conditions.push(ilike(chatbotFlows.name, `%${query.q}%`));
  }
  if (query.status) {
    conditions.push(eq(chatbotFlows.status, query.status));
  }

  const where = and(...conditions);
  const [items, totalRows] = await Promise.all([
    db.select().from(chatbotFlows).where(where).orderBy(desc(chatbotFlows.updatedAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(chatbotFlows).where(where),
  ]);

  const draftVersions = await loadLatestDraftVersions(tenant.companyId, items.map((item) => item.id));
  const publishedVersions = await loadPublishedVersions(
    tenant.companyId,
    items.map((item) => item.publishedVersionId).filter((item): item is string => Boolean(item)),
  );

  return ok(c, {
    items: items.map((item) => ({
      ...item,
      draftVersion: draftVersions.get(item.id) ?? null,
      publishedVersion: item.publishedVersionId ? (publishedVersions.get(item.publishedVersionId) ?? null) : null,
    })),
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function createChatbotFlow(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateChatbotFlowInput;

  const [flow] = await db
    .insert(chatbotFlows)
    .values({
      companyId: tenant.companyId,
      name: body.name,
      entryChannel: body.entryChannel,
      createdBy: user.id,
    })
    .returning();

  const definition = getDefaultFlowDefinition();
  const validation = validateFlowDefinition(definition);

  const [draftVersion] = await db
    .insert(chatbotFlowVersions)
    .values({
      companyId: tenant.companyId,
      flowId: flow.id,
      versionNumber: 1,
      state: "draft",
      definition,
      validationErrors: validation.errors,
      createdBy: user.id,
    })
    .returning();

  await recordSecurityAuditLog({
    requestId: c.get("requestId"),
    companyId: tenant.companyId,
    userId: user.id,
    sessionId: user.sessionId,
    route: c.req.path,
    action: "chatbot_flow.create",
    result: "success",
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
    metadata: { flowId: flow.id },
  });

  return ok(c, { ...flow, draftVersion, publishedVersion: null }, 201);
}

export async function getChatbotFlow(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = chatbotFlowParamSchema.parse(c.req.param());
  const flow = await getFlowOrThrow(tenant.companyId, params.flowId);

  return ok(c, await serializeFlow(tenant.companyId, flow));
}

export async function updateChatbotFlow(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = chatbotFlowParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateChatbotFlowInput;
  await getFlowOrThrow(tenant.companyId, params.flowId);

  if (body.name !== undefined || body.status !== undefined || body.entryChannel !== undefined) {
    await db
      .update(chatbotFlows)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.entryChannel !== undefined ? { entryChannel: body.entryChannel } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(chatbotFlows.companyId, tenant.companyId), eq(chatbotFlows.id, params.flowId)));
  }

  if (body.definition !== undefined) {
    const validation = validateFlowDefinition(body.definition);
    const draftVersion = await getDraftVersionOrThrow(tenant.companyId, params.flowId);
    await db
      .update(chatbotFlowVersions)
      .set({
        definition: body.definition,
        validationErrors: validation.errors,
        updatedAt: new Date(),
      })
      .where(eq(chatbotFlowVersions.id, draftVersion.id));
  }

  const flow = await getFlowOrThrow(tenant.companyId, params.flowId);
  await recordSecurityAuditLog({
    requestId: c.get("requestId"),
    companyId: tenant.companyId,
    userId: user.id,
    sessionId: user.sessionId,
    route: c.req.path,
    action: "chatbot_flow.update",
    result: "success",
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
    metadata: {
      flowId: params.flowId,
      hasDefinition: body.definition !== undefined,
    },
  });
  return ok(c, await serializeFlow(tenant.companyId, flow));
}

export async function deleteChatbotFlow(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = chatbotFlowParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(chatbotFlows)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(chatbotFlows.companyId, tenant.companyId), eq(chatbotFlows.id, params.flowId), isNull(chatbotFlows.deletedAt)))
    .returning({ id: chatbotFlows.id });

  if (!deleted) {
    throw AppError.notFound("Chatbot flow not found");
  }

  await recordSecurityAuditLog({
    requestId: c.get("requestId"),
    companyId: tenant.companyId,
    userId: user.id,
    sessionId: user.sessionId,
    route: c.req.path,
    action: "chatbot_flow.delete",
    result: "success",
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
    metadata: { flowId: deleted.id },
  });

  return ok(c, { deleted: true, id: deleted.id });
}

export async function createChatbotFlowVersion(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = chatbotFlowParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as CreateChatbotFlowVersionInput;
  await getFlowOrThrow(tenant.companyId, params.flowId);
  const currentDraft = await getDraftVersionOrThrow(tenant.companyId, params.flowId);

  const definition = (body.definition ?? currentDraft.definition) as ChatbotFlowDefinition;
  const validation = validateFlowDefinition(definition);

  const [version] = await db
    .insert(chatbotFlowVersions)
    .values({
      companyId: tenant.companyId,
      flowId: params.flowId,
      versionNumber: currentDraft.versionNumber + 1,
      state: "draft",
      definition,
      validationErrors: validation.errors,
      createdBy: user.id,
    })
    .returning();

  await recordSecurityAuditLog({
    requestId: c.get("requestId"),
    companyId: tenant.companyId,
    userId: user.id,
    sessionId: user.sessionId,
    route: c.req.path,
    action: "chatbot_flow.create_version",
    result: "success",
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
    metadata: { flowId: params.flowId, versionId: version.id },
  });

  return ok(c, version, 201);
}

export async function listChatbotFlowVersions(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = chatbotFlowParamSchema.parse(c.req.param());
  await getFlowOrThrow(tenant.companyId, params.flowId);

  const items = await db
    .select()
    .from(chatbotFlowVersions)
    .where(and(eq(chatbotFlowVersions.companyId, tenant.companyId), eq(chatbotFlowVersions.flowId, params.flowId)))
    .orderBy(desc(chatbotFlowVersions.versionNumber));

  return ok(c, { items });
}

export async function publishChatbotFlow(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = chatbotFlowParamSchema.parse(c.req.param());

  const result = await publishFlowVersion({
    companyId: tenant.companyId,
    flowId: params.flowId,
  });

  await recordSecurityAuditLog({
    requestId: c.get("requestId"),
    companyId: tenant.companyId,
    userId: user.id,
    sessionId: user.sessionId,
    route: c.req.path,
    action: "chatbot_flow.publish",
    result: "success",
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
    metadata: { flowId: params.flowId },
  });

  return ok(c, result);
}

export async function testRunChatbotFlow(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = chatbotFlowParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as TestRunChatbotFlowInput;
  await getFlowOrThrow(tenant.companyId, params.flowId);

  const conversation = await createFlowTestConversation({
    companyId: tenant.companyId,
    accountId: body.accountId,
    contactHandle: body.contactHandle,
    contactName: body.contactName,
    createdBy: user.id,
  });

  const result = await startFlowExecution({
    companyId: tenant.companyId,
    flowId: params.flowId,
    socialConversationId: conversation.id,
    createdBy: user.id,
    triggerSource: "manual_test",
    context: {
      ...(body.initialContext ?? {}),
      contactHandle: body.contactHandle,
      contactName: body.contactName ?? null,
      leadId: body.leadId ?? null,
      customerId: body.customerId ?? null,
    },
  });

  await recordSecurityAuditLog({
    requestId: c.get("requestId"),
    companyId: tenant.companyId,
    userId: user.id,
    sessionId: user.sessionId,
    route: c.req.path,
    action: "chatbot_flow.test_run",
    result: "success",
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
    metadata: {
      flowId: params.flowId,
      conversationId: conversation.id,
    },
  });

  return ok(c, {
    conversationId: conversation.id,
    ...result,
  }, 201);
}

export async function listChatbotFlowExecutions(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = chatbotFlowParamSchema.parse(c.req.param());
  await getFlowOrThrow(tenant.companyId, params.flowId);

  const items = await db
    .select()
    .from(chatbotFlowExecutions)
    .where(and(eq(chatbotFlowExecutions.companyId, tenant.companyId), eq(chatbotFlowExecutions.flowId, params.flowId)))
    .orderBy(desc(chatbotFlowExecutions.updatedAt));

  return ok(c, { items });
}

export async function getChatbotFlowExecution(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = chatbotFlowExecutionParamSchema.parse(c.req.param());

  const [execution] = await db
    .select()
    .from(chatbotFlowExecutions)
    .where(and(eq(chatbotFlowExecutions.companyId, tenant.companyId), eq(chatbotFlowExecutions.id, params.executionId)))
    .limit(1);

  if (!execution) {
    throw AppError.notFound("Chatbot flow execution not found");
  }

  const [logs, conversationState] = await Promise.all([
    db
      .select()
      .from(chatbotFlowExecutionLogs)
      .where(and(eq(chatbotFlowExecutionLogs.companyId, tenant.companyId), eq(chatbotFlowExecutionLogs.executionId, execution.id)))
      .orderBy(desc(chatbotFlowExecutionLogs.createdAt)),
    db
      .select()
      .from(conversationStates)
      .where(eq(conversationStates.id, execution.conversationStateId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  return ok(c, {
    ...execution,
    conversationState,
    logs,
  });
}
