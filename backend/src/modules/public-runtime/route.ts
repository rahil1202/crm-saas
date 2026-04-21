import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { handleEmailReplyWebhook, handleResendWebhookRequest, trackEmailClick, trackEmailOpen } from "@/modules/campaigns/controller";
import { getPublicForm, submitPublicForm } from "@/modules/forms/controller";
import { emailReplyWebhookSchema } from "@/modules/campaigns/schema";
import { publicSubmitSchema } from "@/modules/forms/schema";
import { ingestWhatsappProviderWebhook, verifyWhatsappWebhook } from "@/modules/social/controller";
import { bookPublicMeeting, getPublicMeeting, getPublicMeetingSlots } from "@/modules/meetings/controller";
import { publicBookSchema, publicSlotsQuerySchema } from "@/modules/meetings/schema";
import { validateJson, validateQuery } from "@/middleware/common";
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
publicRuntimeRoutes.get("/forms/:slug", getPublicForm);
publicRuntimeRoutes.post("/forms/:slug/submit", enforceBodyLimit(bodyLimits.authSensitive), rateLimit(routePolicies.publicFormSubmit), validateJson(publicSubmitSchema), submitPublicForm);
publicRuntimeRoutes.get("/meetings/:meetingTypeSlug/:hostSlug", getPublicMeeting);
publicRuntimeRoutes.get("/meetings/:meetingTypeSlug/:hostSlug/slots", validateQuery(publicSlotsQuerySchema), getPublicMeetingSlots);
publicRuntimeRoutes.post(
  "/meetings/:meetingTypeSlug/:hostSlug/book",
  enforceBodyLimit(bodyLimits.authSensitive),
  rateLimit(routePolicies.publicFormSubmit),
  validateJson(publicBookSchema),
  bookPublicMeeting,
);
publicRuntimeRoutes.get("/whatsapp/webhook", verifyWhatsappWebhook);
publicRuntimeRoutes.post("/whatsapp/webhook", protectWebhook({
  provider: "whatsapp",
  policy: routePolicies.publicWebhookStrict,
  maxBytes: bodyLimits.webhookStrict,
  requiredHeaders: ["x-hub-signature-256"],
}), ingestWhatsappProviderWebhook);
