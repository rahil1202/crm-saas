import { and, count, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";
import crypto from "node:crypto";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { whatsappMessageCosts, whatsappPricingRateCards, whatsappTemplates, whatsappWorkspaces } from "@/db/schema";
import { ok } from "@/lib/api";
import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { decryptIntegrationSecret, encryptIntegrationSecret, isEncryptedSecret } from "@/lib/integration-crypto";
import {
  estimateWhatsappMessageCost,
  getWhatsappPricingRates,
  importWhatsappPricingRateCards,
  type WhatsappPricingCategory,
} from "@/lib/whatsapp-pricing";
import {
  createWhatsappMediaAsset,
  getWhatsappMessageState,
  getWhatsappSession,
  queueWhatsappMessage,
} from "@/lib/whatsapp-runtime";
import { listWhatsappTemplates, listWhatsappWorkspaces, upsertWhatsappTemplate, upsertWhatsappWorkspace } from "@/lib/whatsapp-workspace";
import { whatsappTemplateParamSchema, whatsappWorkspaceParamSchema } from "@/modules/whatsapp/schema";
import type {
  CreateWhatsappMediaInput,
  CreateWhatsappTemplateInput,
  CreateWhatsappWorkspaceInput,
  ListWhatsappTemplatesQuery,
  ListWhatsappWorkspacesQuery,
  SendWhatsappApiMessageInput,
  SyncWhatsappTemplateInput,
  SubmitWhatsappTemplateInput,
  UpdateWhatsappTemplateInput,
  UpdateWhatsappWorkspaceInput,
  EmbeddedSignupExchangeInput,
  ListWhatsappPricingRatesQuery,
  WhatsappPricingEstimateInput,
  WhatsappPricingImportInput,
} from "@/modules/whatsapp/schema";
import { whatsappConversationParamSchema, whatsappMessageParamSchema, whatsappWorkspaceIdParamSchema } from "@/modules/whatsapp/schema";

function maybeEncryptSecret(value?: string | null) {
  if (!value) {
    return null;
  }
  return isEncryptedSecret(value) ? value : encryptIntegrationSecret(value);
}

function hashVerifyToken(value?: string | null) {
  return value ? crypto.createHash("sha256").update(value).digest("hex") : null;
}

function graphBaseUrl() {
  return `https://graph.facebook.com/${env.WHATSAPP_GRAPH_API_VERSION}`;
}

function mapMetaTemplateStatus(status?: unknown): "draft" | "approved" | "rejected" | "paused" {
  const value = typeof status === "string" ? status.toUpperCase() : "";
  if (value === "APPROVED") return "approved";
  if (value === "REJECTED") return "rejected";
  if (value === "PAUSED" || value === "DISABLED") return "paused";
  return "draft";
}

function parseMetaTemplate(template: Record<string, unknown>) {
  const components = Array.isArray(template.components) ? (template.components as Array<Record<string, unknown>>) : [];
  const bodyComponent = components.find((component) => (component.type as string | undefined)?.toUpperCase() === "BODY");
  const body = typeof bodyComponent?.text === "string" ? bodyComponent.text : "";
  const variableMatches = body.match(/{{\d+}}/g) ?? [];
  const variables = Array.from(new Set(variableMatches)).map((key) => ({ key }));
  return {
    name: typeof template.name === "string" ? template.name : "",
    language: typeof template.language === "string" ? template.language : "en",
    category: typeof template.category === "string" ? template.category.toLowerCase() : null,
    status: mapMetaTemplateStatus(template.status),
    body,
    variables,
    components,
    providerTemplateId: typeof template.id === "string" ? template.id : null,
    rejectionReason: typeof template.rejected_reason === "string" ? template.rejected_reason : null,
    qualityScore: typeof template.quality_score === "string" ? template.quality_score : null,
    metadata: template,
  };
}

function getWorkspaceAccessToken(workspace: typeof whatsappWorkspaces.$inferSelect) {
  return workspace.accessToken ? decryptIntegrationSecret(workspace.accessToken) : env.WHATSAPP_ACCESS_TOKEN || null;
}

function stringFrom(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readinessForWorkspace(input: {
  workspace: typeof whatsappWorkspaces.$inferSelect;
  approvedTemplateCount: number;
  pricingRateCount: number;
}) {
  const metadata = input.workspace.metadata ?? {};
  const phoneRegistrationStatus = stringFrom(metadata.phoneRegistrationStatus);
  const tokenValid = metadata.tokenValid === true || Boolean(input.workspace.accessToken || env.WHATSAPP_ACCESS_TOKEN);
  const phoneConnected =
    !phoneRegistrationStatus ||
    ["connected", "verified", "registered", "approved", "live"].includes(phoneRegistrationStatus.toLowerCase());
  const missing: string[] = [];

  if (!input.workspace.isActive) missing.push("Activate the workspace.");
  if (!input.workspace.phoneNumberId) missing.push("Add a Meta phone number ID.");
  if (!input.workspace.businessAccountId) missing.push("Add or connect a WhatsApp Business Account ID.");
  if (!tokenValid) missing.push("Connect a valid access token.");
  if (!input.workspace.webhookKey || !input.workspace.isVerified) missing.push("Verify the keyed Meta webhook.");
  if (!phoneConnected) missing.push(`Phone number is not connected (${phoneRegistrationStatus}).`);
  if (input.approvedTemplateCount === 0) missing.push("Add or sync at least one approved template for template sends.");
  if (input.pricingRateCount === 0) missing.push("Import Meta pricing rate cards before showing cost estimates.");

  const hardBlocked = missing.some((item) =>
    item.includes("Activate") || item.includes("phone number ID") || item.includes("access token") || item.includes("webhook") || item.includes("not connected"),
  );

  return {
    status: missing.length === 0 ? "ready" : hardBlocked ? "blocked" : "limited",
    missing,
    checks: {
      active: input.workspace.isActive,
      phoneNumberConfigured: Boolean(input.workspace.phoneNumberId),
      businessAccountConfigured: Boolean(input.workspace.businessAccountId),
      tokenValid,
      webhookVerified: Boolean(input.workspace.webhookKey && input.workspace.isVerified),
      phoneConnected,
      approvedTemplateCount: input.approvedTemplateCount,
      pricingLoaded: input.pricingRateCount > 0,
    },
    meta: {
      businessVerificationStatus: metadata.businessVerificationStatus ?? null,
      phoneRegistrationStatus: metadata.phoneRegistrationStatus ?? null,
      displayNameStatus: metadata.displayNameStatus ?? null,
      qualityRating: metadata.qualityRating ?? null,
      messagingLimit: metadata.messagingLimit ?? null,
      webhookSubscribedAt: metadata.webhookSubscribedAt ?? null,
      lastMetaSyncAt: metadata.lastMetaSyncAt ?? null,
    },
  };
}

async function getWorkspaceReadiness(companyId: string, workspace: typeof whatsappWorkspaces.$inferSelect) {
  const [[templateCount], [pricingCount]] = await Promise.all([
    db
      .select({ count: count() })
      .from(whatsappTemplates)
      .where(and(eq(whatsappTemplates.companyId, companyId), eq(whatsappTemplates.status, "approved"), isNull(whatsappTemplates.deletedAt))),
    db.select({ count: count() }).from(whatsappPricingRateCards).where(eq(whatsappPricingRateCards.companyId, companyId)),
  ]);

  return readinessForWorkspace({
    workspace,
    approvedTemplateCount: templateCount?.count ?? 0,
    pricingRateCount: pricingCount?.count ?? 0,
  });
}

async function graphGet(path: string, accessToken: string) {
  const response = await fetch(`${graphBaseUrl()}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`);
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw AppError.conflict(`Meta Graph API request failed: ${response.status}`, payload);
  }
  return payload;
}

export function getWhatsappOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "whatsapp",
    capabilities: ["workspaces", "phone-number-mapping", "template-management", "inbox-actions", "outbox", "sessions", "webhooks", "media"],
  });
}

export async function sendWhatsappApiMessage(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as SendWhatsappApiMessageInput;

  const queued = await queueWhatsappMessage({
    companyId: tenant.companyId,
    createdBy: user.id,
    workspaceId: body.workspaceId,
    to: body.to,
    contactName: body.contactName,
    crmRef: body.crmRef,
    mode: body.mode,
    text: body.text,
    template: body.template,
    media: body.media,
    interactive: body.interactive,
    contextMessageId: body.contextMessageId,
    idempotencyKey: body.idempotencyKey,
    priority: body.priority,
    sendAt: body.sendAt ? new Date(body.sendAt) : null,
    variables: body.variables,
  });

  return ok(
    c,
    {
      outboxId: queued.outbox.id,
      internalMessageId: queued.message?.id ?? queued.outbox.socialMessageId,
      conversationId: queued.conversation?.id ?? queued.outbox.conversationId,
      resolvedMode: queued.outbox.resolvedMode,
      serviceWindowExpiresAt: queued.session?.serviceWindowExpiresAt ?? null,
      status: queued.outbox.status,
      duplicate: queued.duplicate,
    },
    202,
  );
}

export async function getWhatsappApiMessage(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappMessageParamSchema.parse(c.req.param());
  const state = await getWhatsappMessageState(tenant.companyId, params.messageId);
  return ok(c, state);
}

export async function getWhatsappConversationSession(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappConversationParamSchema.parse(c.req.param());
  const session = await getWhatsappSession(tenant.companyId, params.conversationId);
  return ok(c, { session });
}

export async function createWhatsappMedia(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateWhatsappMediaInput;

  const asset = await createWhatsappMediaAsset({
    companyId: tenant.companyId,
    workspaceId: body.workspaceId,
    mediaType: body.mediaType,
    sourceUrl: body.sourceUrl,
    providerMediaId: body.providerMediaId,
    caption: body.caption,
    metadata: body.metadata,
    createdBy: user.id,
  });

  return ok(c, { mediaAssetId: asset.id, asset }, 201);
}

export async function getWhatsappWorkspaces(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListWhatsappWorkspacesQuery;
  const items = await listWhatsappWorkspaces(tenant.companyId);
  const filtered = query.q ? items.filter((item) => item.name.toLowerCase().includes(query.q!.toLowerCase())) : items;
  return ok(c, { items: filtered });
}

export async function getWhatsappOnboardingStatus(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const workspaces = await listWhatsappWorkspaces(tenant.companyId);
  const items = await Promise.all(
    workspaces.map(async (workspace) => ({
      workspace,
      readiness: await getWorkspaceReadiness(tenant.companyId, workspace),
    })),
  );

  const primary = items.find((item) => item.readiness.status === "ready") ?? items[0] ?? null;
  return ok(c, {
    status: primary?.readiness.status ?? "blocked",
    activeWorkspaceId: primary?.workspace.id ?? null,
    steps: [
      { key: "choose_method", label: "Choose onboarding method", done: true },
      { key: "connect_meta", label: "Connect Meta/WABA", done: Boolean(primary?.workspace.businessAccountId) },
      { key: "add_number", label: "Add WhatsApp phone number", done: Boolean(primary?.workspace.phoneNumberId) },
      { key: "verify_webhook", label: "Verify webhook", done: Boolean(primary?.workspace.webhookKey && primary.workspace.isVerified) },
      { key: "sync_status", label: "Sync Meta status", done: Boolean(primary?.workspace.metadata?.lastMetaSyncAt) },
      { key: "templates", label: "Configure approved templates", done: Boolean(primary && primary.readiness.checks.approvedTemplateCount > 0) },
      { key: "pricing", label: "Import pricing rate cards", done: Boolean(primary && primary.readiness.checks.pricingLoaded) },
    ],
    workspaces: items,
    embeddedSignup: {
      appId: env.WHATSAPP_META_APP_ID || null,
      configId: env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID || null,
      enabled: Boolean(env.WHATSAPP_META_APP_ID && env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID),
    },
  });
}

export async function createWhatsappWorkspace(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateWhatsappWorkspaceInput;

  const workspace = await upsertWhatsappWorkspace({
    companyId: tenant.companyId,
    createdBy: user.id,
    ...body,
  });

  return ok(c, workspace, 201);
}

export async function exchangeWhatsappEmbeddedSignup(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as EmbeddedSignupExchangeInput;

  let accessToken = body.accessToken ?? null;
  if (!accessToken && body.code) {
    if (!env.WHATSAPP_META_APP_ID || !env.WHATSAPP_META_APP_SECRET) {
      throw AppError.conflict("Meta app credentials are not configured for Embedded Signup exchange");
    }
    const params = new URLSearchParams({
      client_id: env.WHATSAPP_META_APP_ID,
      client_secret: env.WHATSAPP_META_APP_SECRET,
      code: body.code,
    });
    if (env.WHATSAPP_EMBEDDED_SIGNUP_REDIRECT_URI) {
      params.set("redirect_uri", env.WHATSAPP_EMBEDDED_SIGNUP_REDIRECT_URI);
    }
    const response = await fetch(`${graphBaseUrl()}/oauth/access_token?${params.toString()}`);
    const payload = (await response.json().catch(() => ({}))) as { access_token?: string };
    if (!response.ok || !payload.access_token) {
      throw AppError.conflict(`Unable to exchange Embedded Signup code: ${response.status}`, payload);
    }
    accessToken = payload.access_token;
  }

  if (!accessToken) {
    throw AppError.badRequest("Embedded Signup exchange requires a code or access token");
  }
  if (!body.phoneNumberId || !body.businessAccountId) {
    throw AppError.badRequest("Embedded Signup exchange requires phoneNumberId and businessAccountId from Meta session logging");
  }

  const webhookKey = body.webhookKey ?? `wa-${tenant.companyId.slice(0, 8)}-${body.phoneNumberId.slice(-6)}`.toLowerCase();
  const verifyToken = body.verifyToken ?? crypto.randomBytes(24).toString("hex");
  const workspace = await upsertWhatsappWorkspace({
    companyId: tenant.companyId,
    createdBy: user.id,
    name: body.name ?? `WhatsApp ${body.phoneNumberId}`,
    phoneNumberId: body.phoneNumberId,
    businessAccountId: body.businessAccountId,
    webhookKey,
    accessToken,
    verifyToken,
    appSecret: body.appSecret || env.WHATSAPP_APP_SECRET || null,
    activePhoneNumberIds: [body.phoneNumberId],
    isActive: true,
    isVerified: false,
    metadata: {
      ...body.metadata,
      onboardingMethod: "embedded_signup",
      businessId: body.businessId ?? null,
      embeddedSignupAt: new Date().toISOString(),
      readinessStatus: "blocked",
    },
  });

  return ok(c, { workspace, verifyToken, webhookUrl: `${env.BACKEND_URL}/api/v1/public/whatsapp/webhook/${webhookKey}` }, 201);
}

export async function syncWhatsappWorkspaceMeta(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappWorkspaceIdParamSchema.parse(c.req.param());
  const [workspace] = await db
    .select()
    .from(whatsappWorkspaces)
    .where(and(eq(whatsappWorkspaces.companyId, tenant.companyId), eq(whatsappWorkspaces.id, params.id), isNull(whatsappWorkspaces.deletedAt)))
    .limit(1);
  if (!workspace) {
    throw AppError.notFound("WhatsApp workspace not found");
  }

  const accessToken = getWorkspaceAccessToken(workspace);
  if (!accessToken) {
    throw AppError.conflict("Workspace access token is not configured");
  }

  let phonePayload: Record<string, unknown> = {};
  let businessPayload: Record<string, unknown> = {};
  let tokenValid = true;
  try {
    phonePayload = await graphGet(
      `/${workspace.phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,name_status,status,messaging_limit_tier`,
      accessToken,
    );
    if (workspace.businessAccountId) {
      businessPayload = await graphGet(`/${workspace.businessAccountId}?fields=id,name,account_review_status,business_verification_status`, accessToken);
    }
  } catch (error) {
    tokenValid = false;
    if (error instanceof AppError) {
      throw error;
    }
    throw AppError.conflict("Unable to sync Meta workspace status", error);
  }

  const metadata = {
    ...(workspace.metadata ?? {}),
    tokenValid,
    displayPhoneNumber: phonePayload.display_phone_number ?? null,
    verifiedName: phonePayload.verified_name ?? null,
    phoneRegistrationStatus: phonePayload.status ?? "unknown",
    displayNameStatus: phonePayload.name_status ?? null,
    qualityRating: phonePayload.quality_rating ?? null,
    messagingLimit: phonePayload.messaging_limit_tier ?? null,
    businessName: businessPayload.name ?? null,
    businessVerificationStatus: businessPayload.business_verification_status ?? businessPayload.account_review_status ?? null,
    lastMetaSyncAt: new Date().toISOString(),
  };

  const [updated] = await db
    .update(whatsappWorkspaces)
    .set({ metadata, updatedAt: new Date() })
    .where(eq(whatsappWorkspaces.id, workspace.id))
    .returning();
  const readiness = await getWorkspaceReadiness(tenant.companyId, updated);
  const [withReadiness] = await db
    .update(whatsappWorkspaces)
    .set({ metadata: { ...metadata, readinessStatus: readiness.status }, updatedAt: new Date() })
    .where(eq(whatsappWorkspaces.id, workspace.id))
    .returning();

  return ok(c, { workspace: withReadiness, readiness });
}

export async function testWhatsappWorkspaceReadiness(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappWorkspaceIdParamSchema.parse(c.req.param());
  const [workspace] = await db
    .select()
    .from(whatsappWorkspaces)
    .where(and(eq(whatsappWorkspaces.companyId, tenant.companyId), eq(whatsappWorkspaces.id, params.id), isNull(whatsappWorkspaces.deletedAt)))
    .limit(1);
  if (!workspace) {
    throw AppError.notFound("WhatsApp workspace not found");
  }

  const readiness = await getWorkspaceReadiness(tenant.companyId, workspace);
  return ok(c, { workspaceId: workspace.id, readiness });
}

export async function updateWhatsappWorkspace(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappWorkspaceParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateWhatsappWorkspaceInput;

  const [current] = await db
    .select()
    .from(whatsappWorkspaces)
    .where(and(eq(whatsappWorkspaces.companyId, tenant.companyId), eq(whatsappWorkspaces.id, params.workspaceId), isNull(whatsappWorkspaces.deletedAt)))
    .limit(1);
  if (!current) {
    throw AppError.notFound("WhatsApp workspace not found");
  }

  const [updated] = await db
    .update(whatsappWorkspaces)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.phoneNumberId !== undefined ? { phoneNumberId: body.phoneNumberId } : {}),
      ...(body.businessAccountId !== undefined ? { businessAccountId: body.businessAccountId ?? null } : {}),
      ...(body.webhookKey !== undefined ? { webhookKey: body.webhookKey ?? null } : {}),
      ...(body.accessToken !== undefined ? { accessToken: maybeEncryptSecret(body.accessToken) } : {}),
      ...(body.verifyToken !== undefined ? { verifyToken: maybeEncryptSecret(body.verifyToken), verifyTokenHash: hashVerifyToken(body.verifyToken) } : {}),
      ...(body.verifyTokenHash !== undefined ? { verifyTokenHash: body.verifyTokenHash ?? null } : {}),
      ...(body.appSecret !== undefined ? { appSecret: maybeEncryptSecret(body.appSecret) } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.isVerified !== undefined ? { isVerified: body.isVerified } : {}),
      ...(body.activePhoneNumberIds !== undefined ? { activePhoneNumberIds: body.activePhoneNumberIds } : {}),
      ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      updatedAt: new Date(),
    })
    .where(eq(whatsappWorkspaces.id, current.id))
    .returning();

  return ok(c, updated);
}

export async function deleteWhatsappWorkspace(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappWorkspaceParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(whatsappWorkspaces)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      isActive: false,
    })
    .where(and(eq(whatsappWorkspaces.companyId, tenant.companyId), eq(whatsappWorkspaces.id, params.workspaceId), isNull(whatsappWorkspaces.deletedAt)))
    .returning({ id: whatsappWorkspaces.id });

  if (!deleted) {
    throw AppError.notFound("WhatsApp workspace not found");
  }
  return ok(c, { deleted: true, id: deleted.id });
}

export async function getWhatsappTemplates(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListWhatsappTemplatesQuery;
  const items = await listWhatsappTemplates(tenant.companyId, query.q);
  const filtered = items.filter((item) => {
    if (query.workspaceId && item.workspaceId !== query.workspaceId) return false;
    if (query.status && item.status !== query.status) return false;
    return true;
  });
  return ok(c, { items: filtered });
}

export async function createWhatsappTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateWhatsappTemplateInput;

  const item = await upsertWhatsappTemplate({
    companyId: tenant.companyId,
    createdBy: user.id,
    ...body,
  });

  return ok(c, item, 201);
}

export async function syncWhatsappTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as SyncWhatsappTemplateInput;

  const workspaceId = body.workspaceId;
  const workspaceWhere = [eq(whatsappWorkspaces.companyId, tenant.companyId), isNull(whatsappWorkspaces.deletedAt)];
  if (workspaceId) {
    workspaceWhere.push(eq(whatsappWorkspaces.id, workspaceId));
  }

  const [workspace] = await db.select().from(whatsappWorkspaces).where(and(...workspaceWhere)).limit(1);
  if (!workspace) {
    throw AppError.notFound("WhatsApp workspace not found");
  }
  if (!workspace.businessAccountId) {
    throw AppError.conflict("Workspace business account ID is required for template sync");
  }

  const accessToken = getWorkspaceAccessToken(workspace);
  if (!accessToken) {
    throw AppError.conflict("Workspace access token is not configured");
  }

  const synced: Array<{ id: string; name: string; status: string }> = [];
  let nextPath: string | null = `/${workspace.businessAccountId}/message_templates?fields=id,name,language,status,category,components,rejected_reason,quality_score&limit=100`;

  while (nextPath) {
    const payload = await graphGet(nextPath, accessToken) as { data?: Array<Record<string, unknown>>; paging?: { next?: string } };
    const data = payload.data ?? [];
    for (const item of data) {
      const parsed = parseMetaTemplate(item);
      if (!parsed.name) continue;
      const upserted = await upsertWhatsappTemplate({
        companyId: tenant.companyId,
        createdBy: c.get("user").id,
        workspaceId: workspace.id,
        name: parsed.name,
        category: parsed.category,
        language: parsed.language,
        status: parsed.status,
        body: parsed.body || "Template body synced from Meta",
        variables: parsed.variables,
        components: parsed.components,
        providerTemplateId: parsed.providerTemplateId,
        rejectionReason: parsed.rejectionReason,
        qualityScore: parsed.qualityScore,
        lastSyncedAt: new Date(),
        metadata: parsed.metadata,
      });
      synced.push({ id: upserted.id, name: upserted.name, status: upserted.status });
    }

    if (!payload.paging?.next) {
      nextPath = null;
    } else {
      const nextUrl = new URL(payload.paging.next);
      nextUrl.searchParams.delete("access_token");
      nextPath = `${nextUrl.pathname}${nextUrl.search}`;
    }
  }

  return ok(c, { syncedCount: synced.length, items: synced });
}

export async function submitWhatsappTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappTemplateParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as SubmitWhatsappTemplateInput;

  const [template] = await db
    .select()
    .from(whatsappTemplates)
    .where(and(eq(whatsappTemplates.companyId, tenant.companyId), eq(whatsappTemplates.id, params.templateId), isNull(whatsappTemplates.deletedAt)))
    .limit(1);

  if (!template) {
    throw AppError.notFound("WhatsApp template not found");
  }

  const [workspace] = await db
    .select()
    .from(whatsappWorkspaces)
    .where(and(eq(whatsappWorkspaces.companyId, tenant.companyId), eq(whatsappWorkspaces.id, body.workspaceId ?? template.workspaceId ?? ""), isNull(whatsappWorkspaces.deletedAt)))
    .limit(1);
  if (!workspace?.businessAccountId) {
    throw AppError.conflict("Workspace with business account ID is required for template submit");
  }
  const accessToken = getWorkspaceAccessToken(workspace);
  if (!accessToken) {
    throw AppError.conflict("Workspace access token is not configured");
  }

  const components = template.components?.length
    ? template.components
    : [{ type: "BODY", text: template.body }];

  const response = await fetch(`${graphBaseUrl()}/${workspace.businessAccountId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: template.name,
      language: template.language,
      category: (template.category ?? "UTILITY").toUpperCase(),
      components,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw AppError.conflict(`Meta template submit failed: ${response.status}`, payload);
  }

  const [updated] = await db
    .update(whatsappTemplates)
    .set({
      workspaceId: workspace.id,
      providerTemplateId: typeof payload.id === "string" ? payload.id : template.providerTemplateId,
      status: "draft",
      metadata: payload,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappTemplates.id, template.id))
    .returning();

  return ok(c, updated);
}

export async function refreshWhatsappTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappTemplateParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as SubmitWhatsappTemplateInput;

  const [template] = await db
    .select()
    .from(whatsappTemplates)
    .where(and(eq(whatsappTemplates.companyId, tenant.companyId), eq(whatsappTemplates.id, params.templateId), isNull(whatsappTemplates.deletedAt)))
    .limit(1);

  if (!template) {
    throw AppError.notFound("WhatsApp template not found");
  }

  const [workspace] = await db
    .select()
    .from(whatsappWorkspaces)
    .where(and(eq(whatsappWorkspaces.companyId, tenant.companyId), eq(whatsappWorkspaces.id, body.workspaceId ?? template.workspaceId ?? ""), isNull(whatsappWorkspaces.deletedAt)))
    .limit(1);
  if (!workspace?.businessAccountId) {
    throw AppError.conflict("Workspace with business account ID is required for template refresh");
  }
  const accessToken = getWorkspaceAccessToken(workspace);
  if (!accessToken) {
    throw AppError.conflict("Workspace access token is not configured");
  }

  const payload = await graphGet(`/${workspace.businessAccountId}/message_templates?fields=id,name,language,status,category,components,rejected_reason,quality_score&name=${encodeURIComponent(template.name)}`, accessToken) as {
    data?: Array<Record<string, unknown>>;
  };
  const metaTemplate = (payload.data ?? []).find((item) => (item.language as string | undefined) === template.language);
  if (!metaTemplate) {
    throw AppError.notFound("Template not found in Meta workspace");
  }
  const parsed = parseMetaTemplate(metaTemplate);

  const [updated] = await db
    .update(whatsappTemplates)
    .set({
      workspaceId: workspace.id,
      category: parsed.category,
      status: parsed.status,
      body: parsed.body || template.body,
      components: parsed.components,
      providerTemplateId: parsed.providerTemplateId,
      rejectionReason: parsed.rejectionReason,
      qualityScore: parsed.qualityScore,
      metadata: parsed.metadata,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappTemplates.id, template.id))
    .returning();

  return ok(c, updated);
}

export async function updateWhatsappTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappTemplateParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateWhatsappTemplateInput;

  const [updated] = await db
    .update(whatsappTemplates)
    .set({
      ...(body.workspaceId !== undefined ? { workspaceId: body.workspaceId ?? null } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.category !== undefined ? { category: body.category ?? null } : {}),
      ...(body.language !== undefined ? { language: body.language } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.variables !== undefined ? { variables: body.variables } : {}),
      ...(body.components !== undefined ? { components: body.components } : {}),
      ...(body.providerTemplateId !== undefined ? { providerTemplateId: body.providerTemplateId ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(whatsappTemplates.companyId, tenant.companyId), eq(whatsappTemplates.id, params.templateId), isNull(whatsappTemplates.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("WhatsApp template not found");
  }

  return ok(c, updated);
}

export async function deleteWhatsappTemplate(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = whatsappTemplateParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(whatsappTemplates)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(whatsappTemplates.companyId, tenant.companyId), eq(whatsappTemplates.id, params.templateId), isNull(whatsappTemplates.deletedAt)))
    .returning({ id: whatsappTemplates.id });

  if (!deleted) {
    throw AppError.notFound("WhatsApp template not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
}

export async function listWhatsappPricingRates(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListWhatsappPricingRatesQuery;
  const items = await getWhatsappPricingRates({
    companyId: tenant.companyId,
    market: query.market,
    currency: query.currency,
    category: query.category as WhatsappPricingCategory | undefined,
  });

  return ok(c, { items });
}

export async function estimateWhatsappPricing(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as WhatsappPricingEstimateInput;
  const estimate = await estimateWhatsappMessageCost({
    companyId: tenant.companyId,
    toPhoneE164: body.to,
    category: body.category,
    market: body.market,
    countryCode: body.countryCode,
    currency: body.currency,
    billableUnits: body.billableUnits,
    serviceWindowOpen: body.serviceWindowOpen,
  });

  return ok(c, estimate);
}

export async function importWhatsappPricing(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as WhatsappPricingImportInput;
  const result = await importWhatsappPricingRateCards({
    companyId: tenant.companyId,
    sourceVersion: body.sourceVersion,
    sourceUrl: body.sourceUrl,
    records: body.records.map((record) => ({
      market: record.market,
      countryCode: record.countryCode,
      currency: record.currency,
      category: record.category,
      rate: String(record.rate),
      tierFrom: record.tierFrom,
      tierTo: record.tierTo,
      effectiveFrom: new Date(record.effectiveFrom),
      effectiveTo: record.effectiveTo ? new Date(record.effectiveTo) : null,
      metadata: record.metadata,
    })),
  });

  return ok(c, result, 201);
}
