import type { Context } from "hono";

export function ok(c: Context, data: unknown) {
  return c.json({ success: true, data });
}
