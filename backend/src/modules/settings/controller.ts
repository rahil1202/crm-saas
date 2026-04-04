import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { companySettings, emailAccounts, socialAccounts } from "@/db/schema";
import { ok } from "@/lib/api";
import { getCompanySettings, mergeIntegrationSettings, normalizeIntegrationSettings } from "@/lib/company-settings";
import { env } from "@/lib/config";
import { ensureEmailAccount } from "@/lib/email-runtime";
import { AppError } from "@/lib/errors";
import { encryptIntegrationSecret } from "@/lib/integration-crypto";
import { getIntegrationHub } from "@/lib/integration-hub";
import type {
  UpdateCompanyPreferencesInput,
  UpdateCustomFieldsInput,
  DisconnectIntegrationOauthInput,
  LinkIntegrationOauthInput,
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
      provider: settings.integrations.email.provider ?? settings.integrations.emailProvider,
      envReady: Boolean(env.RESEND_API_KEY && env.RESEND_WEBHOOK_SECRET),
      apiKeyConfigured: Boolean(env.RESEND_API_KEY),
      webhookSecretConfigured: Boolean(env.RESEND_WEBHOOK_SECRET),
      accountCount: companyEmailAccounts.length,
      connectedAccounts: companyEmailAccounts.filter((account) => account.status === "connected").length,
      defaultAccountCount: companyEmailAccounts.filter((account) => account.isDefault && account.status === "connected").length,
      webhookUrl: `${env.BACKEND_URL}/api/v1/public/email/resend/webhook`,
    },
    whatsapp: {
      provider: settings.integrations.whatsapp.provider ?? settings.integrations.whatsappProvider,
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
    integrations: normalizeIntegrationSettings(settings.integrations),
  });
}

export async function getIntegrationsHub(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  return ok(c, await getIntegrationHub(tenant.companyId));
}

export async function updateIntegrations(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as UpdateIntegrationsInput;

  const currentSettings = await getCompanySettings(tenant.companyId);
  const mergedIntegrations = mergeIntegrationSettings(currentSettings.integrations, body.integrations);

  const [updated] = await db
    .update(companySettings)
    .set({
      integrations: mergedIntegrations,
      updatedAt: new Date(),
    })
    .where(eq(companySettings.companyId, tenant.companyId))
    .returning();

  return ok(c, {
    integrations: normalizeIntegrationSettings(updated.integrations),
  });
}

export async function linkIntegrationOauth(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as LinkIntegrationOauthInput;
  const currentSettings = await getCompanySettings(tenant.companyId);

  if (body.channel === "email") {
    if (body.provider !== "google" && body.provider !== "azure") {
      throw AppError.badRequest("Email OAuth supports Google or Azure providers");
    }

    const fromEmail = body.account.email ?? user.email;
    if (!fromEmail) {
      throw AppError.badRequest("OAuth-linked email accounts require a verified email address");
    }

    const account = await ensureEmailAccount({
      companyId: tenant.companyId,
      userId: user.id,
      createdBy: user.id,
      label: body.provider === "google" ? "Google Workspace OAuth" : "Microsoft 365 OAuth",
      fromEmail,
      fromName: body.account.name ?? null,
      provider: body.provider,
      isDefault: true,
      credentials: {
        authType: "oauth",
        accessToken: encryptIntegrationSecret(body.providerAccessToken),
        refreshToken: body.providerRefreshToken ? encryptIntegrationSecret(body.providerRefreshToken) : null,
        scopes: body.scopes,
        providerUserId: body.account.providerUserId ?? null,
        linkedAt: new Date().toISOString(),
      },
      metadata: {
        connectedVia: "supabase_oauth",
      },
    });

    const mergedIntegrations = mergeIntegrationSettings(currentSettings.integrations, {
      emailProvider: body.provider,
      email: {
        provider: body.provider,
        deliveryMethod: "api",
        oauthScopes: body.scopes,
        fromEmail,
      },
    });

    await db
      .update(companySettings)
      .set({
        integrations: mergedIntegrations,
        updatedAt: new Date(),
      })
      .where(eq(companySettings.companyId, tenant.companyId));

    return ok(c, {
      linked: true,
      channel: body.channel,
      provider: body.provider,
      accountId: account.id,
    });
  }

  if (body.channel === "linkedin") {
    if (body.provider !== "linkedin_oidc") {
      throw AppError.badRequest("LinkedIn integrations require the linkedin_oidc provider");
    }

    const handle = body.account.handle ?? body.account.email ?? body.account.providerUserId ?? `linkedin-${user.id}`;

    const [existing] = await db
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.companyId, tenant.companyId), eq(socialAccounts.platform, "linkedin"), eq(socialAccounts.handle, handle), isNull(socialAccounts.deletedAt)))
      .limit(1);

    const metadata = {
      ...(existing?.metadata ?? {}),
      oauth: {
        provider: body.provider,
        accessToken: encryptIntegrationSecret(body.providerAccessToken),
        refreshToken: body.providerRefreshToken ? encryptIntegrationSecret(body.providerRefreshToken) : null,
        scopes: body.scopes,
        providerUserId: body.account.providerUserId ?? null,
        email: body.account.email ?? null,
        linkedAt: new Date().toISOString(),
      },
    };

    const [account] = existing
      ? await db
          .update(socialAccounts)
          .set({
            accountName: body.account.name ?? existing.accountName,
            status: "connected",
            accessMode: "oauth",
            metadata,
            updatedAt: new Date(),
          })
          .where(eq(socialAccounts.id, existing.id))
          .returning()
      : await db
          .insert(socialAccounts)
          .values({
            companyId: tenant.companyId,
            platform: "linkedin",
            accountName: body.account.name ?? "LinkedIn",
            handle,
            status: "connected",
            accessMode: "oauth",
            metadata,
            createdBy: user.id,
          })
          .returning();

    const mergedIntegrations = mergeIntegrationSettings(currentSettings.integrations, {
      linkedin: {
        provider: "linkedin_oidc",
        scopes: body.scopes,
      },
    });

    await db
      .update(companySettings)
      .set({
        integrations: mergedIntegrations,
        updatedAt: new Date(),
      })
      .where(eq(companySettings.companyId, tenant.companyId));

    return ok(c, {
      linked: true,
      channel: body.channel,
      provider: body.provider,
      accountId: account.id,
    });
  }

  throw AppError.badRequest("Unsupported OAuth integration channel");
}

export async function disconnectIntegrationOauth(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const body = c.get("validatedBody") as DisconnectIntegrationOauthInput;
  const currentSettings = await getCompanySettings(tenant.companyId);

  if (body.channel === "email") {
    await db
      .update(emailAccounts)
      .set({
        status: "disconnected",
        credentials: {},
        metadata: {
          disconnectedAt: new Date().toISOString(),
          disconnectedProvider: body.provider,
        },
        updatedAt: new Date(),
      })
      .where(and(eq(emailAccounts.companyId, tenant.companyId), eq(emailAccounts.provider, body.provider), isNull(emailAccounts.deletedAt)));

    const mergedIntegrations = mergeIntegrationSettings(currentSettings.integrations, {
      email: {
        provider: null,
        oauthScopes: [],
      },
    });

    await db
      .update(companySettings)
      .set({
        integrations: mergedIntegrations,
        updatedAt: new Date(),
      })
      .where(eq(companySettings.companyId, tenant.companyId));

    return ok(c, { disconnected: true, channel: body.channel, provider: body.provider });
  }

  if (body.channel === "linkedin") {
    const rows = await db
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.companyId, tenant.companyId), eq(socialAccounts.platform, "linkedin"), isNull(socialAccounts.deletedAt)));

    for (const row of rows) {
      await db
        .update(socialAccounts)
        .set({
          status: "disconnected",
          metadata: {
            ...(row.metadata ?? {}),
            oauth: {
              provider: body.provider,
              accessToken: null,
              refreshToken: null,
              scopes: [],
              disconnectedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(socialAccounts.id, row.id));
    }

    const mergedIntegrations = mergeIntegrationSettings(currentSettings.integrations, {
      linkedin: {
        provider: null,
        scopes: [],
      },
    });

    await db
      .update(companySettings)
      .set({
        integrations: mergedIntegrations,
        updatedAt: new Date(),
      })
      .where(eq(companySettings.companyId, tenant.companyId));

    return ok(c, { disconnected: true, channel: body.channel, provider: body.provider });
  }

  throw AppError.badRequest("Unsupported OAuth integration channel");
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
