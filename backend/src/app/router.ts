import { Hono } from "hono";

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

export const app = new Hono();

app.get("/", (c) => {
  return c.json({
    name: "crm-saas-backend",
    status: "ok",
    workspace: "crm-saas/backend",
  });
});

app.get("/health", (c) => {
  return c.json({ ok: true });
});

const api = new Hono().basePath("/api/v1");

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
