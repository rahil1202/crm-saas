import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { handleEmailReplyWebhook, handleResendWebhookRequest, trackEmailClick, trackEmailOpen } from "@/modules/campaigns/controller";
import { emailReplyWebhookSchema } from "@/modules/campaigns/schema";
import { ingestWhatsappProviderWebhook, verifyWhatsappWebhook } from "@/modules/social/controller";
import { validateJson } from "@/middleware/common";
import { enforceBodyLimit, protectWebhook, rateLimit } from "@/middleware/security";
import { bodyLimits, routePolicies } from "@/lib/security";

export const publicRuntimeRoutes = new Hono<AppEnv>().basePath("/public");

publicRuntimeRoutes.get("/email/open/:token", trackEmailOpen);
publicRuntimeRoutes.get("/email/click/:token", trackEmailClick);
publicRuntimeRoutes.post("/email/reply-webhook", enforceBodyLimit(bodyLimits.webhookStrict), rateLimit(routePolicies.publicWebhookStrict), validateJson(emailReplyWebhookSchema), handleEmailReplyWebhook);
publicRuntimeRoutes.post("/email/resend/webhook", protectWebhook({
  provider: "resend",
  policy: routePolicies.publicWebhookStrict,
  maxBytes: bodyLimits.webhookStrict,
  requiredHeaders: ["svix-id", "svix-timestamp", "svix-signature"],
  replayHeader: "svix-id",
}), handleResendWebhookRequest);
publicRuntimeRoutes.get("/whatsapp/webhook", verifyWhatsappWebhook);
publicRuntimeRoutes.post("/whatsapp/webhook", protectWebhook({
  provider: "whatsapp",
  policy: routePolicies.publicWebhookStrict,
  maxBytes: bodyLimits.webhookStrict,
  requiredHeaders: ["x-hub-signature-256"],
}), ingestWhatsappProviderWebhook);
