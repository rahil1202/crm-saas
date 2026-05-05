import { describe, expect, test } from "bun:test";
import crypto from "node:crypto";

import { verifyWhatsappWebhookSignatureForWorkspace } from "@/lib/whatsapp-runtime";

describe("WhatsApp middleware signature verification", () => {
  const workspace = { appSecret: "unit-test-secret" } as Parameters<typeof verifyWhatsappWebhookSignatureForWorkspace>[2];

  test("accepts a valid x-hub-signature-256 header for the exact raw body", () => {
    const rawBody = JSON.stringify({ entry: [{ id: "waba_1" }] });
    const signature = `sha256=${crypto.createHmac("sha256", "unit-test-secret").update(rawBody).digest("hex")}`;

    expect(() => verifyWhatsappWebhookSignatureForWorkspace(rawBody, signature, workspace)).not.toThrow();
  });

  test("rejects signatures generated from a mutated body", () => {
    const rawBody = '{"entry":[{"id":"waba_1"}]}';
    const mutatedBody = JSON.stringify(JSON.parse(rawBody), null, 2);
    const signature = `sha256=${crypto.createHmac("sha256", "unit-test-secret").update(mutatedBody).digest("hex")}`;

    expect(() => verifyWhatsappWebhookSignatureForWorkspace(rawBody, signature, workspace)).toThrow("Invalid Meta webhook signature");
  });

  test("rejects missing or malformed signature headers", () => {
    expect(() => verifyWhatsappWebhookSignatureForWorkspace("{}", null, workspace)).toThrow("Missing Meta webhook signature");
    expect(() => verifyWhatsappWebhookSignatureForWorkspace("{}", "md5=bad", workspace)).toThrow("Missing Meta webhook signature");
  });
});
