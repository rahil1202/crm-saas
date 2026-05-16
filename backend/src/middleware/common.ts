import type { MiddlewareHandler } from "hono";
import { ZodError, type ZodType } from "zod";

import { fail } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { recordSecurityAuditLog } from "@/lib/security";

export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);
  await next();
};

export const requestSummaryMiddleware: MiddlewareHandler = async (c, next) => {
  const startedAt = performance.now();
  await next();

  const durationMs = Math.round(performance.now() - startedAt);
  const status = c.res.status;
  const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
  const requestId = c.get("requestId");
  const clientIp = c.get("clientIp") ?? "unknown";
  const timestamp = new Date().toISOString();
  const line = `[request] ${timestamp} ${c.req.method} ${c.req.path} status=${status} durationMs=${durationMs} requestId=${requestId} ip=${clientIp}`;

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
};

export const errorMiddleware = async (error: Error, c: Parameters<MiddlewareHandler>[0]) => {
  if (error instanceof AppError) {
    const timestamp = new Date().toISOString();
    const requestId = c.get("requestId");
    const companyId = c.get("tenant")?.companyId ?? "-";
    const userId = c.get("user")?.id ?? "-";
    const message = `[error] ${timestamp} requestId=${requestId} method=${c.req.method} path=${c.req.path} status=${error.status} code=${error.code} companyId=${companyId} userId=${userId} message=${error.message}`;

    if (error.status >= 500) {
      console.error(message);
    } else {
      console.warn(message);
    }

    if (error.status === 401 || error.status === 403 || error.status === 429 || (c.req.path.startsWith("/api/v1/public/") && error.status >= 400)) {
      await recordSecurityAuditLog({
        requestId: c.get("requestId"),
        companyId: c.get("tenant")?.companyId ?? null,
        userId: c.get("user")?.id ?? null,
        sessionId: c.get("user")?.sessionId ?? null,
        route: c.req.path,
        action: "request.error",
        result: error.code.toLowerCase(),
        ipAddress: c.get("clientIp") ?? null,
        userAgent: c.get("userAgent") ?? null,
        metadata: {
          method: c.req.method,
          status: error.status,
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      });
    }
    return fail(c, error.code, error.message, error.status, error.details);
  }

  if (error instanceof ZodError) {
    return fail(c, "VALIDATION_ERROR", "Request validation failed", 400, error.flatten());
  }

  console.error(error);
  return fail(c, "INTERNAL_ERROR", "Unexpected server error", 500);
};

export const validateJson = <T>(schema: ZodType<T>): MiddlewareHandler => {
  return async (c, next) => {
    const existingRawBody = c.get("rawBody") as string | undefined;
    const rawBody = existingRawBody ?? (await c.req.text());
    c.set("rawBody", rawBody);
    const parsed = schema.parse(rawBody.length > 0 ? JSON.parse(rawBody) : {});
    c.set("validatedBody", parsed);
    await next();
  };
};

export const validateQuery = <T>(schema: ZodType<T>): MiddlewareHandler => {
  return async (c, next) => {
    const parsed = schema.parse(c.req.query());
    c.set("validatedQuery", parsed);
    await next();
  };
};
