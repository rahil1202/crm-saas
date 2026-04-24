import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { publishNotificationCompanyChanged } from "@/modules/notifications/realtime";

type NotificationType = "lead" | "deal" | "task" | "campaign";

function resolveEntityPath(input: {
  type: NotificationType;
  entityId?: string | null;
  entityPath?: string | null;
  payload?: Record<string, unknown>;
}) {
  const explicitPath = input.entityPath?.trim();
  if (explicitPath) {
    return explicitPath;
  }

  if (input.type === "lead") {
    if (input.entityId) {
      return `/dashboard/leads/${input.entityId}`;
    }

    const conversationId = typeof input.payload?.conversationId === "string" ? input.payload.conversationId : null;
    if (conversationId) {
      return "/dashboard/social";
    }

    return "/dashboard/leads";
  }

  if (input.type === "deal") {
    return input.entityId ? `/dashboard/deals/${input.entityId}` : "/dashboard/deals";
  }

  if (input.type === "task") {
    return input.entityId ? `/dashboard/tasks/${input.entityId}` : "/dashboard/tasks";
  }

  if (input.type === "campaign") {
    if (input.entityId) {
      return `/dashboard/campaigns?campaignId=${encodeURIComponent(input.entityId)}`;
    }

    return "/dashboard/campaigns";
  }

  return null;
}

export async function createNotification(input: {
  companyId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityId?: string | null;
  entityPath?: string | null;
  payload?: Record<string, unknown>;
}) {
  await db.insert(notifications).values({
    companyId: input.companyId,
    type: input.type,
    title: input.title,
    message: input.message,
    entityId: input.entityId ?? null,
    entityPath: resolveEntityPath(input),
    payload: input.payload ?? {},
  });

  publishNotificationCompanyChanged({
    companyId: input.companyId,
    reason: "created",
  });
}
