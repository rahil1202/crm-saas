"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, PencilLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { downloadCsvFile, toCsvCell } from "@/components/crm/csv-export";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError, apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FormListItem, FormListResponse } from "@/features/forms/types";
import { CrmConfirmDialog } from "@/components/crm/crm-list-primitives";

type FormColumnKey = "name" | "status" | "domain" | "submissions" | "lastSubmission" | "updatedAt" | "actions";
type FormSortKey = Exclude<FormColumnKey, "actions">;
type FormFilters = {
  q: string;
  status: string;
  websiteDomain: string;
  lifecycle: string;
};

const rowsPerPageOptions = [10, 20, 50, 100] as const;
const defaultColumnVisibility: Record<FormColumnKey, boolean> = {
  name: true,
  status: true,
  domain: true,
  submissions: true,
  lastSubmission: true,
  updatedAt: true,
  actions: true,
};
const lockedColumns: FormColumnKey[] = ["name"];
const emptyFilters: FormFilters = { q: "", status: "", websiteDomain: "", lifecycle: "active" };

function mapStatusFilterToApiStatus(status: string) {
  if (status === "active") return "published";
  if (status === "inactive") return "archived";
  return "";
}

function mapStatusLabel(status: string) {
  if (status === "active") return "Active";
  if (status === "inactive") return "Inactive";
  return status;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function FormsListPage() {
  const [items, setItems] = useState<FormListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FormListItem | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [columnOpen, setColumnOpen] = useState(false);
  const {
    filters,
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
    setFilters,
  } = useCrmListState<FormFilters, FormSortKey, FormColumnKey>({
    defaultFilters: emptyFilters,
    defaultSortBy: "updatedAt",
    defaultSortDir: "desc",
    defaultLimit: 10,
    rowsPerPageOptions,
    parseFilters: (params) => ({
      q: params.get("q") ?? "",
      status: params.get("status") ?? "",
      websiteDomain: params.get("websiteDomain") ?? "",
      lifecycle: params.get("lifecycle") ?? "active",
    }),
    writeFilters: (params, next) => {
      if (next.q) params.set("q", next.q);
      if (next.status) params.set("status", next.status);
      if (next.websiteDomain) params.set("websiteDomain", next.websiteDomain);
      if (next.lifecycle && next.lifecycle !== "active") params.set("lifecycle", next.lifecycle);
    },
    normalizeSortBy: (value) => (["name", "status", "domain", "submissions", "lastSubmission", "updatedAt"].includes(value ?? "") ? (value as FormSortKey) : "updatedAt"),
    columnStorageKey: "crm-saas-forms-columns",
    defaultColumnVisibility,
    lockedColumns,
  });

  const loadForms = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    const apiStatus = mapStatusFilterToApiStatus(filters.status);
    if (apiStatus) params.set("status", apiStatus);
    if (filters.websiteDomain) params.set("websiteDomain", filters.websiteDomain);
    if (filters.lifecycle) params.set("lifecycle", filters.lifecycle);
    params.set("limit", String(limit));
    params.set("offset", String((page - 1) * limit));
    try {
      const data = await apiRequest<FormListResponse>(`/forms?${params.toString()}`);
      const sorted = [...data.items].sort((a, b) => {
        const direction = sortDir === "asc" ? 1 : -1;
        const valueA =
          sortBy === "submissions"
            ? a.submissions
            : sortBy === "lastSubmission"
              ? a.lastSubmissionAt ?? ""
              : sortBy === "domain"
                ? a.websiteDomain ?? ""
                : sortBy === "updatedAt"
                  ? a.updatedAt
                  : String(a[sortBy] ?? "");
        const valueB =
          sortBy === "submissions"
            ? b.submissions
            : sortBy === "lastSubmission"
              ? b.lastSubmissionAt ?? ""
              : sortBy === "domain"
                ? b.websiteDomain ?? ""
                : sortBy === "updatedAt"
                  ? b.updatedAt
                  : String(b[sortBy] ?? "");
        return valueA > valueB ? direction : valueA < valueB ? -direction : 0;
      });
      setItems(sorted);
      setTotal(data.total);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load forms.");
    } finally {
      setLoading(false);
    }
  }, [filters, limit, page, sortBy, sortDir]);

  const deleteForm = useCallback(async (formId: string, formName: string) => {
    setDeletingId(formId);
    setError(null);
    try {
      await apiRequest<{ id: string }>(`/forms/${formId}`, { method: "DELETE" });
      toast.success(`${formName} moved to trash.`);
      setDeleteTarget(null);
      await loadForms();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to move form to trash.");
    } finally {
      setDeletingId(null);
    }
  }, [loadForms]);

  const restoreForm = useCallback(async (formId: string, formName: string) => {
    setDeletingId(formId);
    setError(null);
    try {
      await apiRequest<{ id: string }>(`/forms/${formId}/restore`, { method: "POST", body: JSON.stringify({}) });
      toast.success(`${formName} restored.`);
      await loadForms();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to restore form.");
    } finally {
      setDeletingId(null);
    }
  }, [loadForms]);

  const permanentlyDeleteForm = useCallback(async (formId: string, formName: string) => {
    setDeletingId(formId);
    setError(null);
    try {
      await apiRequest<{ id: string }>(`/forms/${formId}/permanent`, { method: "DELETE" });
      toast.success(`${formName} deleted permanently.`);
      setDeleteTarget(null);
      await loadForms();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to delete form permanently.");
    } finally {
      setDeletingId(null);
    }
  }, [loadForms]);

  const archiveForm = useCallback(async (formId: string, formName: string) => {
    setDeletingId(formId);
    setError(null);
    try {
      await apiRequest(`/forms/${formId}/archive`, { method: "POST", body: JSON.stringify({}) });
      toast.success(`${formName} archived.`);
      await loadForms();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to archive form.");
    } finally {
      setDeletingId(null);
    }
  }, [loadForms]);

  const unarchiveForm = useCallback(async (formId: string, formName: string) => {
    setDeletingId(formId);
    setError(null);
    try {
      await apiRequest(`/forms/${formId}/unarchive`, { method: "POST", body: JSON.stringify({}) });
      toast.success(`${formName} moved back to draft.`);
      await loadForms();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to unarchive form.");
    } finally {
      setDeletingId(null);
    }
  }, [loadForms]);

  useEffect(() => {
    void loadForms();
  }, [loadForms]);

  const appliedFilters = useMemo(
    () =>
      [
        filters.q ? { key: "q" as const, label: "Search", value: filters.q } : null,
        filters.status ? { key: "status" as const, label: "Status", value: mapStatusLabel(filters.status) } : null,
        filters.lifecycle && filters.lifecycle !== "active" ? { key: "lifecycle" as const, label: "Record State", value: filters.lifecycle } : null,
        filters.websiteDomain ? { key: "websiteDomain" as const, label: "Domain", value: filters.websiteDomain } : null,
      ].filter(Boolean) as Array<{ key: keyof FormFilters; label: string; value: string }>,
    [filters],
  );

  const columns: Array<ColumnDefinition<FormListItem, FormColumnKey, FormSortKey>> = [
    {
      key: "name",
      label: "Form name",
      sortable: true,
      sortKey: "name",
      renderCell: (record) => (
        <div className="grid gap-1">
          <Link href={`/dashboard/forms/${record.id}`} className="font-medium text-slate-900 hover:text-sky-700 hover:underline">
            {record.name}
          </Link>
          <div className="text-xs text-muted-foreground">{record.slug}</div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortKey: "status",
      renderCell: (record) => <Badge variant={record.status === "published" ? "default" : record.status === "draft" ? "secondary" : "outline"}>{record.status}</Badge>,
    },
    {
      key: "domain",
      label: "Domain",
      sortable: true,
      sortKey: "domain",
      renderCell: (record) => record.websiteDomain ?? "—",
    },
    {
      key: "submissions",
      label: "Submissions",
      sortable: true,
      sortKey: "submissions",
      renderCell: (record) => String(record.submissions),
    },
    {
      key: "lastSubmission",
      label: "Last submission",
      sortable: true,
      sortKey: "lastSubmission",
      renderCell: (record) => formatDate(record.lastSubmissionAt),
    },
    {
      key: "updatedAt",
      label: "Updated",
      sortable: true,
      sortKey: "updatedAt",
      renderCell: (record) => formatDate(record.updatedAt),
    },
    {
      key: "actions",
      label: "Actions",
      renderCell: (record) => (
        <div className="flex items-center gap-2">
          {filters.lifecycle === "deleted" ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => void restoreForm(record.id, record.name)} disabled={deletingId === record.id}>
                Restore
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteTarget(record)} disabled={deletingId === record.id}>
                Delete permanently
              </Button>
            </>
          ) : (
            <>
              <Link href={`/dashboard/forms/${record.id}`} className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }))} aria-label={`Edit ${record.name}`} title={`Edit ${record.name}`}>
                <PencilLine className="size-4" />
              </Link>
              <Button type="button" variant="outline" size="sm" onClick={() => void (record.status === "archived" ? unarchiveForm(record.id, record.name) : archiveForm(record.id, record.name))} disabled={deletingId === record.id}>
                {record.status === "archived" ? "Unarchive" : "Archive"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="icon-sm"
                onClick={() => setDeleteTarget(record)}
                disabled={deletingId === record.id}
                aria-label={`Delete ${record.name}`}
                title={`Delete ${record.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const exportCsv = () => {
    const header = ["Form Name", "Status", "Domain", "Submissions", "Last Submission", "Updated"];
    const rows = items.map((item) => [item.name, item.status, item.websiteDomain ?? "", String(item.submissions), item.lastSubmissionAt ?? "", item.updatedAt]);
    const csv = [header, ...rows].map((row) => row.map(toCsvCell).join(",")).join("\n");
    downloadCsvFile(csv, "forms.csv");
    toast.success("Forms exported.");
  };

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Forms error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <CrmListPageHeader
        title="Forms"
        actions={
          <>
            <Button type="button" variant="outline" onClick={exportCsv}>
              <Download className="size-4" />
              Export
            </Button>
            <Link href="/dashboard/forms/new" className={cn(buttonVariants({ variant: "default" }))}>
              <Plus className="size-4" />
              Create New
            </Link>
          </>
        }
      />

      <div className="overflow-hidden rounded-[1.5rem] border border-border/60 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.18)]">
        <CrmListToolbar
          searchValue={filters.q}
          searchPlaceholder="Search forms"
          onSearchChange={(value) => {
            setFilters((current) => ({ ...current, q: value }));
            setPage(1);
          }}
          onOpenFilters={() => setFilterOpen(true)}
          filterCount={appliedFilters.length}
          onOpenColumns={() => setColumnOpen(true)}
          onRefresh={() => void loadForms()}
        />
        <CrmAppliedFiltersBar chips={appliedFilters} onRemove={removeAppliedFilter} onClear={clearAllFilters} emptyLabel="No active form filters." />
        <CrmDataTable
          columns={columns}
          rows={items}
          rowKey={(row) => row.id}
          loading={loading}
          emptyLabel="No forms found."
          columnVisibility={columnVisibility}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={requestSort}
        />
        <CrmPaginationBar
          page={page}
          limit={limit}
          total={total}
          totalPages={Math.max(1, Math.ceil(total / limit))}
          rowsPerPageOptions={rowsPerPageOptions}
          onPrev={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(Math.max(1, Math.ceil(total / limit)), current + 1))}
          onLimitChange={(value) => {
            setLimit(value);
            setPage(1);
          }}
        />
      </div>

      <CrmFilterDrawer
        open={filterOpen}
        title="Filter forms"
        description="Narrow the list by status and domain."
        onClose={() => setFilterOpen(false)}
        onApply={() => {
          applyFilterDraft();
          setFilterOpen(false);
        }}
        onClear={() => {
          clearFilterDraft();
          setFilterDraft(emptyFilters);
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="forms-filter-status">Status</FieldLabel>
            <NativeSelect id="forms-filter-status" value={filterDraft.status} onChange={(event) => setFilterDraft((current) => ({ ...current, status: event.target.value }))}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="forms-filter-lifecycle">Record state</FieldLabel>
            <NativeSelect id="forms-filter-lifecycle" value={filterDraft.lifecycle} onChange={(event) => setFilterDraft((current) => ({ ...current, lifecycle: event.target.value }))}>
              <option value="active">Active</option>
              <option value="deleted">Deleted</option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="forms-filter-domain">Website domain</FieldLabel>
            <Input id="forms-filter-domain" value={filterDraft.websiteDomain} onChange={(event) => setFilterDraft((current) => ({ ...current, websiteDomain: event.target.value }))} placeholder="example.com" />
          </Field>
        </FieldGroup>
      </CrmFilterDrawer>

      <CrmColumnSettings
        open={columnOpen}
        title="Form columns"
        description="Choose the visible columns in the forms table."
        onClose={() => setColumnOpen(false)}
        columns={[
          { key: "name", label: "Form name" },
          { key: "status", label: "Status" },
          { key: "domain", label: "Domain" },
          { key: "submissions", label: "Submissions" },
          { key: "lastSubmission", label: "Last submission" },
          { key: "updatedAt", label: "Updated" },
          { key: "actions", label: "Actions" },
        ]}
        columnVisibility={columnVisibility}
        lockedColumns={lockedColumns}
        onToggleColumn={toggleColumn}
        onReset={resetColumns}
      />

      <CrmConfirmDialog
        open={Boolean(deleteTarget)}
        title={filters.lifecycle === "deleted" ? "Delete Form Permanently" : "Move Form To Trash"}
        description={deleteTarget ? filters.lifecycle === "deleted" ? `${deleteTarget.name} will be deleted permanently.` : `${deleteTarget.name} will be removed from active records.` : undefined}
        warning={filters.lifecycle === "deleted" ? "This action cannot be undone. Form responses will be removed with the form record." : "This moves the form to the deleted view. You can restore it later."}
        confirmLabel={filters.lifecycle === "deleted" ? "Delete permanently" : "Move to trash"}
        submitting={deleteTarget ? deletingId === deleteTarget.id : false}
        onConfirm={() => {
          if (deleteTarget) {
            if (filters.lifecycle === "deleted") {
              void permanentlyDeleteForm(deleteTarget.id, deleteTarget.name);
            } else {
              void deleteForm(deleteTarget.id, deleteTarget.name);
            }
          }
        }}
        onCancel={() => {
          if (!deletingId) {
            setDeleteTarget(null);
          }
        }}
      />
    </div>
  );
}
