import { describe, expect, test } from "bun:test";

import { evaluateActionCondition } from "@/lib/automation-runtime";
import { normalizePhoneToE164 } from "@/lib/whatsapp-workspace";

describe("Phase V2 phone normalization", () => {
  test("normalizes plain digits into E.164", () => {
    expect(normalizePhoneToE164("919876543210")).toBe("+919876543210");
  });

  test("rejects invalid short phone values", () => {
    expect(() => normalizePhoneToE164("1234")).toThrow();
  });
});

describe("Phase V2 conditional branching helper", () => {
  test("matches equals condition", () => {
    expect(
      evaluateActionCondition(
        { field: "channel", operator: "equals", value: "whatsapp" },
        { channel: "whatsapp" },
      ),
    ).toBe(true);
  });

  test("does not match when expected value differs", () => {
    expect(
      evaluateActionCondition(
        { field: "score", operator: "gt", value: 60 },
        { score: 40 },
      ),
    ).toBe(false);
  });

  test("supports nested all/any multi-condition logic", () => {
    expect(
      evaluateActionCondition(
        {
          all: [
            { field: "score", operator: "gte", value: 70 },
            { any: [{ field: "channel", operator: "equals", value: "whatsapp" }, { field: "source", operator: "equals", value: "campaign" }] },
          ],
        },
        { score: 75, channel: "email", source: "campaign" },
      ),
    ).toBe(true);
  });
});
