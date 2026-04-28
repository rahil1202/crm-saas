import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  disconnectIntegrationOauth,
  getCompanyPreferences,
  getCustomFields,
  getIntegrations,
  getIntegrationsHub,
  getLeadSources,
  getNotificationRules,
  getOutreachAgent,
  getPipelines,
  getRuntimeReadiness,
  getSettingsOverview,
  getTags,
  linkIntegrationOauth,
  updateCompanyPreferences,
  updateCustomFields,
  updateIntegrations,
  updateLeadSources,
  updateNotificationRules,
  updateOutreachAgent,
  updatePipelines,
  updateTags,
} from "@/modules/settings/controller";
import {
  disconnectIntegrationOauthSchema,
  linkIntegrationOauthSchema,
  updateCompanyPreferencesSchema,
  updateCustomFieldsSchema,
  updateIntegrationsSchema,
  updateLeadSourcesSchema,
  updateNotificationRulesSchema,
  updateOutreachAgentSchema,
  updatePipelineSettingsSchema,
  updateTagsSchema,
} from "@/modules/settings/schema";
import { requireAuth, requireModuleAccess, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";

export const settingRoutes = new Hono<AppEnv>().basePath("/settings");

settingRoutes.get("/", getSettingsOverview);
settingRoutes.get("/pipelines", requireAuth, requireTenant, requireModuleAccess("settings"), getPipelines);
settingRoutes.patch(
  "/pipelines",
  requireAuth,
  requireTenant,
  requireModuleAccess("settings"),
  validateJson(updatePipelineSettingsSchema),
  updatePipelines,
);
settingRoutes.get("/lead-sources", requireAuth, requireTenant, requireModuleAccess("settings"), getLeadSources);
settingRoutes.patch(
  "/lead-sources",
  requireAuth,
  requireTenant,
  requireModuleAccess("settings"),
  validateJson(updateLeadSourcesSchema),
  updateLeadSources,
);
settingRoutes.get("/company-preferences", requireAuth, requireTenant, requireModuleAccess("settings"), getCompanyPreferences);
settingRoutes.patch(
  "/company-preferences",
  requireAuth,
  requireTenant,
  requireModuleAccess("settings"),
  validateJson(updateCompanyPreferencesSchema),
  updateCompanyPreferences,
);
settingRoutes.get("/custom-fields", requireAuth, requireTenant, requireModuleAccess("settings"), getCustomFields);
settingRoutes.patch(
  "/custom-fields",
  requireAuth,
  requireTenant,
  requireModuleAccess("settings"),
  validateJson(updateCustomFieldsSchema),
  updateCustomFields,
);
settingRoutes.get("/tags", requireAuth, requireTenant, requireModuleAccess("settings"), getTags);
settingRoutes.patch("/tags", requireAuth, requireTenant, requireModuleAccess("settings"), validateJson(updateTagsSchema), updateTags);
settingRoutes.get("/notification-rules", requireAuth, requireTenant, requireModuleAccess("settings"), getNotificationRules);
settingRoutes.patch(
  "/notification-rules",
  requireAuth,
  requireTenant,
  requireModuleAccess("settings"),
  validateJson(updateNotificationRulesSchema),
  updateNotificationRules,
);
settingRoutes.get("/integrations", requireAuth, requireTenant, requireModuleAccess("integrations"), getIntegrations);
settingRoutes.get("/integration-hub", requireAuth, requireTenant, requireModuleAccess("integrations"), getIntegrationsHub);
settingRoutes.get("/runtime-readiness", requireAuth, requireTenant, requireModuleAccess("settings"), getRuntimeReadiness);
settingRoutes.get("/outreach-agent", requireAuth, requireTenant, requireModuleAccess("settings"), getOutreachAgent);
settingRoutes.patch(
  "/outreach-agent",
  requireAuth,
  requireTenant,
  requireModuleAccess("settings"),
  validateJson(updateOutreachAgentSchema),
  updateOutreachAgent,
);
settingRoutes.patch(
  "/integrations",
  requireAuth,
  requireTenant,
  requireModuleAccess("integrations"),
  validateJson(updateIntegrationsSchema),
  updateIntegrations,
);
settingRoutes.post(
  "/integrations/oauth/link",
  requireAuth,
  requireTenant,
  requireModuleAccess("integrations"),
  validateJson(linkIntegrationOauthSchema),
  linkIntegrationOauth,
);
settingRoutes.post(
  "/integrations/oauth/disconnect",
  requireAuth,
  requireTenant,
  requireModuleAccess("integrations"),
  validateJson(disconnectIntegrationOauthSchema),
  disconnectIntegrationOauth,
);
