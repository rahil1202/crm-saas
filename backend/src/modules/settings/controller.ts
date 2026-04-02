import { eq } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { companySettings } from "@/db/schema";
import { ok } from "@/lib/api";
import { getCompanySettings } from "@/lib/company-settings";
import { AppError } from "@/lib/errors";
import type {
  UpdateCompanyPreferencesInput,
  UpdateLeadSourcesInput,
  UpdatePipelineSettingsInput,
} from "@/modules/settings/schema";

function assertUniqueKeys(values: string[], message: string) {
  if (new Set(values).size !== values.length) {
    throw AppError.badRequest(message);
  }
}

export function getSettingsOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "settings",
    capabilities: ["pipeline-settings", "custom-fields", "tags", "notification-rules", "integrations"],
  });
}

export async function getPipelines(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  return ok(c, await getCompanySettings(tenant.companyId));
}

export async function updatePipelines(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as UpdatePipelineSettingsInput;

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
}

export async function getLeadSources(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const settings = await getCompanySettings(tenant.companyId);

  return ok(c, {
    leadSources: settings.leadSources,
  });
}

export async function updateLeadSources(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as UpdateLeadSourcesInput;

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
}

export async function getCompanyPreferences(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const settings = await getCompanySettings(tenant.companyId);

  return ok(c, {
    businessHours: settings.businessHours,
    branding: settings.branding,
  });
}

export async function updateCompanyPreferences(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as UpdateCompanyPreferencesInput;

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
}
