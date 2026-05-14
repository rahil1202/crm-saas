"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  CrmAppliedFiltersBar,
  CrmColumnSettings,
  CrmConfirmDialog,
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
import { ApiError, apiRequest } from "@/lib/api";
import type { FlowRecord, FlowVersion } from "@/features/whatsapp-crm/flow-builder/canvas-types";

type FlowStatus = FlowRecord["status"];
type FlowSortKey = "name" | "status" | "entryChannel" | "nodes" | "updatedAt";
type FlowColumnKey = FlowSortKey;

type FlowListItem = FlowRecord & {
  draftVersion: FlowVersion | null;
  publishedVersion: FlowVersion | null;
};

type FlowDetail = FlowRecord & {
  draftVersion: FlowVersion;
};

interface FlowListResponse {
  items: FlowListItem[];
  total: number;
  limit: number;
  offset: number;
}

type FlowFilters = {
  q: string;
  status: string;
};

type FlowFilterKey = keyof FlowFilters;

const rowsPerPageOptions = [10, 20, 50, 100] as const;
const columnStorageKey = "crm-saas-whatsapp-flows-columns";
const lockedColumns: FlowColumnKey[] = ["name"];
const flowStatuses: FlowStatus[] = ["draft", "published", "archived"];

const emptyFilters: FlowFilters = {
  q: "",
  status: "",
};

const defaultColumnVisibility: Record<FlowColumnKey, boolean> = {
  name: true,
  status: true,
  entryChannel: true,
  nodes: true,
  updatedAt: true,
};

const statusTone: Record<FlowStatus, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-700",
  published: "border-emerald-200 bg-emerald-50 text-emerald-700",
  archived: "border-amber-200 bg-amber-50 text-amber-700",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function compareValues(left: string | number, right: string | number, direction: "asc" | "desc") {
  if (typeof left === "number" && typeof right === "number") {
    return direction === "asc" ? left - right : right - left;
  }
  const comparison = String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
  return direction === "asc" ? comparison : -comparison;
}

function readFiltersFromSearchParams(params: Pick<URLSearchParams, "get">): FlowFilters {
  return {
    q: params.get("q") ?? "",
    status: params.get("status") ?? "",
  };
}

function writeFiltersToSearchParams(params: URLSearchParams, filters: FlowFilters) {
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.status.trim()) params.set("status", filters.status.trim());
}

function normalizeSortBy(value: string | null): FlowSortKey {
  const allowed: FlowSortKey[] = ["name", "status", "entryChannel", "nodes", "updatedAt"];
  return allowed.includes(value as FlowSortKey) ? (value as FlowSortKey) : "updatedAt";
}

function getFilterChips(filters: FlowFilters) {
  const chips: Array<{ key: FlowFilterKey; label: string; value: string }> = [];
  if (filters.q.trim()) chips.push({ key: "q", label: "Search", value: filters.q.trim() });
  if (filters.status.trim()) chips.push({ key: "status", label: "Status", value: filters.status.trim() });
  return chips;
}

function openBuilderPath(flowId: string) {
  return `/dashboard/whatsapp-crm/flow-builder/new?flowId=${flowId}`;
}

export function WhatsappFlowBuilderHomePage() {
  const router = useRouter();
  const [flows, setFlows] = useState<FlowListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FlowListItem | null>(null);

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
  } = useCrmListState<FlowFilters, FlowSortKey, FlowColumnKey>({
    defaultFilters: emptyFilters,
    defaultSortBy: "updatedAt",
    defaultSortDir: "desc",
    defaultLimit: rowsPerPageOptions[0],
    rowsPerPageOptions,
    parseFilters: readFiltersFromSearchParams,
    writeFilters: writeFiltersToSearchParams,
    normalizeSortBy,
    columnStorageKey,
    defaultColumnVisibility,
    lockedColumns,
  });

  const loadFlows = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String((page - 1) * limit));
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.status.trim()) params.set("status", filters.status.trim());

    try {
      const payload = await apiRequest<FlowListResponse>(`/chatbot-flows/list?${params.toString()}`, { skipCache: true });
      setFlows(payload.items);
      setTotal(payload.total);
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Unable to load WhatsApp flows.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [filters.q, filters.status, limit, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadFlows();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [loadFlows]);

  const sortedFlows = useMemo(() => {
    const next = [...flows];
    next.sort((left, right) => {
      const getValue = (flow: FlowListItem) => {
        switch (sortBy) {
          case "name":
            return flow.name;
          case "status":
            return flow.status;
          case "entryChannel":
            return flow.entryChannel;
          case "nodes":
            return flow.draftVersion?.definition.nodes.length ?? 0;
          case "updatedAt":
            return new Date(flow.updatedAt).getTime();
          default:
            return flow.name;
        }
      };
      return compareValues(getValue(left), getValue(right), sortDir);
    });
    return next;
  }, [flows, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const activeFilterChips = useMemo(() => getFilterChips(filters), [filters]);

  const createFlow = async () => {
    setCreating(true);
    setError(null);
    try {
      const payload = await apiRequest<FlowDetail>("/chatbot-flows", {
        method: "POST",
        body: JSON.stringify({ name: "New WhatsApp Flow", entryChannel: "whatsapp" }),
      });
      toast.success("New flow created.");
      router.push(openBuilderPath(payload.id));
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Unable to create flow.";
      setError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const deleteFlow = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiRequest(`/chatbot-flows/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Flow deleted.");
      setDeleteTarget(null);
      await loadFlows();
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Unable to delete flow.";
      setError(message);
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  };

  const columns: Array<ColumnDefinition<FlowListItem, FlowColumnKey, FlowSortKey>> = [
    {
      key: "name",
      label: "Flow Name",
      sortable: true,
      sortKey: "name",
      widthClassName: "min-w-[260px]",
      renderCell: (flow) => <div className="font-medium text-slate-900">{flow.name}</div>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortKey: "status",
      widthClassName: "min-w-[140px]",
      renderCell: (flow) => <Badge variant="outline" className={statusTone[flow.status]}>{flow.status}</Badge>,
    },
    {
      key: "entryChannel",
      label: "Channel",
      sortable: true,
      sortKey: "entryChannel",
      widthClassName: "min-w-[140px]",
      renderCell: (flow) => <Badge variant="outline" className="capitalize">{flow.entryChannel}</Badge>,
    },
    {
      key: "nodes",
      label: "Nodes",
      sortable: true,
      sortKey: "nodes",
      widthClassName: "min-w-[110px]",
      renderCell: (flow) => <span>{flow.draftVersion?.definition.nodes.length ?? 0}</span>,
    },
    {
      key: "updatedAt",
      label: "Updated",
      sortable: true,
      sortKey: "updatedAt",
      widthClassName: "min-w-[190px]",
      renderCell: (flow) => <span className="text-slate-600">{formatDateTime(flow.updatedAt)}</span>,
    },
  ];

  return (
    <div className="grid gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Flow request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <CrmListPageHeader
        title="WhatsApp Flow Builder"
        actions={
          <Button type="button" size="sm" onClick={() => void createFlow()} disabled={creating}>
            <Plus className="size-4" /> {creating ? "Creating..." : "Create new"}
          </Button>
        }
      />

      <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-white shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
        <CrmListToolbar
          searchValue={filters.q}
          searchPlaceholder="Search flows"
          onSearchChange={(value) => {
            setPage(1);
            setFilters((current) => ({ ...current, q: value }));
            setFilterDraft((current) => ({ ...current, q: value }));
          }}
          onOpenFilters={() => setFilterOpen(true)}
          filterCount={activeFilterChips.length}
          onOpenColumns={() => setColumnSettingsOpen(true)}
          onRefresh={() => void loadFlows()}
          extraContent={<div className="text-sm text-muted-foreground">{total} saved flow{total === 1 ? "" : "s"}</div>}
        />

        <CrmAppliedFiltersBar chips={activeFilterChips} onRemove={removeAppliedFilter} onClear={clearAllFilters} />

        <CrmDataTable
          columns={columns}
          rows={sortedFlows}
          rowKey={(flow) => flow.id}
          loading={loading}
          emptyLabel="No WhatsApp flows found."
          columnVisibility={columnVisibility}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={(key) => requestSort(key, key === "updatedAt" || key === "nodes" ? "desc" : "asc")}
          onRowClick={(flow) => router.push(openBuilderPath(flow.id))}
          actionColumn={{
            header: "Actions",
            renderCell: (flow) => (
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" size="xs" onClick={() => router.push(openBuilderPath(flow.id))}>
                  <ExternalLink className="size-3.5" /> Open
                </Button>
                <Button type="button" variant="ghost" size="xs" onClick={() => router.push(openBuilderPath(flow.id))}>
                  <Edit3 className="size-3.5" /> Edit
                </Button>
                <Button type="button" variant="ghost" size="xs" className="text-rose-600 hover:text-rose-700" onClick={() => setDeleteTarget(flow)}>
                  <Trash2 className="size-3.5" /> Delete
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
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
        />
      </section>

      <CrmFilterDrawer
        open={filterOpen}
        title="Filter Flows"
        description="Filter saved WhatsApp flows by name and status."
        onClose={() => setFilterOpen(false)}
        onClear={clearFilterDraft}
        onApply={() => {
          applyFilterDraft();
          setFilterOpen(false);
        }}
      >
        <div className="grid gap-4">
          <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-slate-50/70 p-4">
            <div className="text-sm font-semibold text-slate-900">Search</div>
            <Field>
              <FieldLabel>Search term</FieldLabel>
              <Input
                value={filterDraft.q}
                onChange={(event) => setFilterDraft((current) => ({ ...current, q: event.target.value }))}
                className="h-10 text-sm"
                placeholder="Flow name"
              />
            </Field>
          </div>
          <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Flow details</div>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <NativeSelect
                value={filterDraft.status}
                onChange={(event) => setFilterDraft((current) => ({ ...current, status: event.target.value }))}
                className="h-10 rounded-xl px-3 text-sm"
              >
                <option value="">All statuses</option>
                {flowStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </div>
      </CrmFilterDrawer>

      <CrmColumnSettings
        open={columnSettingsOpen}
        description="Choose which saved-flow columns stay visible in the table."
        columns={columns.map((column) => ({ key: column.key, label: column.label }))}
        columnVisibility={columnVisibility}
        lockedColumns={lockedColumns}
        onToggleColumn={toggleColumn}
        onReset={resetColumns}
        onClose={() => setColumnSettingsOpen(false)}
      />

      <CrmConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Flow"
        description={deleteTarget ? `${deleteTarget.name} will be removed from saved WhatsApp flows.` : undefined}
        warning="This removes the flow from the builder list. Published keyword triggers or campaign references should be reviewed before deleting."
        confirmLabel="Delete flow"
        submitting={actionLoading}
        onCancel={() => {
          if (!actionLoading) setDeleteTarget(null);
        }}
        onConfirm={() => void deleteFlow()}
      />
    </div>
  );
}
