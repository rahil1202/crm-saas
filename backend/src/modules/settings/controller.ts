import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { companySettings, emailAccounts, socialAccounts } from "@/db/schema";
import { ok } from "@/lib/api";
import { getCompanySettings } from "@/lib/company-settings";
import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";
import type {
  UpdateCompanyPreferencesInput,
  UpdateCustomFieldsInput,
  UpdateIntegrationsInput,
  UpdateLeadSourcesInput,
  UpdateNotificationRulesInput,
  UpdatePipelineSettingsInput,
  UpdateTagsInput,
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

export async function getRuntimeReadiness(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const settings = await getCompanySettings(tenant.companyId);

  const [companyEmailAccounts, companyWhatsappAccounts] = await Promise.all([
    db
      .select()
      .from(emailAccounts)
      .where(and(eq(emailAccounts.companyId, tenant.companyId), isNull(emailAccounts.deletedAt))),
    db
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.companyId, tenant.companyId), eq(socialAccounts.platform, "whatsapp"), isNull(socialAccounts.deletedAt))),
  ]);

  const whatsappConfiguredAccounts = companyWhatsappAccounts.filter((account) => {
    const phoneNumberId = account.metadata?.phoneNumberId;
    const token = account.metadata?.accessToken;
    return typeof phoneNumberId === "string" && phoneNumberId.length > 0 && (typeof token === "string" && token.length > 0 || Boolean(env.WHATSAPP_ACCESS_TOKEN));
  });

  return ok(c, {
    email: {
      provider: settings.integrations.emailProvider,
      envReady: Boolean(env.RESEND_API_KEY && env.RESEND_WEBHOOK_SECRET),
      apiKeyConfigured: Boolean(env.RESEND_API_KEY),
      webhookSecretConfigured: Boolean(env.RESEND_WEBHOOK_SECRET),
      accountCount: companyEmailAccounts.length,
      connectedAccounts: companyEmailAccounts.filter((account) => account.status === "connected").length,
      defaultAccountCount: companyEmailAccounts.filter((account) => account.isDefault && account.status === "connected").length,
      webhookUrl: `${env.BACKEND_URL}/api/v1/public/email/resend/webhook`,
    },
    whatsapp: {
      provider: settings.integrations.whatsappProvider,
      envReady: Boolean(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && env.WHATSAPP_APP_SECRET && (env.WHATSAPP_ACCESS_TOKEN || whatsappConfiguredAccounts.length > 0)),
      verifyTokenConfigured: Boolean(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
      appSecretConfigured: Boolean(env.WHATSAPP_APP_SECRET),
      globalAccessTokenConfigured: Boolean(env.WHATSAPP_ACCESS_TOKEN),
      accountCount: companyWhatsappAccounts.length,
      configuredAccountCount: whatsappConfiguredAccounts.length,
      verifyUrl: `${env.BACKEND_URL}/api/v1/public/whatsapp/webhook`,
      eventUrl: `${env.BACKEND_URL}/api/v1/public/whatsapp/webhook`,
    },
  });
}

export async function getCustomFields(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const settings = await getCompanySettings(tenant.companyId);

  return ok(c, {
    customFields: settings.customFields,
  });
}

export async function updateCustomFields(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as UpdateCustomFieldsInput;

  assertUniqueKeys(
    body.customFields.map((item) => item.key),
    "Custom field keys must be unique",
  );

  await getCompanySettings(tenant.companyId);

  const [updated] = await db
    .update(companySettings)
    .set({
      customFields: body.customFields,
      updatedAt: new Date(),
    })
    .where(eq(companySettings.companyId, tenant.companyId))
    .returning();

  return ok(c, {
    customFields: updated.customFields,
  });
}

export async function getTags(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const settings = await getCompanySettings(tenant.companyId);

  return ok(c, {
    tags: settings.tags,
  });
}

export async function updateTags(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as UpdateTagsInput;

  assertUniqueKeys(
    body.tags.map((item) => item.key),
    "Tag keys must be unique",
  );

  await getCompanySettings(tenant.companyId);

  const [updated] = await db
    .update(companySettings)
    .set({
      tags: body.tags,
      updatedAt: new Date(),
    })
    .where(eq(companySettings.companyId, tenant.companyId))
    .returning();

  return ok(c, {
    tags: updated.tags,
  });
}

export async function getNotificationRules(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const settings = await getCompanySettings(tenant.companyId);

  return ok(c, {
    notificationRules: settings.notificationRules,
  });
}

export async function updateNotificationRules(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as UpdateNotificationRulesInput;

  await getCompanySettings(tenant.companyId);

  const [updated] = await db
    .update(companySettings)
    .set({
      notificationRules: body.notificationRules,
      updatedAt: new Date(),
    })
    .where(eq(companySettings.companyId, tenant.companyId))
    .returning();

  return ok(c, {
    notificationRules: updated.notificationRules,
  });
}

export async function getIntegrations(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const settings = await getCompanySettings(tenant.companyId);

  return ok(c, {
    integrations: settings.integrations,
  });
}

export async function updateIntegrations(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as UpdateIntegrationsInput;

  await getCompanySettings(tenant.companyId);

  const [updated] = await db
    .update(companySettings)
    .set({
      integrations: {
        slackWebhookUrl: body.integrations.slackWebhookUrl ?? null,
        whatsappProvider: body.integrations.whatsappProvider ?? null,
        emailProvider: body.integrations.emailProvider ?? null,
        webhookUrl: body.integrations.webhookUrl ?? null,
      },
      updatedAt: new Date(),
    })
    .where(eq(companySettings.companyId, tenant.companyId))
    .returning();

  return ok(c, {
    integrations: updated.integrations,
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
