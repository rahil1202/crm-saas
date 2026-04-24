"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CrmAppliedFiltersBar,
  CrmColumnSettings,
  CrmDataTable,
  CrmFilterDrawer,
  CrmListPageHeader,
  CrmListToolbar,
  CrmPaginationBar,
} from "@/components/crm/crm-list-primitives";
import type { ColumnDefinition } from "@/components/crm/types";
import { useCrmListState } from "@/components/crm/use-crm-list-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError } from "@/lib/api";
import {
  addNotificationsChangedListener,
  emitNotificationsChanged,
  fetchNotificationList,
  markAllNotificationsRead,
  normalizeNotificationHref,
  patchNotificationRead,
  removeNotification,
  type NotificationFilterStatus,
  type NotificationItem,
  type NotificationType,
} from "@/features/notifications/client";

type NotificationFilters = {
  q: string;
  type: "" | NotificationType;
  status: NotificationFilterStatus;
  createdFrom: string;
  createdTo: string;
};

type NotificationFilterKey = keyof NotificationFilters;
type NotificationSortKey = "createdAt";
type NotificationColumnKey = "type" | "title" | "message" | "status" | "createdAt" | "target";

type NotificationColumnVisibility = Record<NotificationColumnKey, boolean>;

const rowsPerPageOptions = [10, 20, 50, 100] as const;
const columnStorageKey = "crm-saas-notification-columns";
const defaultFilters: NotificationFilters = {
  q: "",
  type: "",
  status: "all",
  createdFrom: "",
  createdTo: "",
};

const defaultColumnVisibility: NotificationColumnVisibility = {
  type: true,
  title: true,
  message: true,
  status: true,
  createdAt: true,
  target: true,
};

const lockedColumns: NotificationColumnKey[] = ["title"];

function readFiltersFromSearchParams(params: Pick<URLSearchParams, "get">): NotificationFilters {
  const statusParam = params.get("status");
  const typeParam = params.get("type");

  return {
    q: params.get("q") ?? "",
    type: typeParam === "lead" || typeParam === "deal" || typeParam === "task" || typeParam === "campaign" ? typeParam : "",
    status: statusParam === "read" || statusParam === "unread" ? statusParam : "all",
    createdFrom: params.get("createdFrom") ?? "",
    createdTo: params.get("createdTo") ?? "",
  };
}

function writeFiltersToSearchParams(params: URLSearchParams, filters: NotificationFilters) {
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.type) params.set("type", filters.type);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.createdFrom) params.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) params.set("createdTo", filters.createdTo);
}

function normalizeSortKey(): NotificationSortKey {
  return "createdAt";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function toIsoDayStart(value: string) {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function toIsoDayEnd(value: string) {
  if (!value) return undefined;
  return new Date(`${value}T23:59:59.999Z`).toISOString();
}

function getFilterChips(filters: NotificationFilters) {
  const chips: Array<{ key: NotificationFilterKey; label: string; value: string }> = [];
  if (filters.q.trim()) chips.push({ key: "q", label: "Search", value: filters.q.trim() });
  if (filters.type) chips.push({ key: "type", label: "Type", value: filters.type });
  if (filters.status !== "all") chips.push({ key: "status", label: "Status", value: filters.status });
  if (filters.createdFrom) chips.push({ key: "createdFrom", label: "From", value: filters.createdFrom });
  if (filters.createdTo) chips.push({ key: "createdTo", label: "To", value: filters.createdTo });
  return chips;
}

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({ 1: null });

  const {
    filters,
    setFilters,
    filterDraft,
    setFilterDraft,
    page,
    setPage,
    limit,
    setLimit,
    sortBy,
    sortDir,
    columnVisibility,
    applyFilterDraft,
    clearFilterDraft,
    clearAllFilters,
    removeAppliedFilter,
    toggleColumn,
    resetColumns,
    requestSort,
  } = useCrmListState<NotificationFilters, NotificationSortKey, NotificationColumnKey>({
    defaultFilters,
    defaultSortBy: "createdAt",
    defaultSortDir: "desc",
    defaultLimit: rowsPerPageOptions[0],
    rowsPerPageOptions,
    parseFilters: readFiltersFromSearchParams,
    writeFilters: writeFiltersToSearchParams,
    normalizeSortBy: normalizeSortKey,
    columnStorageKey,
    defaultColumnVisibility,
    lockedColumns,
  });

  const filterChips = useMemo(() => getFilterChips(filters), [filters]);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    setPageCursors({ 1: null });
    setPage((current) => (current === 1 ? current : 1));
  }, [filters.createdFrom, filters.createdTo, filters.q, filters.status, filters.type, limit, setPage, sortDir]);

  const loadNotifications = useCallback(
    async (skipCache = true) => {
      const cursor = pageCursors[page];
      if (page > 1 && cursor === undefined) {
        setPage(1);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetchNotificationList({
          q: filters.q,
          type: filters.type,
          status: filters.status,
          createdFrom: toIsoDayStart(filters.createdFrom),
          createdTo: toIsoDayEnd(filters.createdTo),
          limit,
          sortDir,
          cursor,
          skipCache,
        });

        setItems(response.items);
        setTotal(response.total);
        setUnreadCount(response.unreadCount);
        setHasMore(response.hasMore);
        setPageCursors((current) => {
          const next = { ...current, 1: null, [page]: cursor ?? null };
          if (response.nextCursor) {
            next[page + 1] = response.nextCursor;
          } else {
            delete next[page + 1];
          }
          return next;
        });
      } catch (requestError) {
        setError(requestError instanceof ApiError ? requestError.message : "Unable to load notifications");
      } finally {
        setLoading(false);
      }
    },
    [filters.createdFrom, filters.createdTo, filters.q, filters.status, filters.type, limit, page, pageCursors, setPage, sortDir],
  );

  useEffect(() => {
    void loadNotifications(true);
  }, [loadNotifications]);

  useEffect(() => {
    return addNotificationsChangedListener(() => {
      void loadNotifications(true);
    });
  }, [loadNotifications]);

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) {
      return;
    }

    const previousItems = items;
    const previousUnreadCount = unreadCount;
    setWorkingId("__all__");
    setItems((current) =>
      current.map((item) =>
        item.readAt
          ? item
          : {
              ...item,
              readAt: new Date().toISOString(),
              isRead: true,
            },
      ),
    );
    setUnreadCount(0);

    try {
      await markAllNotificationsRead();
      emitNotificationsChanged();
    } catch (requestError) {
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
      setError(requestError instanceof ApiError ? requestError.message : "Unable to mark all notifications as read");
    } finally {
      setWorkingId(null);
    }
  };

  const handleToggleRead = async (item: NotificationItem, nextRead: boolean) => {
    const previousItems = items;
    const previousUnreadCount = unreadCount;
    const nextReadAt = nextRead ? new Date().toISOString() : null;

    setWorkingId(item.id);
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              readAt: nextReadAt,
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
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update notification state");
    } finally {
      setWorkingId(null);
    }
  };

  const handleDelete = async (item: NotificationItem) => {
    const previousItems = items;
    const previousUnreadCount = unreadCount;
    const previousTotal = total;

    setWorkingId(item.id);
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setTotal((current) => Math.max(0, current - 1));
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
      setTotal(previousTotal);
      setError(requestError instanceof ApiError ? requestError.message : "Unable to delete notification");
    } finally {
      setWorkingId(null);
    }
  };

  const notificationColumns: Array<ColumnDefinition<NotificationItem, NotificationColumnKey, NotificationSortKey>> = [
    {
      key: "type",
      label: "Type",
      widthClassName: "min-w-[120px]",
      renderCell: (item) => (
        <Badge variant="outline" className="capitalize">
          {item.type}
        </Badge>
      ),
    },
    {
      key: "title",
      label: "Title",
      widthClassName: "min-w-[220px]",
      renderCell: (item) => (
        <button
          type="button"
          className="text-left font-medium text-slate-900 hover:text-sky-700 hover:underline"
          onClick={() => router.push(normalizeNotificationHref(item))}
        >
          {item.title}
        </button>
      ),
    },
    {
      key: "message",
      label: "Message",
      widthClassName: "min-w-[300px]",
      renderCell: (item) => <span className="text-slate-600">{item.message}</span>,
    },
    {
      key: "status",
      label: "Status",
      widthClassName: "min-w-[130px]",
      renderCell: (item) => <Badge variant={item.readAt ? "outline" : "secondary"}>{item.readAt ? "read" : "unread"}</Badge>,
    },
    {
      key: "createdAt",
      label: "Created",
      sortable: true,
      sortKey: "createdAt",
      widthClassName: "min-w-[180px]",
      renderCell: (item) => <span className="text-slate-600">{formatDateTime(item.createdAt)}</span>,
    },
    {
      key: "target",
      label: "Target",
      widthClassName: "min-w-[160px]",
      renderCell: (item) => (
        <button
          type="button"
          className="text-sm font-medium text-sky-700 hover:underline"
          onClick={() => router.push(normalizeNotificationHref(item))}
        >
          Open target
        </button>
      ),
    },
  ];

  return (
    <div className="grid gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Notification request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <CrmListPageHeader
        title="Notifications"
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={workingId === "__all__" || unreadCount === 0}
            onClick={() => void handleMarkAllRead()}
          >
            {workingId === "__all__" ? "Working..." : "Mark all read"}
          </Button>
        }
      />

      <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-white shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
        <CrmListToolbar
          searchValue={filters.q}
          searchPlaceholder="Search title or message"
          onSearchChange={(value) => {
            setPage(1);
            setFilters((current) => ({ ...current, q: value }));
            setFilterDraft((current) => ({ ...current, q: value }));
          }}
          onOpenFilters={() => setFilterOpen(true)}
          filterCount={filterChips.length}
          onOpenColumns={() => setColumnSettingsOpen(true)}
          onRefresh={() => {
            void loadNotifications(true);
          }}
          extraContent={<Badge variant="secondary">Unread: {unreadCount}</Badge>}
        />

        <CrmAppliedFiltersBar chips={filterChips} onRemove={removeAppliedFilter} onClear={clearAllFilters} />

        <CrmDataTable
          columns={notificationColumns}
          rows={items}
          rowKey={(item) => item.id}
          loading={loading}
          emptyLabel="No notifications found."
          columnVisibility={columnVisibility}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={(key) => requestSort(key, "desc")}
          actionColumn={{
            header: "Actions",
            renderCell: (item) => (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="xs" onClick={() => router.push(normalizeNotificationHref(item))}>
                  Open
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={workingId === item.id}
                  onClick={() => void handleToggleRead(item, !item.readAt)}
                >
                  {item.readAt ? "Mark unread" : "Mark read"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-rose-600 hover:text-rose-700"
                  disabled={workingId === item.id}
                  onClick={() => void handleDelete(item)}
                >
                  Delete
                </Button>
              </div>
            ),
          }}
        />

        <CrmPaginationBar
          limit={limit}
          onLimitChange={(value) => {
            setLimit(value);
            setPage(1);
          }}
          rowsPerPageOptions={rowsPerPageOptions}
          total={total}
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => {
            if (hasMore || page < totalPages) {
              setPage((current) => current + 1);
            }
          }}
          summary={`Total: ${total} • Unread: ${unreadCount}`}
        />
      </section>

      <CrmFilterDrawer
        open={filterOpen}
        title="Filter notifications"
        description="Refine notification type, status, and date range."
        onClose={() => setFilterOpen(false)}
        onClear={clearFilterDraft}
        onApply={() => {
          applyFilterDraft();
          setFilterOpen(false);
        }}
      >
        <div className="grid gap-4">
          <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-slate-50/70 p-4">
            <Field>
              <FieldLabel>Search term</FieldLabel>
              <Input
                value={filterDraft.q}
                onChange={(event) => setFilterDraft((current) => ({ ...current, q: event.target.value }))}
                className="h-10 text-sm"
                placeholder="Search by title or message"
              />
            </Field>
            <Field>
              <FieldLabel>Type</FieldLabel>
              <NativeSelect
                value={filterDraft.type}
                onChange={(event) =>
                  setFilterDraft((current) => ({
                    ...current,
                    type: event.target.value as NotificationFilters["type"],
                  }))
                }
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="">All types</option>
                <option value="lead">lead</option>
                <option value="deal">deal</option>
                <option value="task">task</option>
                <option value="campaign">campaign</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <NativeSelect
                value={filterDraft.status}
                onChange={(event) =>
                  setFilterDraft((current) => ({
                    ...current,
                    status: event.target.value as NotificationFilterStatus,
                  }))
                }
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="all">All</option>
                <option value="read">Read</option>
                <option value="unread">Unread</option>
              </NativeSelect>
            </Field>
          </div>

          <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Date range</div>
            <Field>
              <FieldLabel>Created from</FieldLabel>
              <Input
                type="date"
                value={filterDraft.createdFrom}
                onChange={(event) => setFilterDraft((current) => ({ ...current, createdFrom: event.target.value }))}
                className="h-10 text-sm"
              />
            </Field>
            <Field>
              <FieldLabel>Created to</FieldLabel>
              <Input
                type="date"
                value={filterDraft.createdTo}
                onChange={(event) => setFilterDraft((current) => ({ ...current, createdTo: event.target.value }))}
                className="h-10 text-sm"
              />
            </Field>
          </div>
        </div>
      </CrmFilterDrawer>

      <CrmColumnSettings
        open={columnSettingsOpen}
        description="Choose which notification columns stay visible in the table."
        columns={notificationColumns.map((column) => ({ key: column.key, label: column.label }))}
        columnVisibility={columnVisibility}
        lockedColumns={lockedColumns}
        onToggleColumn={toggleColumn}
        onReset={resetColumns}
        onClose={() => setColumnSettingsOpen(false)}
      />
    </div>
  );
}
