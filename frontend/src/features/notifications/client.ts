import { apiRequest } from "@/lib/api";
import { getCompanyCookie } from "@/lib/cookies";
import { getFrontendEnv } from "@/lib/env";

export type NotificationType = "lead" | "deal" | "task" | "campaign";
export type NotificationFilterStatus = "all" | "read" | "unread";
export type NotificationSortDirection = "asc" | "desc";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  entityId: string | null;
  entityPath: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  deletedAt: string | null;
  isRead: boolean;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface NotificationPreviewResponse {
  items: NotificationItem[];
  unreadCount: number;
  limit: number;
}

export interface NotificationMutationResponse {
  id: string;
  read?: boolean;
  deleted?: boolean;
  unreadCount: number;
}

const NOTIFICATIONS_CHANGED_EVENT = "crm:notifications-changed";

export function emitNotificationsChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

export function addNotificationsChangedListener(handler: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);
}

export function normalizeNotificationHref(item: Pick<NotificationItem, "type" | "entityId" | "entityPath" | "payload">) {
  if (item.entityPath?.trim()) {
    return item.entityPath;
  }

  if (item.type === "lead") {
    const socialConversationId = typeof item.payload?.conversationId === "string" ? item.payload.conversationId : null;
    if (socialConversationId) {
      return "/dashboard/social";
    }

    return item.entityId ? `/dashboard/leads/${item.entityId}` : "/dashboard/leads";
  }

  if (item.type === "deal") {
    return item.entityId ? `/dashboard/deals/${item.entityId}` : "/dashboard/deals";
  }

  if (item.type === "task") {
    return item.entityId ? `/dashboard/tasks/${item.entityId}` : "/dashboard/tasks";
  }

  if (item.type === "campaign") {
    return item.entityId ? `/dashboard/campaigns?campaignId=${encodeURIComponent(item.entityId)}` : "/dashboard/campaigns";
  }

  return "/dashboard/notifications";
}

export async function fetchNotificationList(input: {
  q?: string;
  type?: NotificationType | "";
  status?: NotificationFilterStatus;
  limit: number;
  cursor?: string | null;
  sortDir?: NotificationSortDirection;
  createdFrom?: string;
  createdTo?: string;
  skipCache?: boolean;
}) {
  const params = new URLSearchParams();
  if (input.q?.trim()) params.set("q", input.q.trim());
  if (input.type) params.set("type", input.type);
  if (input.status && input.status !== "all") params.set("status", input.status);
  if (input.createdFrom) params.set("createdFrom", input.createdFrom);
  if (input.createdTo) params.set("createdTo", input.createdTo);
  if (input.cursor) params.set("cursor", input.cursor);
  params.set("limit", String(input.limit));
  params.set("sortDir", input.sortDir ?? "desc");

  return apiRequest<NotificationListResponse>(`/notifications?${params.toString()}`, {
    skipCache: input.skipCache ?? true,
  });
}

export async function fetchNotificationPreview(limit = 3, skipCache = true) {
  return apiRequest<NotificationPreviewResponse>(`/notifications/preview?limit=${limit}`, {
    skipCache,
  });
}

export async function patchNotificationRead(notificationId: string, read: boolean) {
  return apiRequest<NotificationMutationResponse>(`/notifications/${notificationId}`, {
    method: "PATCH",
    body: JSON.stringify({ read }),
    skipCache: true,
  });
}

export async function removeNotification(notificationId: string) {
  return apiRequest<NotificationMutationResponse>(`/notifications/${notificationId}`, {
    method: "DELETE",
    skipCache: true,
  });
}

export async function markAllNotificationsRead() {
  return apiRequest<{ updatedCount: number; unreadCount: number }>("/notifications/read-all", {
    method: "PATCH",
    body: JSON.stringify({}),
    skipCache: true,
  });
}

export function connectNotificationEventStream(onChanged: () => void) {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => undefined;
  }

  const companyId = getCompanyCookie();
  const env = getFrontendEnv();
  const params = new URLSearchParams();
  if (companyId) {
    params.set("companyId", companyId);
  }

  const source = new EventSource(`${env.apiUrl}/api/v1/notifications/stream?${params.toString()}`, {
    withCredentials: true,
  });

  const handleEvent = () => onChanged();
  source.addEventListener("notification", handleEvent);

  return () => {
    source.removeEventListener("notification", handleEvent);
    source.close();
  };
}
