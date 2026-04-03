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

export const errorMiddleware = async (error: Error, c: Parameters<MiddlewareHandler>[0]) => {
  if (error instanceof AppError) {
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
