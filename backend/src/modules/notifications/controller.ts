import { and, asc, count, desc, eq, gt, ilike, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { notifications, notificationStates } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { notificationParamSchema } from "@/modules/notifications/schema";
import type { ListNotificationsQuery, PreviewNotificationsQuery, UpdateNotificationStateInput } from "@/modules/notifications/schema";
import {
  publishNotificationUserChanged,
  subscribeNotificationRealtime,
} from "@/modules/notifications/realtime";

type CursorPayload = {
  createdAt: string;
  id: string;
};

function encodeCursor(payload: CursorPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeCursor(raw: string): CursorPayload {
  try {
    const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as CursorPayload;
    if (!decoded?.createdAt || !decoded?.id) {
      throw new Error("Malformed cursor");
    }
    return decoded;
  } catch {
    throw AppError.badRequest("Invalid cursor");
  }
}

function getCursorWhereClause(cursor: CursorPayload, sortDir: "asc" | "desc") {
  const cursorCreatedAt = new Date(cursor.createdAt);
  if (Number.isNaN(cursorCreatedAt.getTime())) {
    throw AppError.badRequest("Invalid cursor timestamp");
  }

  if (sortDir === "asc") {
    return or(
      gt(notifications.createdAt, cursorCreatedAt),
      and(eq(notifications.createdAt, cursorCreatedAt), gt(notifications.id, cursor.id)),
    );
  }

  return or(
    lt(notifications.createdAt, cursorCreatedAt),
    and(eq(notifications.createdAt, cursorCreatedAt), lt(notifications.id, cursor.id)),
  );
}

function getReadStatusCondition(status: "all" | "read" | "unread") {
  if (status === "read") {
    return and(
      isNotNull(notificationStates.profileId),
      isNull(notificationStates.deletedAt),
      isNotNull(notificationStates.readAt),
    );
  }

  if (status === "unread") {
    return or(
      isNull(notificationStates.profileId),
      and(isNull(notificationStates.deletedAt), isNull(notificationStates.readAt)),
    );
  }

  return undefined;
}

function mapNotificationRow(row: {
  notification: typeof notifications.$inferSelect;
  state: typeof notificationStates.$inferSelect | null;
}) {
  const readAt = row.state?.readAt ?? null;
  const deletedAt = row.state?.deletedAt ?? null;

  return {
    id: row.notification.id,
    type: row.notification.type,
    title: row.notification.title,
    message: row.notification.message,
    entityId: row.notification.entityId,
    entityPath: row.notification.entityPath,
    payload: row.notification.payload,
    createdAt: row.notification.createdAt,
    readAt,
    deletedAt,
    isRead: readAt !== null,
  };
}

async function ensureNotificationVisibleToUser(input: {
  companyId: string;
  userId: string;
  notificationId: string;
}) {
  const [existing] = await db
    .select({
      id: notifications.id,
      stateDeletedAt: notificationStates.deletedAt,
    })
    .from(notifications)
    .leftJoin(
      notificationStates,
      and(
        eq(notificationStates.notificationId, notifications.id),
        eq(notificationStates.profileId, input.userId),
      ),
    )
    .where(and(eq(notifications.id, input.notificationId), eq(notifications.companyId, input.companyId)))
    .limit(1);

  if (!existing || existing.stateDeletedAt) {
    throw AppError.notFound("Notification not found");
  }
}

async function setNotificationReadState(input: {
  companyId: string;
  userId: string;
  notificationId: string;
  read: boolean;
}) {
  const now = new Date();
  await db
    .insert(notificationStates)
    .values({
      companyId: input.companyId,
      notificationId: input.notificationId,
      profileId: input.userId,
      readAt: input.read ? now : null,
      deletedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [notificationStates.notificationId, notificationStates.profileId],
      set: {
        readAt: input.read ? now : null,
        deletedAt: null,
        updatedAt: now,
      },
    });
}

async function getUnreadCount(companyId: string, userId: string) {
  const [unreadRows] = await db
    .select({ count: count() })
    .from(notifications)
    .leftJoin(
      notificationStates,
      and(
        eq(notificationStates.notificationId, notifications.id),
        eq(notificationStates.profileId, userId),
      ),
    )
    .where(
      and(
        eq(notifications.companyId, companyId),
        or(isNull(notificationStates.profileId), isNull(notificationStates.deletedAt)),
        or(isNull(notificationStates.profileId), isNull(notificationStates.readAt)),
      ),
    );

  return unreadRows?.count ?? 0;
}

export function getNotificationOverview(c: Context<AppEnv>) {
  return ok(c, {
    module: "notifications",
    capabilities: ["lead-alerts", "task-alerts", "deal-alerts", "campaign-alerts"],
  });
}

export async function streamNotificationEvents(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const writeEvent = (event: string, payload: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      };

      writeEvent("connected", {
        companyId: tenant.companyId,
        userId: user.id,
        at: new Date().toISOString(),
      });

      const unsubscribe = subscribeNotificationRealtime({
        companyId: tenant.companyId,
        userId: user.id,
        listener: (event) => {
          writeEvent("notification", event);
        },
      });

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
      }, 20_000);

      c.req.raw.signal.addEventListener(
        "abort",
        () => {
          clearInterval(keepAlive);
          unsubscribe();
          controller.close();
        },
        { once: true },
      );
    },
    cancel() {
      // handled via request abort listener
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function listNotifications(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const query = c.get("validatedQuery") as ListNotificationsQuery;
  const cursorPayload = query.cursor ? decodeCursor(query.cursor) : null;

  const feedConditions = [
    eq(notifications.companyId, tenant.companyId),
    or(isNull(notificationStates.profileId), isNull(notificationStates.deletedAt)),
  ];

  if (query.q?.trim()) {
    const term = `%${query.q.trim()}%`;
    feedConditions.push(or(ilike(notifications.title, term), ilike(notifications.message, term)));
  }

  if (query.type) {
    feedConditions.push(eq(notifications.type, query.type));
  }

  const statusCondition = getReadStatusCondition(query.status);
  if (statusCondition) {
    feedConditions.push(statusCondition);
  }

  if (query.createdFrom) {
    feedConditions.push(gt(notifications.createdAt, new Date(query.createdFrom)));
  }

  if (query.createdTo) {
    feedConditions.push(lt(notifications.createdAt, new Date(query.createdTo)));
  }

  const listConditions = [...feedConditions];
  if (cursorPayload) {
    listConditions.push(getCursorWhereClause(cursorPayload, query.sortDir));
  }

  const orderByClauses =
    query.sortDir === "asc"
      ? [asc(notifications.createdAt), asc(notifications.id)]
      : [desc(notifications.createdAt), desc(notifications.id)];

  const [rows, totalRows, unreadCount] = await Promise.all([
    db
      .select({ notification: notifications, state: notificationStates })
      .from(notifications)
      .leftJoin(
        notificationStates,
        and(
          eq(notificationStates.notificationId, notifications.id),
          eq(notificationStates.profileId, user.id),
        ),
      )
      .where(and(...listConditions))
      .orderBy(...orderByClauses)
      .limit(query.limit + 1),
    db
      .select({ count: count() })
      .from(notifications)
      .leftJoin(
        notificationStates,
        and(
          eq(notificationStates.notificationId, notifications.id),
          eq(notificationStates.profileId, user.id),
        ),
      )
      .where(and(...feedConditions)),
    getUnreadCount(tenant.companyId, user.id),
  ]);

  const hasMore = rows.length > query.limit;
  const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
  const items = pageRows.map(mapNotificationRow);
  const lastRow = pageRows.at(-1);
  const nextCursor =
    hasMore && lastRow
      ? encodeCursor({ createdAt: lastRow.notification.createdAt.toISOString(), id: lastRow.notification.id })
      : null;

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    unreadCount,
    limit: query.limit,
    hasMore,
    nextCursor,
  });
}

export async function previewNotifications(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const query = c.get("validatedQuery") as PreviewNotificationsQuery;

  const rows = await db
    .select({ notification: notifications, state: notificationStates })
    .from(notifications)
    .leftJoin(
      notificationStates,
      and(
        eq(notificationStates.notificationId, notifications.id),
        eq(notificationStates.profileId, user.id),
      ),
    )
    .where(
      and(
        eq(notifications.companyId, tenant.companyId),
        or(isNull(notificationStates.profileId), isNull(notificationStates.deletedAt)),
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(query.limit);

  const unreadCount = await getUnreadCount(tenant.companyId, user.id);

  return ok(c, {
    items: rows.map(mapNotificationRow),
    unreadCount,
    limit: query.limit,
  });
}

export async function updateNotificationState(c: Context<AppEnv>) {
  const params = notificationParamSchema.parse(c.req.param());
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as UpdateNotificationStateInput;

  await ensureNotificationVisibleToUser({
    companyId: tenant.companyId,
    userId: user.id,
    notificationId: params.notificationId,
  });

  await setNotificationReadState({
    companyId: tenant.companyId,
    userId: user.id,
    notificationId: params.notificationId,
    read: body.read,
  });

  const unreadCount = await getUnreadCount(tenant.companyId, user.id);

  publishNotificationUserChanged({
    companyId: tenant.companyId,
    userId: user.id,
    reason: "updated",
  });

  return ok(c, {
    id: params.notificationId,
    read: body.read,
    unreadCount,
  });
}

export async function markNotificationRead(c: Context<AppEnv>) {
  const params = notificationParamSchema.parse(c.req.param());
  const tenant = c.get("tenant");
  const user = c.get("user");

  await ensureNotificationVisibleToUser({
    companyId: tenant.companyId,
    userId: user.id,
    notificationId: params.notificationId,
  });

  await setNotificationReadState({
    companyId: tenant.companyId,
    userId: user.id,
    notificationId: params.notificationId,
    read: true,
  });

  const unreadCount = await getUnreadCount(tenant.companyId, user.id);
  publishNotificationUserChanged({
    companyId: tenant.companyId,
    userId: user.id,
    reason: "legacy_read",
  });
  return ok(c, {
    id: params.notificationId,
    read: true,
    unreadCount,
  });
}

export async function deleteNotification(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = notificationParamSchema.parse(c.req.param());
  const now = new Date();

  await ensureNotificationVisibleToUser({
    companyId: tenant.companyId,
    userId: user.id,
    notificationId: params.notificationId,
  });

  await db
    .insert(notificationStates)
    .values({
      companyId: tenant.companyId,
      notificationId: params.notificationId,
      profileId: user.id,
      readAt: null,
      deletedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [notificationStates.notificationId, notificationStates.profileId],
      set: {
        deletedAt: now,
        updatedAt: now,
      },
    });

  const unreadCount = await getUnreadCount(tenant.companyId, user.id);

  publishNotificationUserChanged({
    companyId: tenant.companyId,
    userId: user.id,
    reason: "deleted",
  });

  return ok(c, {
    id: params.notificationId,
    deleted: true,
    unreadCount,
  });
}

async function markAllNotificationsReadInternal(companyId: string, userId: string) {
  const now = new Date();
  const [pendingRows] = await db
    .select({ count: count() })
    .from(notifications)
    .leftJoin(
      notificationStates,
      and(
        eq(notificationStates.notificationId, notifications.id),
        eq(notificationStates.profileId, userId),
      ),
    )
    .where(
      and(
        eq(notifications.companyId, companyId),
        or(isNull(notificationStates.profileId), isNull(notificationStates.deletedAt)),
        or(isNull(notificationStates.profileId), isNull(notificationStates.readAt)),
      ),
    );

  await db
    .update(notificationStates)
    .set({
      readAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(notificationStates.companyId, companyId),
        eq(notificationStates.profileId, userId),
        isNull(notificationStates.deletedAt),
        isNull(notificationStates.readAt),
      ),
    );

  const missingRows = await db
    .select({ notificationId: notifications.id })
    .from(notifications)
    .leftJoin(
      notificationStates,
      and(
        eq(notificationStates.notificationId, notifications.id),
        eq(notificationStates.profileId, userId),
      ),
    )
    .where(and(eq(notifications.companyId, companyId), isNull(notificationStates.id)));

  if (missingRows.length > 0) {
    await db
      .insert(notificationStates)
      .values(
        missingRows.map((row) => ({
          companyId,
          profileId: userId,
          notificationId: row.notificationId,
          readAt: now,
          deletedAt: null,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [notificationStates.notificationId, notificationStates.profileId],
        set: {
          readAt: now,
          deletedAt: null,
          updatedAt: now,
        },
      });
  }

  return pendingRows?.count ?? 0;
}

export async function markAllNotificationsRead(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const updatedCount = await markAllNotificationsReadInternal(tenant.companyId, user.id);

  publishNotificationUserChanged({
    companyId: tenant.companyId,
    userId: user.id,
    reason: "read_all",
  });

  return ok(c, {
    updatedCount,
    unreadCount: 0,
  });
}

export async function markAllNotificationsReadLegacy(c: Context<AppEnv>) {
  return markAllNotificationsRead(c);
}
