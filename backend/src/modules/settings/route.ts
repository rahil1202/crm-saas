import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  getCompanyPreferences,
  getCustomFields,
  getIntegrations,
  getLeadSources,
  getNotificationRules,
  getPipelines,
  getRuntimeReadiness,
  getSettingsOverview,
  getTags,
  updateCompanyPreferences,
  updateCustomFields,
  updateIntegrations,
  updateLeadSources,
  updateNotificationRules,
  updatePipelines,
  updateTags,
} from "@/modules/settings/controller";
import {
  updateCompanyPreferencesSchema,
  updateCustomFieldsSchema,
  updateIntegrationsSchema,
  updateLeadSourcesSchema,
  updateNotificationRulesSchema,
  updatePipelineSettingsSchema,
  updateTagsSchema,
} from "@/modules/settings/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";

export const settingRoutes = new Hono<AppEnv>().basePath("/settings");

settingRoutes.get("/", getSettingsOverview);
settingRoutes.get("/pipelines", requireAuth, requireTenant, getPipelines);
settingRoutes.patch("/pipelines", requireAuth, requireTenant, requireRole("admin"), validateJson(updatePipelineSettingsSchema), updatePipelines);
settingRoutes.get("/lead-sources", requireAuth, requireTenant, getLeadSources);
settingRoutes.patch("/lead-sources", requireAuth, requireTenant, requireRole("admin"), validateJson(updateLeadSourcesSchema), updateLeadSources);
settingRoutes.get("/company-preferences", requireAuth, requireTenant, getCompanyPreferences);
settingRoutes.patch(
  "/company-preferences",
  requireAuth,
  requireTenant,
  requireRole("admin"),
  validateJson(updateCompanyPreferencesSchema),
  updateCompanyPreferences,
);
settingRoutes.get("/custom-fields", requireAuth, requireTenant, getCustomFields);
settingRoutes.patch("/custom-fields", requireAuth, requireTenant, requireRole("admin"), validateJson(updateCustomFieldsSchema), updateCustomFields);
settingRoutes.get("/tags", requireAuth, requireTenant, getTags);
settingRoutes.patch("/tags", requireAuth, requireTenant, requireRole("admin"), validateJson(updateTagsSchema), updateTags);
settingRoutes.get("/notification-rules", requireAuth, requireTenant, getNotificationRules);
settingRoutes.patch(
  "/notification-rules",
  requireAuth,
  requireTenant,
  requireRole("admin"),
  validateJson(updateNotificationRulesSchema),
  updateNotificationRules,
);
settingRoutes.get("/integrations", requireAuth, requireTenant, getIntegrations);
settingRoutes.get("/runtime-readiness", requireAuth, requireTenant, getRuntimeReadiness);
settingRoutes.patch("/integrations", requireAuth, requireTenant, requireRole("admin"), validateJson(updateIntegrationsSchema), updateIntegrations);
