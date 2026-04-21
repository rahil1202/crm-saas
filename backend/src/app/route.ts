import { Hono } from "hono";
import { cors } from "hono/cors";

import { env } from "@/lib/config";
import { ok } from "@/lib/api";
import { errorMiddleware, requestIdMiddleware } from "@/middleware/common";
import { applySecurityHeaders, resolveClientIp } from "@/middleware/security";
import type { AppVariables } from "@/types/app";
import { authRoutes } from "@/modules/auth/route";
import { adminRoutes } from "@/modules/admin/route";
import { automationRoutes } from "@/modules/automation/route";
import { chatbotFlowRoutes } from "@/modules/chatbot-flows/route";
import { campaignRoutes } from "@/modules/campaigns/route";
import { companyRoutes } from "@/modules/companies/route";
import { companyRoleRoutes } from "@/modules/company-roles/route";
import { customerRoutes } from "@/modules/customers/route";
import { dealRoutes } from "@/modules/deals/route";
import { documentRoutes } from "@/modules/documents/route";
import { formRoutes } from "@/modules/forms/route";
import { leadRoutes } from "@/modules/leads/route";
import { meetingRoutes } from "@/modules/meetings/route";
import { notificationRoutes } from "@/modules/notifications/route";
import { partnerRoutes } from "@/modules/partners/route";
import { publicRuntimeRoutes } from "@/modules/public-runtime/route";
import { reportRoutes } from "@/modules/reports/route";
import { settingRoutes } from "@/modules/settings/route";
import { socialRoutes } from "@/modules/social/route";
import { taskRoutes } from "@/modules/tasks/route";
import { templateRoutes } from "@/modules/templates/route";
import { userRoutes } from "@/modules/users/route";
import { whatsappRoutes } from "@/modules/whatsapp/route";
import { leadIntelligenceRoutes } from "@/modules/lead-intelligence/route";
import { sequenceRoutes } from "@/modules/sequences/route";
import { uptime } from "process";

export type AppEnv = { Variables: AppVariables };

export const app = new Hono<AppEnv>();

app.use("*", requestIdMiddleware);
app.use("*", resolveClientIp);
app.use("*", applySecurityHeaders);
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return env.FRONTEND_URL;
      }
      return origin === env.FRONTEND_URL ? origin : null;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-company-id", "x-store-id", "x-request-id"],
    exposeHeaders: ["x-request-id"],
    credentials: true,
  }),
);

app.onError(errorMiddleware);

app.get("/", (c) =>
  ok(c, {
    name: "backend-api",
    status: "ok",
    uptime: uptime(),
  }),
);

app.get("/health", (c) => ok(c, { ok: true }));

const api = new Hono<AppEnv>().basePath("/api/v1");

api.route("/", authRoutes);
api.route("/", adminRoutes);
api.route("/", companyRoutes);
api.route("/", companyRoleRoutes);
api.route("/", userRoutes);
api.route("/", customerRoutes);
api.route("/", leadRoutes);
api.route("/", meetingRoutes);
api.route("/", dealRoutes);
api.route("/", formRoutes);
api.route("/", documentRoutes);
api.route("/", taskRoutes);
api.route("/", partnerRoutes);
api.route("/", publicRuntimeRoutes);
api.route("/", campaignRoutes);
api.route("/", templateRoutes);
api.route("/", automationRoutes);
api.route("/", chatbotFlowRoutes);
api.route("/", reportRoutes);
api.route("/", notificationRoutes);
api.route("/", settingRoutes);
api.route("/", socialRoutes);
api.route("/", whatsappRoutes);
api.route("/", leadIntelligenceRoutes);
api.route("/", sequenceRoutes);

app.route("/", api);
