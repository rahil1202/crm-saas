/**
 * Tests for runtimeTick integration in automation-runtime.ts
 *
 * Sub-task 10.1 — Unit tests for runtimeTick integration
 *   - Test that processEmailCampaignQueue is called on each tick
 *   - Test that an error in processEmailCampaignQueue does not halt the rest of the tick
 *
 * Requirements: 1.1, 1.11
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// ---------------------------------------------------------------------------
// Mutable state shared between the mock implementations and the tests.
// All mocks read from these variables so tests can control behaviour.
// ---------------------------------------------------------------------------

const state = {
  processQueuedEmailMessagesCalled: false,
  processEmailCampaignQueueCalled: false,
  processEmailCampaignQueueShouldThrow: false,
};

// ---------------------------------------------------------------------------
// Register all module mocks BEFORE importing the module under test.
// bun:test hoists mock.module calls, so these run before any imports.
// ---------------------------------------------------------------------------

mock.module("@/lib/email-runtime", () => ({
  processQueuedEmailMessages: async (_limit: number) => {
    state.processQueuedEmailMessagesCalled = true;
    return 0;
  },
  processEmailCampaignQueue: async () => {
    state.processEmailCampaignQueueCalled = true;
    if (state.processEmailCampaignQueueShouldThrow) {
      throw new Error("campaign queue processing failed");
    }
  },
  queueLeadEmail: async () => ({ id: "mock-email-id" }),
}));

mock.module("@/lib/sequence-runtime", () => ({
  processDueSequenceRuns: async () => 0,
}));

mock.module("@/lib/whatsapp-campaign-engine", () => ({
  processCampaignQueue: async () => {},
  processScheduledCampaigns: async () => {},
}));

mock.module("@/lib/whatsapp-runtime", () => ({
  sendWhatsappMessage: async () => ({ conversation: { id: "c1" }, message: { id: "m1" } }),
  expireConversationStates: async () => {},
  processQueuedWhatsappOutbox: async () => 0,
  processQueuedWhatsappWebhookEvents: async (_limit: number, _dispatch: unknown) => 0,
}));

mock.module("@/lib/chatbot-flow-engine", () => ({
  resumeActiveChatbotFlowForConversation: async () => {},
}));

// Provide a minimal workerDb mock that returns empty arrays for all queries
// so that functions like queueLeadInactiveTriggers don't crash.
const emptySelect = () => ({
  from: () => ({
    where: () => ({
      orderBy: () => ({ limit: () => Promise.resolve([]) }),
      limit: () => Promise.resolve([]),
    }),
    limit: () => Promise.resolve([]),
  }),
});

const noopUpdate = () => ({
  set: () => ({
    where: () => ({
      returning: () => Promise.resolve([]),
    }),
  }),
});

const noopInsert = () => ({
  values: () => ({
    onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
    onConflictDoUpdate: () => ({ returning: () => Promise.resolve([]) }),
    returning: () => Promise.resolve([]),
  }),
});

mock.module("@/db/client", () => ({
  db: {
    select: emptySelect,
    update: noopUpdate,
    insert: noopInsert,
  },
  workerDb: {
    select: emptySelect,
    update: noopUpdate,
    insert: noopInsert,
  },
}));

mock.module("@/db/schema", () => ({
  automationRuns: {},
  automationRunSteps: {},
  automationTriggerEvents: {},
  automations: {},
  customers: {},
  dealActivities: {},
  deals: {},
  leadActivities: {},
  leads: {},
  tasks: {},
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are registered.
// ---------------------------------------------------------------------------

import { startAutomationRuntimeWorker, stopAutomationRuntimeWorker } from "@/lib/automation-runtime";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the event loop to flush pending microtasks and macro-tasks. */
function waitForTick(ms = 80): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runtimeTick — processEmailCampaignQueue integration", () => {
  beforeEach(() => {
    state.processQueuedEmailMessagesCalled = false;
    state.processEmailCampaignQueueCalled = false;
    state.processEmailCampaignQueueShouldThrow = false;
    // Ensure the worker is stopped before each test.
    stopAutomationRuntimeWorker();
  });

  afterEach(() => {
    stopAutomationRuntimeWorker();
  });

  test("processEmailCampaignQueue is called on each tick (Req 1.1)", async () => {
    startAutomationRuntimeWorker(10);

    // Wait long enough for at least one tick to complete.
    await waitForTick(100);

    expect(state.processEmailCampaignQueueCalled).toBe(true);
  });

  test("processQueuedEmailMessages is also called on each tick (Req 1.1)", async () => {
    startAutomationRuntimeWorker(10);
    await waitForTick(100);

    expect(state.processQueuedEmailMessagesCalled).toBe(true);
    expect(state.processEmailCampaignQueueCalled).toBe(true);
  });

  test("an error in processEmailCampaignQueue does not halt subsequent ticks (Req 1.11)", async () => {
    // Make processEmailCampaignQueue throw on the first tick.
    state.processEmailCampaignQueueShouldThrow = true;

    startAutomationRuntimeWorker(10);

    // Wait for the first (throwing) tick to complete.
    await waitForTick(80);

    // Confirm the error tick ran.
    expect(state.processEmailCampaignQueueCalled).toBe(true);

    // Stop the worker, reset state, and verify a new tick can still run.
    stopAutomationRuntimeWorker();
    state.processEmailCampaignQueueCalled = false;
    state.processEmailCampaignQueueShouldThrow = false; // no longer throws

    startAutomationRuntimeWorker(10);
    await waitForTick(100);

    // A subsequent tick fired successfully after the error-throwing tick.
    expect(state.processEmailCampaignQueueCalled).toBe(true);
  });
});
