import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  getCompanyPreferences,
  getLeadSources,
  getPipelines,
  getSettingsOverview,
  updateCompanyPreferences,
  updateLeadSources,
  updatePipelines,
} from "@/modules/settings/controller";
import {
  updateCompanyPreferencesSchema,
  updateLeadSourcesSchema,
  updatePipelineSettingsSchema,
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
