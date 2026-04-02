import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "@/app/router";
import { db } from "@/db/client";
import { companySettings } from "@/db/schema";
import { ok } from "@/lib/api";
import { getCompanySettings } from "@/lib/company-settings";
import { AppError } from "@/lib/errors";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";

const pipelineStageSchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
});

const dealPipelineSchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
  stages: z.array(pipelineStageSchema).min(1).max(20),
});

const leadSourceSchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
});

const businessHourSchema = z.object({
  day: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
  enabled: z.boolean(),
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
});

const brandingSchema = z.object({
  companyLabel: z.string().trim().max(120).default(""),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  logoUrl: z.string().url().nullable().optional(),
});

const updatePipelineSettingsSchema = z.object({
  defaultDealPipeline: z.string().trim().min(1).max(100),
  dealPipelines: z.array(dealPipelineSchema).min(1).max(10),
});

const updateLeadSourcesSchema = z.object({
  leadSources: z.array(leadSourceSchema).min(1).max(20),
});

const updateCompanyPreferencesSchema = z.object({
  businessHours: z.array(businessHourSchema).length(7),
  branding: brandingSchema,
});

function assertUniqueKeys(values: string[], message: string) {
  if (new Set(values).size !== values.length) {
    throw AppError.badRequest(message);
  }
}

export const settingRoutes = new Hono<AppEnv>().basePath("/settings");

settingRoutes.get("/", (c) =>
  ok(c, {
    module: "settings",
    capabilities: ["pipeline-settings", "custom-fields", "tags", "notification-rules", "integrations"],
  }),
);

settingRoutes.get("/pipelines", requireAuth, requireTenant, async (c) => {
  const tenant = c.get("tenant");
  return ok(c, await getCompanySettings(tenant.companyId));
});

settingRoutes.patch("/pipelines", requireAuth, requireTenant, requireRole("admin"), validateJson(updatePipelineSettingsSchema), async (c) => {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as z.infer<typeof updatePipelineSettingsSchema>;

  assertUniqueKeys(
    body.dealPipelines.map((pipeline) => pipeline.key),
    "Pipeline keys must be unique",
  );

  for (const pipeline of body.dealPipelines) {
    assertUniqueKeys(
      pipeline.stages.map((stage) => stage.key),
      `Stage keys must be unique within pipeline ${pipeline.key}`,
    );
  }

  const hasDefaultPipeline = body.dealPipelines.some((pipeline) => pipeline.key === body.defaultDealPipeline);

  if (!hasDefaultPipeline) {
    throw AppError.badRequest("Default pipeline must match one of the configured pipelines");
  }

  await getCompanySettings(tenant.companyId);

  const [updated] = await db
    .update(companySettings)
    .set({
      defaultDealPipeline: body.defaultDealPipeline,
      dealPipelines: body.dealPipelines,
      updatedAt: new Date(),
    })
    .where(eq(companySettings.companyId, tenant.companyId))
    .returning();

  return ok(c, {
    defaultDealPipeline: updated.defaultDealPipeline,
    dealPipelines: updated.dealPipelines,
    leadSources: updated.leadSources,
  });
});

settingRoutes.get("/lead-sources", requireAuth, requireTenant, async (c) => {
  const tenant = c.get("tenant");
  const settings = await getCompanySettings(tenant.companyId);

  return ok(c, {
    leadSources: settings.leadSources,
  });
});

settingRoutes.patch("/lead-sources", requireAuth, requireTenant, requireRole("admin"), validateJson(updateLeadSourcesSchema), async (c) => {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as z.infer<typeof updateLeadSourcesSchema>;

  assertUniqueKeys(
    body.leadSources.map((source) => source.key),
    "Lead source keys must be unique",
  );

  await getCompanySettings(tenant.companyId);

  const [updated] = await db
    .update(companySettings)
    .set({
      leadSources: body.leadSources,
      updatedAt: new Date(),
    })
    .where(eq(companySettings.companyId, tenant.companyId))
    .returning();

  return ok(c, {
    leadSources: updated.leadSources,
  });
});

settingRoutes.get("/company-preferences", requireAuth, requireTenant, async (c) => {
  const tenant = c.get("tenant");
  const settings = await getCompanySettings(tenant.companyId);

  return ok(c, {
    businessHours: settings.businessHours,
    branding: settings.branding,
  });
});

settingRoutes.patch("/company-preferences", requireAuth, requireTenant, requireRole("admin"), validateJson(updateCompanyPreferencesSchema), async (c) => {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as z.infer<typeof updateCompanyPreferencesSchema>;

  assertUniqueKeys(
    body.businessHours.map((item) => item.day),
    "Business hours must contain each weekday exactly once",
  );

  await getCompanySettings(tenant.companyId);

  const [updated] = await db
    .update(companySettings)
    .set({
      businessHours: body.businessHours,
      branding: {
        companyLabel: body.branding.companyLabel,
        primaryColor: body.branding.primaryColor,
        accentColor: body.branding.accentColor,
        logoUrl: body.branding.logoUrl ?? null,
      },
      updatedAt: new Date(),
    })
    .where(eq(companySettings.companyId, tenant.companyId))
    .returning();

  return ok(c, {
    businessHours: updated.businessHours,
    branding: updated.branding,
  });
});
