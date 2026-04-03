import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { notificationParamSchema } from "@/modules/notifications/schema";
import type { ListNotificationsQuery } from "@/modules/notifications/schema";

export function getNotificationOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "notifications",
    capabilities: ["lead-alerts", "task-alerts", "deal-alerts", "campaign-alerts"],
  });
}

export async function listNotifications(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListNotificationsQuery;

  const conditions = [eq(notifications.companyId, tenant.companyId)];
  if (query.type) {
    conditions.push(eq(notifications.type, query.type));
  }
  if (query.unreadOnly) {
    conditions.push(isNull(notifications.readAt));
  }

  const where = and(...conditions);
  const [items, totalRows, unreadRows] = await Promise.all([
    db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(notifications).where(where),
    db.select({ count: count() }).from(notifications).where(and(eq(notifications.companyId, tenant.companyId), isNull(notifications.readAt))),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    unreadCount: unreadRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function markNotificationRead(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = notificationParamSchema.parse(c.req.param());

  const [updated] = await db
    .update(notifications)
    .set({
      readAt: new Date(),
      readBy: user.id,
    })
    .where(and(eq(notifications.id, params.notificationId), eq(notifications.companyId, tenant.companyId)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Notification not found");
  }

  return ok(c, updated);
}

export async function markAllNotificationsRead(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");

  const updated = await db
    .update(notifications)
    .set({
      readAt: new Date(),
      readBy: user.id,
    })
    .where(and(eq(notifications.companyId, tenant.companyId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });

  return ok(c, { updatedCount: updated.length });
}
