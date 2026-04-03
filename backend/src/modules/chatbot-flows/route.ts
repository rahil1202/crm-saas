import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  createChatbotFlow,
  createChatbotFlowVersion,
  deleteChatbotFlow,
  getChatbotFlow,
  getChatbotFlowExecution,
  getChatbotFlowOverview,
  listChatbotFlowExecutions,
  listChatbotFlows,
  listChatbotFlowVersions,
  publishChatbotFlow,
  testRunChatbotFlow,
  updateChatbotFlow,
} from "@/modules/chatbot-flows/controller";
import {
  createChatbotFlowSchema,
  createChatbotFlowVersionSchema,
  listChatbotFlowsSchema,
  testRunChatbotFlowSchema,
  updateChatbotFlowSchema,
} from "@/modules/chatbot-flows/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson, validateQuery } from "@/middleware/common";
import { enforceBodyLimit, rateLimit } from "@/middleware/security";
import { bodyLimits, routePolicies } from "@/lib/security";

export const chatbotFlowRoutes = new Hono<AppEnv>().basePath("/chatbot-flows");
chatbotFlowRoutes.use("*", requireAuth, requireTenant, requireRole("admin"));
chatbotFlowRoutes.use("*", rateLimit(routePolicies.adminSensitive));

chatbotFlowRoutes.get("/", getChatbotFlowOverview);
chatbotFlowRoutes.get("/list", validateQuery(listChatbotFlowsSchema), listChatbotFlows);
chatbotFlowRoutes.post("/", enforceBodyLimit(bodyLimits.tenantDefault), validateJson(createChatbotFlowSchema), createChatbotFlow);
chatbotFlowRoutes.get("/executions/:executionId", getChatbotFlowExecution);
chatbotFlowRoutes.get("/:flowId", getChatbotFlow);
chatbotFlowRoutes.patch("/:flowId", enforceBodyLimit(bodyLimits.tenantDefault), validateJson(updateChatbotFlowSchema), updateChatbotFlow);
chatbotFlowRoutes.delete("/:flowId", deleteChatbotFlow);
chatbotFlowRoutes.post("/:flowId/versions", enforceBodyLimit(bodyLimits.tenantDefault), validateJson(createChatbotFlowVersionSchema), createChatbotFlowVersion);
chatbotFlowRoutes.get("/:flowId/versions", listChatbotFlowVersions);
chatbotFlowRoutes.post("/:flowId/publish", publishChatbotFlow);
chatbotFlowRoutes.post("/:flowId/test-run", rateLimit(routePolicies.sendMessage), enforceBodyLimit(bodyLimits.tenantDefault), validateJson(testRunChatbotFlowSchema), testRunChatbotFlow);
chatbotFlowRoutes.get("/:flowId/executions", listChatbotFlowExecutions);
