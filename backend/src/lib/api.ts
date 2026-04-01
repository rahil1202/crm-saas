import type { Context } from "hono";

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
  };
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId?: string;
  };
}

export function ok<T>(c: Context, data: T, status = 200) {
  const payload: ApiSuccess<T> = {
    success: true,
    data,
    meta: {
      requestId: c.get("requestId"),
    },
  };
  return c.json(payload, status as never);
}

export function fail(
  c: Context,
  code: string,
  message: string,
  status = 400,
  details?: unknown,
) {
  const payload: ApiFailure = {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      requestId: c.get("requestId"),
    },
  };

  return c.json(payload, status as never);
}
