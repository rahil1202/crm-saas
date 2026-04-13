"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { ApiError, apiRequest } from "@/lib/api";

type NotificationType = "lead" | "deal" | "task" | "campaign";

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  entityId: string | null;
  entityPath: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
}

const typeTone: Record<NotificationType, "outline" | "secondary" | "default" | "destructive"> = {
  lead: "secondary",
  deal: "default",
  task: "destructive",
  campaign: "outline",
};

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (typeFilter) {
      params.set("type", typeFilter);
    }
    if (unreadOnly) {
      params.set("unreadOnly", "true");
    }

    try {
      const data = await apiRequest<NotificationListResponse>(`/notifications/list?${params.toString()}`);
      setItems(data.items);
      setUnreadCount(data.unreadCount);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load notifications");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, unreadOnly]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const markRead = async (notificationId: string) => {
    setWorkingId(notificationId);
    setError(null);

    try {
      await apiRequest(`/notifications/${notificationId}/read`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadNotifications();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to mark notification as read");
    } finally {
      setWorkingId(null);
    }
  };

  const markAllRead = async () => {
    setWorkingId("__all__");
    setError(null);

    try {
      await apiRequest("/notifications/mark-all-read", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadNotifications();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to mark all notifications as read");
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <>
      <div className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Notification request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <CardDescription>Total alerts</CardDescription>
              <CardTitle className="text-2xl">{items.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Unread alerts</CardDescription>
              <CardTitle className="text-2xl">{unreadCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Actions</CardDescription>
              <div className="pt-1">
                <Button type="button" variant="outline" disabled={workingId === "__all__" || unreadCount === 0} onClick={() => void markAllRead()}>
                  {workingId === "__all__" ? "Working..." : "Mark all read"}
                </Button>
              </div>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Inbox</CardTitle>
            <CardDescription>Filter notification types and mark individual alerts as read.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Field>
                <FieldLabel htmlFor="notification-type-filter">Type filter</FieldLabel>
                <select
                  id="notification-type-filter"
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  <option value="">All types</option>
                  <option value="lead">lead</option>
                  <option value="deal">deal</option>
                  <option value="task">task</option>
                  <option value="campaign">campaign</option>
                </select>
              </Field>
              <label className="flex items-end gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
                Unread only
              </label>
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={() => void loadNotifications()}>
                  Apply filter
                </Button>
              </div>
            </div>

            {loading ? <div className="text-sm text-muted-foreground">Loading notifications...</div> : null}

            {!loading ? (
              <div className="grid gap-3">
                {items.map((item) => (
                  <Card key={item.id} size="sm">
                    <CardHeader>
                      <CardTitle className="flex flex-wrap items-center gap-2">
                        <span>{item.title}</span>
                        <Badge variant={typeTone[item.type]}>{item.type}</Badge>
                        <Badge variant={item.readAt ? "outline" : "secondary"}>{item.readAt ? "read" : "unread"}</Badge>
                      </CardTitle>
                      <CardDescription>{new Date(item.createdAt).toLocaleString()}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      <div className="text-sm text-muted-foreground">{item.message}</div>
                      <div className="flex flex-wrap items-center gap-3">
                        {item.entityPath ? (
                          <a href={item.entityPath} className="text-sm font-medium underline underline-offset-4">
                            Open source module
                          </a>
                        ) : null}
                        {!item.readAt ? (
                          <Button type="button" variant="outline" disabled={workingId === item.id} onClick={() => void markRead(item.id)}>
                            {workingId === item.id ? "Working..." : "Mark read"}
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {items.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    No notifications found for the active filter.
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

