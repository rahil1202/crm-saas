import type { MiddlewareHandler } from "hono";
import { ZodError, type ZodType } from "zod";

import { fail } from "@/lib/api";
import { AppError } from "@/lib/errors";

export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("x-request-id", requestId);
  await next();
};

export const errorMiddleware = (error: Error, c: Parameters<MiddlewareHandler>[0]) => {
  if (error instanceof AppError) {
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
    const parsed = schema.parse(await c.req.json());
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
