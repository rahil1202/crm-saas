import { describe, expect, test } from "bun:test";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Hono } from "hono";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { errorMiddleware, requestIdMiddleware, validateJson } from "@/middleware/common";
import { applySecurityHeaders, enforceBodyLimit, resolveClientIp } from "@/middleware/security";

function buildTestApp() {
  const testApp = new Hono();
  testApp.use("*", requestIdMiddleware);
  testApp.use("*", resolveClientIp);
  testApp.use("*", applySecurityHeaders);
  testApp.onError(errorMiddleware);
  return testApp;
}

describe("security middleware", () => {
  test("request id and client ip are attached to responses", async () => {
    const testApp = buildTestApp();
    testApp.get("/context", (c) =>
      c.json({
        requestId: c.get("requestId"),
        clientIp: c.get("clientIp"),
      }),
    );

    const response = await testApp.request("/context", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
      },
    });
    const payload = (await response.json()) as { requestId: string; clientIp: string };

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(payload.requestId).toBeTruthy();
    expect(payload.clientIp).toBe("203.0.113.10");
  });

  test("security headers are applied", async () => {
    const testApp = buildTestApp();
    testApp.get("/headers", (c) => c.json({ ok: true }));

    const response = await testApp.request("/headers");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("same-origin");
  });

  test("oversized JSON bodies fail with the API error contract", async () => {
    const testApp = buildTestApp();
    testApp.post(
      "/limited",
      enforceBodyLimit(8),
      validateJson(z.object({ name: z.string() })),
      (c) => c.json({ ok: true }),
    );

    const response = await testApp.request("/limited", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "too-long" }),
    });
    const payload = (await response.json()) as {
      success: false;
      error: { code: string; message: string };
    };

    expect(response.status).toBe(413);
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("security AppError helpers", () => {
  test("rate limit helper preserves status and code", () => {
    const error = AppError.tooManyRequests("Slow down");
    expect(error.status).toBe(429);
    expect(error.code).toBe("RATE_LIMITED");
  });

  test("payload helper preserves status and code", () => {
    const error = AppError.payloadTooLarge("Too big");
    expect(error.status).toBe(413);
    expect(error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("tenant isolation audit coverage", () => {
  const source = (path: string) => readFileSync(resolve(import.meta.dir, "..", path), "utf8");

  test("tenant middleware audits cross-company selection and validates store scope", () => {
    const authMiddleware = source("src/middleware/auth.ts");

    expect(authMiddleware).toContain("recordTenantIsolationViolation");
    expect(authMiddleware).toContain("company_membership_missing");
    expect(authMiddleware).toContain("assertTenantStore");
  });

  test("CRM write controllers validate tenant-owned request IDs before persistence", () => {
    const expectedAssertions: Record<string, string[]> = {
      "src/modules/leads/controller.ts": ["assertTenantStore", "assertTenantMember"],
      "src/modules/customers/controller.ts": ["assertTenantStore", "assertTenantMember", "assertTenantLead"],
      "src/modules/deals/controller.ts": ["assertTenantStore", "assertTenantMember", "assertTenantCustomer", "assertTenantLead"],
      "src/modules/tasks/controller.ts": [
        "assertTenantStore",
        "assertTenantMember",
        "assertTenantLead",
        "assertTenantCustomer",
        "assertTenantDeal",
      ],
    };

    for (const [path, assertions] of Object.entries(expectedAssertions)) {
      const controller = source(path);
      for (const assertion of assertions) {
        expect(controller, `${path} must call ${assertion}`).toContain(assertion);
      }
    }
  });
});
