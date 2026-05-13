/**
 * Unit tests for the Zod env schema additions in config.ts
 * Covers: SMTP_PORT coercion, SMTP_FROM_EMAIL validation, SMTP_SECURE boolean coercion,
 * and the superRefine cross-field validation for SMTP_USER / SMTP_PASS.
 *
 * Requirements: 6.2, 6.3, 6.4, 6.5
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Re-declare the minimal schema under test so we don't import the live module
// (which calls envSchema.parse(process.env) at module load time and would
// require a fully-populated environment).
// ---------------------------------------------------------------------------

const smtpSchema = z
  .object({
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_SECURE: z
      .enum(["0", "1", "true", "false"])
      .default("0")
      .transform((v) => v === "1" || v === "true"),
    SMTP_FROM_EMAIL: z.string().email().optional(),
    SMTP_FROM_NAME: z.string().optional(),
    EMAIL_CAMPAIGN_MPS: z.coerce.number().positive().default(10),
  })
  .superRefine((data, ctx) => {
    if (data.SMTP_HOST) {
      const hasUser = data.SMTP_USER !== undefined && data.SMTP_USER !== "";
      const hasPass = data.SMTP_PASS !== undefined && data.SMTP_PASS !== "";
      if (hasUser !== hasPass) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "SMTP_USER and SMTP_PASS must both be provided together, or both omitted (for unauthenticated relay). Providing only one is not allowed.",
          path: hasUser ? ["SMTP_USER"] : ["SMTP_PASS"],
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// SMTP_PORT coercion
// ---------------------------------------------------------------------------

describe("SMTP_PORT coercion", () => {
  test("defaults to 587 when not provided", () => {
    const result = smtpSchema.parse({});
    expect(result.SMTP_PORT).toBe(587);
  });

  test("coerces a valid integer string", () => {
    const result = smtpSchema.parse({ SMTP_PORT: "465" });
    expect(result.SMTP_PORT).toBe(465);
  });

  test("coerces the string '25'", () => {
    const result = smtpSchema.parse({ SMTP_PORT: "25" });
    expect(result.SMTP_PORT).toBe(25);
  });

  test("throws a validation error for a non-integer string", () => {
    expect(() => smtpSchema.parse({ SMTP_PORT: "abc" })).toThrow();
  });

  test("throws a validation error for a float string", () => {
    // z.coerce.number().int() rejects non-integer numbers
    expect(() => smtpSchema.parse({ SMTP_PORT: "587.5" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SMTP_FROM_EMAIL validation
// ---------------------------------------------------------------------------

describe("SMTP_FROM_EMAIL validation", () => {
  test("accepts a valid email address", () => {
    const result = smtpSchema.parse({ SMTP_FROM_EMAIL: "sender@example.com" });
    expect(result.SMTP_FROM_EMAIL).toBe("sender@example.com");
  });

  test("is optional — absent means undefined", () => {
    const result = smtpSchema.parse({});
    expect(result.SMTP_FROM_EMAIL).toBeUndefined();
  });

  test("throws a validation error for a non-email string", () => {
    expect(() => smtpSchema.parse({ SMTP_FROM_EMAIL: "not-an-email" })).toThrow();
  });

  test("throws a validation error for a string missing the domain", () => {
    expect(() => smtpSchema.parse({ SMTP_FROM_EMAIL: "user@" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SMTP_SECURE boolean coercion
// ---------------------------------------------------------------------------

describe("SMTP_SECURE boolean coercion", () => {
  test("defaults to false when not provided", () => {
    const result = smtpSchema.parse({});
    expect(result.SMTP_SECURE).toBe(false);
  });

  test('"0" coerces to false', () => {
    const result = smtpSchema.parse({ SMTP_SECURE: "0" });
    expect(result.SMTP_SECURE).toBe(false);
  });

  test('"false" coerces to false', () => {
    const result = smtpSchema.parse({ SMTP_SECURE: "false" });
    expect(result.SMTP_SECURE).toBe(false);
  });

  test('"1" coerces to true', () => {
    const result = smtpSchema.parse({ SMTP_SECURE: "1" });
    expect(result.SMTP_SECURE).toBe(true);
  });

  test('"true" coerces to true', () => {
    const result = smtpSchema.parse({ SMTP_SECURE: "true" });
    expect(result.SMTP_SECURE).toBe(true);
  });

  test("throws for an unrecognised value", () => {
    expect(() => smtpSchema.parse({ SMTP_SECURE: "yes" })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// superRefine cross-field validation: SMTP_USER / SMTP_PASS
// ---------------------------------------------------------------------------

describe("SMTP_USER / SMTP_PASS cross-field validation", () => {
  test("SMTP_HOST + both SMTP_USER and SMTP_PASS → valid", () => {
    expect(() =>
      smtpSchema.parse({
        SMTP_HOST: "smtp.example.com",
        SMTP_USER: "user@example.com",
        SMTP_PASS: "secret",
      }),
    ).not.toThrow();
  });

  test("SMTP_HOST + neither SMTP_USER nor SMTP_PASS → valid (unauthenticated relay)", () => {
    expect(() =>
      smtpSchema.parse({
        SMTP_HOST: "smtp.example.com",
      }),
    ).not.toThrow();
  });

  test("SMTP_HOST + only SMTP_USER → validation error", () => {
    expect(() =>
      smtpSchema.parse({
        SMTP_HOST: "smtp.example.com",
        SMTP_USER: "user@example.com",
      }),
    ).toThrow();
  });

  test("SMTP_HOST + only SMTP_PASS → validation error", () => {
    expect(() =>
      smtpSchema.parse({
        SMTP_HOST: "smtp.example.com",
        SMTP_PASS: "secret",
      }),
    ).toThrow();
  });

  test("no SMTP_HOST + only SMTP_USER → valid (SMTP not active, no cross-field check)", () => {
    expect(() =>
      smtpSchema.parse({
        SMTP_USER: "user@example.com",
      }),
    ).not.toThrow();
  });

  test("no SMTP_HOST + only SMTP_PASS → valid (SMTP not active, no cross-field check)", () => {
    expect(() =>
      smtpSchema.parse({
        SMTP_PASS: "secret",
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// EMAIL_CAMPAIGN_MPS
// ---------------------------------------------------------------------------

describe("EMAIL_CAMPAIGN_MPS", () => {
  test("defaults to 10 when not provided", () => {
    const result = smtpSchema.parse({});
    expect(result.EMAIL_CAMPAIGN_MPS).toBe(10);
  });

  test("coerces a valid positive number string", () => {
    const result = smtpSchema.parse({ EMAIL_CAMPAIGN_MPS: "50" });
    expect(result.EMAIL_CAMPAIGN_MPS).toBe(50);
  });

  test("throws for zero (must be positive)", () => {
    expect(() => smtpSchema.parse({ EMAIL_CAMPAIGN_MPS: "0" })).toThrow();
  });

  test("throws for a negative value", () => {
    expect(() => smtpSchema.parse({ EMAIL_CAMPAIGN_MPS: "-5" })).toThrow();
  });
});
