import { Hono } from "hono";
import { cors } from "hono/cors";

import { env } from "@/lib/config";
import { ok } from "@/lib/api";
import { errorMiddleware, requestIdMiddleware } from "@/middleware/common";
import type { AppVariables } from "@/types/app";
import { authRoutes } from "@/modules/auth/routes";
import { automationRoutes } from "@/modules/automation/routes";
import { campaignRoutes } from "@/modules/campaigns/routes";
import { companyRoutes } from "@/modules/companies/routes";
import { customerRoutes } from "@/modules/customers/routes";
import { dealRoutes } from "@/modules/deals/routes";
import { leadRoutes } from "@/modules/leads/routes";
import { notificationRoutes } from "@/modules/notifications/routes";
import { partnerRoutes } from "@/modules/partners/routes";
import { reportRoutes } from "@/modules/reports/routes";
import { settingRoutes } from "@/modules/settings/routes";
import { socialRoutes } from "@/modules/social/routes";
import { taskRoutes } from "@/modules/tasks/routes";
import { templateRoutes } from "@/modules/templates/routes";
import { userRoutes } from "@/modules/users/routes";
import { uptime } from "process";

export type AppEnv = { Variables: AppVariables };

export const app = new Hono<AppEnv>();

app.use("*", requestIdMiddleware);
app.use(
  "/api/*",
  cors({
    origin: env.FRONTEND_URL,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
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
api.route("/", companyRoutes);
api.route("/", userRoutes);
api.route("/", customerRoutes);
api.route("/", leadRoutes);
api.route("/", dealRoutes);
api.route("/", taskRoutes);
api.route("/", partnerRoutes);
api.route("/", campaignRoutes);
api.route("/", templateRoutes);
api.route("/", automationRoutes);
api.route("/", reportRoutes);
api.route("/", notificationRoutes);
api.route("/", settingRoutes);
api.route("/", socialRoutes);

app.route("/", api);
