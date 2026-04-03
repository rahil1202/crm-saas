import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { authRefreshTokens, authSessions, requestRateLimits, securityAuditLogs, webhookReplayGuards } from "@/db/schema";
import { AppError } from "@/lib/errors";

export interface SecurityAuditInput {
  requestId?: string | null;
  companyId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  route: string;
  action: string;
  result: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RateLimitRule {
  scope: string;
  limit: number;
  windowSeconds: number;
  resolveKey: (input: { clientIp: string; userId?: string | null; companyId?: string | null; body?: unknown }) => string | null;
}

export interface RateLimitPolicy {
  name: string;
  rules: RateLimitRule[];
}

export const bodyLimits = {
  authSensitive: 16 * 1024,
  tenantDefault: 256 * 1024,
  webhookStrict: 1024 * 1024,
} as const;

export const routePolicies = {
  authSensitive: {
    name: "auth_sensitive",
    rules: [
      {
        scope: "auth:ip",
        limit: 10,
        windowSeconds: 60,
        resolveKey: ({ clientIp }) => clientIp || "unknown",
      },
      {
        scope: "auth:identity",
        limit: 5,
        windowSeconds: 60,
        resolveKey: ({ body }) => {
          if (!body || typeof body !== "object") return null;
          const email = "email" in body && typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
          return email && email.length > 0 ? email : null;
        },
      },
    ],
  } satisfies RateLimitPolicy,
  publicWebhookStrict: {
    name: "public_webhook_strict",
    rules: [
      {
        scope: "public_webhook:ip",
        limit: 60,
        windowSeconds: 60,
        resolveKey: ({ clientIp }) => clientIp || "unknown",
      },
    ],
  } satisfies RateLimitPolicy,
  tenantRead: {
    name: "tenant_read",
    rules: [
      {
        scope: "tenant_read:user",
        limit: 180,
        windowSeconds: 60,
        resolveKey: ({ userId }) => userId ?? null,
      },
      {
        scope: "tenant_read:company",
        limit: 600,
        windowSeconds: 60,
        resolveKey: ({ companyId }) => companyId ?? null,
      },
    ],
  } satisfies RateLimitPolicy,
  tenantWrite: {
    name: "tenant_write",
    rules: [
      {
        scope: "tenant_write:user",
        limit: 90,
        windowSeconds: 60,
        resolveKey: ({ userId }) => userId ?? null,
      },
      {
        scope: "tenant_write:company",
        limit: 240,
        windowSeconds: 60,
        resolveKey: ({ companyId }) => companyId ?? null,
      },
    ],
  } satisfies RateLimitPolicy,
  adminSensitive: {
    name: "admin_sensitive",
    rules: [
      {
        scope: "admin_sensitive:user",
        limit: 60,
        windowSeconds: 60,
        resolveKey: ({ userId }) => userId ?? null,
      },
      {
        scope: "admin_sensitive:company",
        limit: 180,
        windowSeconds: 60,
        resolveKey: ({ companyId }) => companyId ?? null,
      },
    ],
  } satisfies RateLimitPolicy,
  sendMessage: {
    name: "send_message",
    rules: [
      {
        scope: "send_message:user",
        limit: 20,
        windowSeconds: 60,
        resolveKey: ({ userId }) => userId ?? null,
      },
      {
        scope: "send_message:company",
        limit: 80,
        windowSeconds: 60,
        resolveKey: ({ companyId }) => companyId ?? null,
      },
    ],
  } satisfies RateLimitPolicy,
} as const;

function sanitizeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) {
    return {};
  }
  return metadata;
}

export async function recordSecurityAuditLog(input: SecurityAuditInput) {
  try {
    await db.insert(securityAuditLogs).values({
      requestId: input.requestId ?? null,
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      route: input.route,
      action: input.action,
      result: input.result,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: sanitizeMetadata(input.metadata),
    });
  } catch (error) {
    console.error("Failed to write security audit log", error);
  }
}

export async function ensureAuthSession(input: {
  sessionId: string;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  expiresAt: Date;
}) {
  await db
    .insert(authSessions)
    .values({
      id: input.sessionId,
      userId: input.userId,
      status: "active",
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      expiresAt: input.expiresAt,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: authSessions.id,
      set: {
        userId: input.userId,
        status: "active",
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        expiresAt: input.expiresAt,
        lastSeenAt: new Date(),
        revokedAt: null,
        revokeReason: null,
        updatedAt: new Date(),
      },
    });
}

export async function requireActiveAuthSession(input: { sessionId: string; userId: string }) {
  const [session] = await db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.id, input.sessionId),
        eq(authSessions.userId, input.userId),
        eq(authSessions.status, "active"),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!session) {
    throw AppError.unauthorized("Session is invalid or revoked");
  }

  return session;
}

export async function revokeAuthSession(input: { sessionId: string; reason: string }) {
  await db
    .update(authSessions)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      revokeReason: input.reason,
      updatedAt: new Date(),
    })
    .where(eq(authSessions.id, input.sessionId));

  await db
    .update(authRefreshTokens)
    .set({
      revokedAt: new Date(),
    })
    .where(and(eq(authRefreshTokens.sessionId, input.sessionId), isNull(authRefreshTokens.revokedAt)));
}

export async function touchAuthSession(input: { sessionId: string; expiresAt?: Date }) {
  await db
    .update(authSessions)
    .set({
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(authSessions.id, input.sessionId));
}

export async function consumeRateLimit(policy: RateLimitPolicy, input: {
  clientIp: string;
  userId?: string | null;
  companyId?: string | null;
  body?: unknown;
}) {
  const now = new Date();

  for (const rule of policy.rules) {
    const resolvedKey = rule.resolveKey(input);
    if (!resolvedKey) {
      continue;
    }

    const windowStartMs = Math.floor(now.getTime() / (rule.windowSeconds * 1000)) * rule.windowSeconds * 1000;
    const windowStart = new Date(windowStartMs);
    const expiresAt = new Date(windowStartMs + rule.windowSeconds * 1000);

    const [bucket] = await db
      .insert(requestRateLimits)
      .values({
        scope: rule.scope,
        bucketKey: resolvedKey,
        windowStart,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [requestRateLimits.scope, requestRateLimits.bucketKey, requestRateLimits.windowStart],
        set: {
          hitCount: sql`${requestRateLimits.hitCount} + 1`,
          expiresAt,
          updatedAt: new Date(),
        },
      })
      .returning({
        hitCount: requestRateLimits.hitCount,
        expiresAt: requestRateLimits.expiresAt,
      });

    if (bucket.hitCount > rule.limit) {
      throw AppError.tooManyRequests("Request rate limit exceeded", {
        policy: policy.name,
        scope: rule.scope,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1000)),
      });
    }
  }
}

export async function guardWebhookReplay(input: {
  provider: string;
  replayKey: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}) {
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 1000 * 60 * 10);
  const [guard] = await db
    .insert(webhookReplayGuards)
    .values({
      provider: input.provider,
      replayKey: input.replayKey,
      expiresAt,
      metadata: sanitizeMetadata(input.metadata),
    })
    .onConflictDoNothing({
      target: [webhookReplayGuards.provider, webhookReplayGuards.replayKey],
    })
    .returning({ id: webhookReplayGuards.id });

  if (!guard) {
    throw AppError.tooManyRequests("Webhook replay detected", {
      provider: input.provider,
      replayKey: input.replayKey,
    });
  }
}
