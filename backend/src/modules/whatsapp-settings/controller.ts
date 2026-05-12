import { and, eq } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { whatsappCrmSettings } from "@/db/schema";
import { ok } from "@/lib/api";
import type { UpdateSettingsInput } from "@/modules/whatsapp-settings/schema";

async function getOrCreateSettings(companyId: string) {
  const [existing] = await db
    .select()
    .from(whatsappCrmSettings)
    .where(eq(whatsappCrmSettings.companyId, companyId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(whatsappCrmSettings)
    .values({ companyId })
    .onConflictDoNothing({ target: [whatsappCrmSettings.companyId] })
    .returning();

  if (created) return created;

  // Race condition fallback
  const [fallback] = await db
    .select()
    .from(whatsappCrmSettings)
    .where(eq(whatsappCrmSettings.companyId, companyId))
    .limit(1);
  return fallback!;
}

export async function getSettings(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const settings = await getOrCreateSettings(tenant.companyId);
  return ok(c, settings);
}

export async function updateSettings(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as UpdateSettingsInput;

  await getOrCreateSettings(tenant.companyId);

  const updates: Record<string, unknown> = { updatedAt: new Date(), updatedBy: user.id };

  if (body.defaultWorkspaceId !== undefined) updates.defaultWorkspaceId = body.defaultWorkspaceId;
  if (body.autoReplyEnabled !== undefined) updates.autoReplyEnabled = body.autoReplyEnabled;
  if (body.autoReplyBody !== undefined) updates.autoReplyBody = body.autoReplyBody;
  if (body.autoReplyOutsideHours !== undefined) updates.autoReplyOutsideHours = body.autoReplyOutsideHours;
  if (body.businessHours !== undefined) updates.businessHours = body.businessHours;
  if (body.assignmentStrategy !== undefined) updates.assignmentStrategy = body.assignmentStrategy;
  if (body.assignmentUserIds !== undefined) updates.assignmentUserIds = body.assignmentUserIds;
  if (body.maxConcurrentPerAgent !== undefined) updates.maxConcurrentPerAgent = body.maxConcurrentPerAgent;
  if (body.unassignedTimeoutMinutes !== undefined) updates.unassignedTimeoutMinutes = body.unassignedTimeoutMinutes;
  if (body.webhookHealthAlertEnabled !== undefined) updates.webhookHealthAlertEnabled = body.webhookHealthAlertEnabled;
  if (body.webhookHealthAlertThreshold !== undefined) updates.webhookHealthAlertThreshold = body.webhookHealthAlertThreshold;
  if (body.realtimeTransport !== undefined) updates.realtimeTransport = body.realtimeTransport;
  if (body.defaultPriority !== undefined) updates.defaultPriority = body.defaultPriority;
  if (body.autoArchiveAfterHours !== undefined) updates.autoArchiveAfterHours = body.autoArchiveAfterHours;
  if (body.optInRequiredForCampaigns !== undefined) updates.optInRequiredForCampaigns = body.optInRequiredForCampaigns;

  const [updated] = await db
    .update(whatsappCrmSettings)
    .set(updates)
    .where(eq(whatsappCrmSettings.companyId, tenant.companyId))
    .returning();

  return ok(c, updated);
}
