import type { MiddlewareHandler } from "hono";

import { consumeRateLimit, type RateLimitPolicy, recordSecurityAuditLog } from "@/lib/security";
import { AppError } from "@/lib/errors";

function parseJsonSafe(rawBody: string) {
  if (!rawBody || rawBody.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return null;
  }
}

export const resolveClientIp: MiddlewareHandler = async (c, next) => {
  const forwardedFor = c.req.header("x-forwarded-for");
  const realIp =
    forwardedFor?.split(",")[0]?.trim() ||
    c.req.header("cf-connecting-ip") ||
    c.req.header("x-real-ip") ||
    "unknown";

  c.set("clientIp", realIp);
  c.set("userAgent", c.req.header("user-agent") ?? null);
  await next();
};

export const applySecurityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "same-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
};

export const enforceBodyLimit = (maxBytes: number): MiddlewareHandler => {
  return async (c, next) => {
    const contentLengthHeader = c.req.header("content-length");
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
    if (contentLength && Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw AppError.payloadTooLarge("Request payload exceeds configured limit", {
        maxBytes,
      });
    }

    const method = c.req.method.toUpperCase();
    if (!["POST", "PUT", "PATCH"].includes(method)) {
      await next();
      return;
    }

    const existingRawBody = c.get("rawBody") as string | undefined;
    const rawBody = existingRawBody ?? (await c.req.text());
    const bodyBytes = Buffer.byteLength(rawBody, "utf8");
    if (bodyBytes > maxBytes) {
      throw AppError.payloadTooLarge("Request payload exceeds configured limit", {
        maxBytes,
      });
    }

    c.set("rawBody", rawBody);
    await next();
  };
};

export const rateLimit = (policy: RateLimitPolicy): MiddlewareHandler => {
  return async (c, next) => {
    const rawBody = (c.get("rawBody") as string | undefined) ?? "";
    const body = parseJsonSafe(rawBody);
    const user = c.get("user");
    const tenant = c.get("tenant");

    try {
      await consumeRateLimit(policy, {
        clientIp: c.get("clientIp") ?? "unknown",
        userId: user?.id ?? null,
        companyId: tenant?.companyId ?? null,
        body,
      });
    } catch (error) {
      if (error instanceof AppError && error.status === 429) {
        await recordSecurityAuditLog({
          requestId: c.get("requestId"),
          companyId: tenant?.companyId ?? null,
          userId: user?.id ?? null,
          sessionId: user?.sessionId ?? null,
          route: c.req.path,
          action: `rate_limit:${policy.name}`,
          result: "blocked",
          ipAddress: c.get("clientIp") ?? null,
          userAgent: c.get("userAgent") ?? null,
          metadata: {
            method: c.req.method,
            details: error.details ?? null,
          },
        });
      }
      throw error;
    }

    await next();
  };
};

export const protectWebhook = (input: {
  provider: string;
  policy: RateLimitPolicy;
  maxBytes: number;
  requiredHeaders?: string[];
  replayHeader?: string;
}): MiddlewareHandler => {
  const bodyLimitMiddleware = enforceBodyLimit(input.maxBytes);
  const rateLimitMiddleware = rateLimit(input.policy);

  return async (c, next) => {
    for (const header of input.requiredHeaders ?? []) {
      const value = c.req.header(header);
      if (!value || value.trim().length === 0) {
        throw AppError.unauthorized(`Missing required ${input.provider} webhook header`);
      }
    }

    if (input.replayHeader) {
      const replayKey = c.req.header(input.replayHeader);
      if (!replayKey || replayKey.trim().length === 0) {
        throw AppError.unauthorized(`Missing required ${input.provider} replay header`);
      }
    }

    await bodyLimitMiddleware(c, async () => {
      await rateLimitMiddleware(c, next);
    });
  };
};
