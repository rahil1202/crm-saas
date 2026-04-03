import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  captureSocialConversation,
  convertSocialConversationToLead,
  createSocialAccount,
  createSocialMessage,
  deleteSocialAccount,
  getSocialMessages,
  getSocialOverview,
  listSocialAccounts,
  listSocialInbox,
  listWhatsappLog,
  sendWhatsappConversationMessage,
  updateSocialAccount,
  updateSocialConversation,
} from "@/modules/social/controller";
import {
  captureSocialConversationSchema,
  createSocialMessageSchema,
  listSocialAccountsSchema,
  listSocialInboxSchema,
  listWhatsappLogSchema,
  socialAccountSchema,
  sendWhatsappMessageSchema,
  updateSocialAccountSchema,
  updateSocialConversationSchema,
  convertSocialConversationSchema,
} from "@/modules/social/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";

export const socialRoutes = new Hono<AppEnv>().basePath("/social");
socialRoutes.use("*", requireAuth, requireTenant);

socialRoutes.get("/", getSocialOverview);
socialRoutes.get("/accounts", validateQuery(listSocialAccountsSchema), listSocialAccounts);
socialRoutes.get("/whatsapp/log", validateQuery(listWhatsappLogSchema), listWhatsappLog);
socialRoutes.post("/accounts", requireRole("admin"), validateJson(socialAccountSchema), createSocialAccount);
socialRoutes.patch("/accounts/:accountId", requireRole("admin"), validateJson(updateSocialAccountSchema), updateSocialAccount);
socialRoutes.delete("/accounts/:accountId", requireRole("admin"), deleteSocialAccount);
socialRoutes.get("/inbox", validateQuery(listSocialInboxSchema), listSocialInbox);
socialRoutes.post("/capture", requireRole("admin"), validateJson(captureSocialConversationSchema), captureSocialConversation);
socialRoutes.get("/inbox/:conversationId/messages", getSocialMessages);
  socialRoutes.post("/inbox/:conversationId/messages", requireRole("admin"), validateJson(createSocialMessageSchema), createSocialMessage);
socialRoutes.patch("/inbox/:conversationId", requireRole("admin"), validateJson(updateSocialConversationSchema), updateSocialConversation);
socialRoutes.post("/inbox/:conversationId/convert-to-lead", requireRole("admin"), validateJson(convertSocialConversationSchema), convertSocialConversationToLead);
socialRoutes.post("/whatsapp/send", requireRole("admin"), validateJson(sendWhatsappMessageSchema), sendWhatsappConversationMessage);
socialRoutes.post("/whatsapp/test-send", requireRole("admin"), validateJson(sendWhatsappMessageSchema), sendWhatsappConversationMessage);
