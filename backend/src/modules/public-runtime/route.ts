import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import { handleEmailReplyWebhook, handleResendWebhookRequest, trackEmailClick, trackEmailOpen } from "@/modules/campaigns/controller";
import { emailReplyWebhookSchema } from "@/modules/campaigns/schema";
import { ingestWhatsappProviderWebhook, verifyWhatsappWebhook } from "@/modules/social/controller";
import { validateJson } from "@/middleware/common";

export const publicRuntimeRoutes = new Hono<AppEnv>().basePath("/public");

publicRuntimeRoutes.get("/email/open/:token", trackEmailOpen);
publicRuntimeRoutes.get("/email/click/:token", trackEmailClick);
publicRuntimeRoutes.post("/email/reply-webhook", validateJson(emailReplyWebhookSchema), handleEmailReplyWebhook);
publicRuntimeRoutes.post("/email/resend/webhook", handleResendWebhookRequest);
publicRuntimeRoutes.get("/whatsapp/webhook", verifyWhatsappWebhook);
publicRuntimeRoutes.post("/whatsapp/webhook", ingestWhatsappProviderWebhook);
