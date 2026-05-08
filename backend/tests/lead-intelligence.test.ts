import { describe, expect, test } from "bun:test";

import { getLeadPriority, matchRuleConditions } from "@/lib/lead-intelligence";

describe("lead scoring priority bands", () => {
  test("classifies hot, warm, nurture, and cold scores", () => {
    expect(getLeadPriority(82).priorityBand).toBe("hot");
    expect(getLeadPriority(51).priorityBand).toBe("warm");
    expect(getLeadPriority(30).priorityBand).toBe("nurture");
    expect(getLeadPriority(12).priorityBand).toBe("cold");
  });

  test("clamps scores before deriving priority", () => {
    expect(getLeadPriority(150).priorityBand).toBe("hot");
    expect(getLeadPriority(-20).priorityBand).toBe("cold");
  });
});

describe("lead scoring rule condition matching", () => {
  test("matches status, tag, score, and priority predicates", () => {
    expect(
      matchRuleConditions(
        {
          toStatus: "qualified",
          requiredTags: ["priority"],
          minScore: 50,
          priorityBands: ["warm"],
        },
        {
          toStatus: "qualified",
          tags: ["priority", "enterprise"],
          score: 64,
        },
      ),
    ).toBe(true);
  });

  test("supports field operator predicates", () => {
    expect(
      matchRuleConditions(
        {
          fields: [
            { field: "metadata.intent", operator: "equals", value: "high" },
            { field: "source", operator: "in", value: ["meta", "website"] },
          ],
        },
        {
          metadata: { intent: "high" },
          source: "meta",
          score: 20,
        },
      ),
    ).toBe(true);
  });
});
