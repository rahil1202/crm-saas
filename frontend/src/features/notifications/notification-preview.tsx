"use client";

import { Bell } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { CrmModalShell } from "@/components/crm/crm-list-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  addNotificationsChangedListener,
  connectNotificationEventStream,
  emitNotificationsChanged,
  fetchNotificationPreview,
  normalizeNotificationHref,
  patchNotificationRead,
  removeNotification,
  type NotificationItem,
} from "@/features/notifications/client";
import { ApiError } from "@/lib/api";

export function NotificationPreview({
  enabled,
  refreshKey,
}: {
  enabled: boolean;
  refreshKey: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);

  const loadPreview = useCallback(
    async (skipCache = true) => {
      if (!enabled) {
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetchNotificationPreview(3, skipCache);
        setItems(response.items);
        setUnreadCount(response.unreadCount);
        setLoadedAt(Date.now());
      } catch (requestError) {
        setError(requestError instanceof ApiError ? requestError.message : "Unable to load notifications");
      } finally {
        setLoading(false);
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) {
      setOpen(false);
      setItems([]);
      setUnreadCount(0);
      setError(null);
      setLoading(false);
      return;
    }

    void loadPreview(false);
  }, [enabled, loadPreview, refreshKey]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return addNotificationsChangedListener(() => {
      void loadPreview(true);
    });
  }, [enabled, loadPreview]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return connectNotificationEventStream(() => {
      void loadPreview(true);
    });
  }, [enabled, loadPreview]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleNotificationReadToggle = async (item: NotificationItem, nextRead: boolean) => {
    const previousItems = items;
    const previousUnreadCount = unreadCount;
    setWorkingId(item.id);

    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              readAt: nextRead ? new Date().toISOString() : null,
              isRead: nextRead,
            }
          : entry,
      ),
    );

    if (item.readAt && !nextRead) {
      setUnreadCount((current) => current + 1);
    } else if (!item.readAt && nextRead) {
      setUnreadCount((current) => Math.max(0, current - 1));
    }

    try {
      const result = await patchNotificationRead(item.id, nextRead);
      setUnreadCount(result.unreadCount);
      emitNotificationsChanged();
    } catch (requestError) {
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update notification");
    } finally {
      setWorkingId(null);
    }
  };

  const handleNotificationDelete = async (item: NotificationItem) => {
    const previousItems = items;
    const previousUnreadCount = unreadCount;
    setWorkingId(item.id);
    setItems((current) => current.filter((entry) => entry.id !== item.id));

    if (!item.readAt) {
      setUnreadCount((current) => Math.max(0, current - 1));
    }

    try {
      const result = await removeNotification(item.id);
      setUnreadCount(result.unreadCount);
      emitNotificationsChanged();
    } catch (requestError) {
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
      setError(requestError instanceof ApiError ? requestError.message : "Unable to delete notification");
    } finally {
      setWorkingId(null);
    }
  };

  const openNotificationTarget = (item: NotificationItem) => {
    setOpen(false);
    router.push(normalizeNotificationHref(item));
  };

  if (!enabled) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200/70 bg-white text-sky-900 transition-colors hover:bg-sky-50"
        aria-label="Open notifications"
        onClick={() => {
          setOpen(true);
          const stale = Date.now() - loadedAt > 45_000;
          if (stale) {
            void loadPreview(true);
          }
        }}
      >
        <Bell className="size-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[0.65rem] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      <CrmModalShell
        open={open}
        title="Recent notifications"
        description="Latest updates across your CRM workspace."
        onClose={() => setOpen(false)}
        maxWidthClassName="max-w-2xl"
        headerActions={
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              setOpen(false);
              router.push("/dashboard/notifications");
            }}
          >
            Open inbox
          </Button>
        }
      >
        <div className="grid gap-3">
          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

          {loading ? <div className="rounded-xl border border-border/60 bg-slate-50 px-3 py-4 text-sm text-muted-foreground">Loading notifications...</div> : null}

          {!loading && items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-sm text-muted-foreground">No notifications yet.</div>
          ) : null}

          {!loading
            ? items.map((item) => (
                <div key={item.id} className="grid gap-2 rounded-xl border border-border/70 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" className="min-w-0 text-left" onClick={() => openNotificationTarget(item)}>
                      <div className="truncate text-sm font-semibold text-slate-900 hover:text-sky-700">{item.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div>
                    </button>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="capitalize">
                        {item.type}
                      </Badge>
                      <Badge variant={item.readAt ? "outline" : "secondary"}>{item.readAt ? "read" : "unread"}</Badge>
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground">{item.message}</div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" size="xs" variant="ghost" onClick={() => openNotificationTarget(item)}>
                      Open
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={workingId === item.id}
                      onClick={() => void handleNotificationReadToggle(item, !item.readAt)}
                    >
                      {item.readAt ? "Mark unread" : "Mark read"}
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="text-rose-600 hover:text-rose-700"
                      disabled={workingId === item.id}
                      onClick={() => void handleNotificationDelete(item)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            : null}
        </div>
      </CrmModalShell>
    </>
  );
}
