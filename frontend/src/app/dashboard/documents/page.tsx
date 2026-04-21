"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, Edit3, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  CrmAppliedFiltersBar,
  CrmColumnSettings,
  CrmConfirmDialog,
  CrmDataTable,
  CrmFilterDrawer,
  CrmListPageHeader,
  CrmListToolbar,
  CrmModalShell,
  CrmPaginationBar,
} from "@/components/crm/crm-list-primitives";
import { downloadCsvFile } from "@/components/crm/csv-export";
import type { ColumnDefinition } from "@/components/crm/types";
import { useCrmListState } from "@/components/crm/use-crm-list-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { loadMe } from "@/lib/me-cache";
import {
  buildDocumentsCsv,
  formatDocumentAssociation,
  formatDocumentEntityType,
  formatDocumentFileSize,
} from "@/features/documents/helpers";
import type {
  DocumentAssociationOption,
  DocumentAssociationOptionListResponse,
  DocumentItem,
  DocumentListResponse,
  DocumentUiEntityType,
  DocumentUploadResponse,
} from "@/features/documents/types";
import { toApiDocumentEntityType, toUiDocumentEntityType } from "@/features/documents/types";

type DocumentSortKey = "createdAt";
type DocumentColumnKey = "name" | "remark" | "associatedWith" | "uploadedBy" | "uploadDate" | "updatedDate" | "actions";
type DocumentFilters = {
  q: string;
  folder: string;
  entityType: string;
};

const rowsPerPageOptions = [10, 20, 50, 100] as const;
const columnStorageKey = "crm-saas-documents-columns";
const defaultFilters: DocumentFilters = {
  q: "",
  folder: "",
  entityType: "",
};

const defaultColumnVisibility: Record<DocumentColumnKey, boolean> = {
  name: true,
  remark: true,
  associatedWith: true,
  uploadedBy: true,
  uploadDate: true,
  updatedDate: true,
  actions: true,
};

function readFiltersFromSearchParams(params: Pick<URLSearchParams, "get">): DocumentFilters {
  return {
    q: params.get("q") ?? "",
    folder: params.get("folder") ?? "",
    entityType: params.get("entityType") ?? "",
  };
}

function writeFiltersToSearchParams(params: URLSearchParams, filters: DocumentFilters) {
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.folder.trim()) params.set("folder", filters.folder.trim());
  if (filters.entityType) params.set("entityType", filters.entityType);
}

function normalizeSortKey(): DocumentSortKey {
  return "createdAt";
}

export default function DocumentsPage() {
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [columnOpen, setColumnOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DocumentItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [uploadedByName, setUploadedByName] = useState("Current user");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [uploadRemark, setUploadRemark] = useState("");
  const [uploadFolder, setUploadFolder] = useState("general");
  const [uploadEntityType, setUploadEntityType] = useState<DocumentUiEntityType>("general");
  const [uploadEntityQuery, setUploadEntityQuery] = useState("");
  const [uploadEntityId, setUploadEntityId] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);

  const [editRemark, setEditRemark] = useState("");
  const [editFolder, setEditFolder] = useState("general");
  const [editEntityType, setEditEntityType] = useState<DocumentUiEntityType>("general");
  const [editEntityQuery, setEditEntityQuery] = useState("");
  const [editEntityId, setEditEntityId] = useState("");

  const [associationOptions, setAssociationOptions] = useState<DocumentAssociationOption[]>([]);
  const [associationLoading, setAssociationLoading] = useState(false);

  const {
    filters,
    setFilters,
    filterDraft,
    setFilterDraft,
    page,
    setPage,
    limit,
    setLimit,
    columnVisibility,
    applyFilterDraft,
    clearFilterDraft,
    clearAllFilters,
    removeAppliedFilter,
    toggleColumn,
    resetColumns,
  } = useCrmListState<DocumentFilters, DocumentSortKey, DocumentColumnKey>({
    defaultFilters,
    defaultSortBy: "createdAt",
    rowsPerPageOptions,
    defaultLimit: 20,
    parseFilters: readFiltersFromSearchParams,
    writeFilters: writeFiltersToSearchParams,
    normalizeSortBy: normalizeSortKey,
    columnStorageKey,
    defaultColumnVisibility,
    lockedColumns: ["name", "actions"],
  });

  const offset = (page - 1) * limit;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const appliedFilterChips = useMemo(() => {
    const chips: Array<{ key: keyof DocumentFilters; label: string; value: string }> = [];
    if (filters.q.trim()) chips.push({ key: "q", label: "Search", value: filters.q.trim() });
    if (filters.folder.trim()) chips.push({ key: "folder", label: "Folder", value: filters.folder.trim() });
    if (filters.entityType) {
      const uiType = toUiDocumentEntityType(filters.entityType as "general" | "lead" | "deal" | "customer");
      chips.push({ key: "entityType", label: "Association", value: formatDocumentEntityType(toApiDocumentEntityType(uiType)) });
    }
    return chips;
  }, [filters]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.folder.trim()) params.set("folder", filters.folder.trim());
    if (filters.entityType) params.set("entityType", filters.entityType);

    try {
      const response = await apiRequest<DocumentListResponse>(`/documents/list?${params.toString()}`);
      setItems(response.items);
      setTotal(response.total);
      setSelectedDocumentIds((current) => current.filter((id) => response.items.some((item) => item.id === id)));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load documents");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters, limit, offset]);

  const loadAssociationOptions = useCallback(async (mode: "upload" | "edit") => {
    const activeType = mode === "upload" ? uploadEntityType : editEntityType;
    const activeQuery = mode === "upload" ? uploadEntityQuery : editEntityQuery;

    if (activeType === "general") {
      setAssociationOptions([]);
      return;
    }

    setAssociationLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("entityType", toApiDocumentEntityType(activeType));
      params.set("limit", "20");
      if (activeQuery.trim()) {
        params.set("q", activeQuery.trim());
      }
      const response = await apiRequest<DocumentAssociationOptionListResponse>(`/documents/association-options?${params.toString()}`);
      setAssociationOptions(response.items);
    } catch {
      setAssociationOptions([]);
    } finally {
      setAssociationLoading(false);
    }
  }, [editEntityQuery, editEntityType, uploadEntityQuery, uploadEntityType]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    void loadMe()
      .then((me) => {
        const displayName = me.user.fullName?.trim() || me.user.email?.trim() || "Current user";
        setUploadedByName(displayName);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!addModalOpen) {
      return;
    }
    void loadAssociationOptions("upload");
  }, [addModalOpen, loadAssociationOptions, uploadEntityType, uploadEntityQuery]);

  useEffect(() => {
    if (!editTarget) {
      return;
    }
    void loadAssociationOptions("edit");
  }, [editTarget, loadAssociationOptions, editEntityType, editEntityQuery]);

  const columns: Array<ColumnDefinition<DocumentItem, DocumentColumnKey>> = useMemo(
    () => [
      {
        key: "name",
        label: "Filename",
        renderCell: (document) => (
          <div className="grid gap-1">
            <Link href={`/dashboard/documents/files/${document.id}`} className="font-medium text-slate-900 underline-offset-4 hover:underline">
              {document.originalName}
            </Link>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="rounded-md px-1.5 py-0">
                {document.folder}
              </Badge>
              <span>{formatDocumentFileSize(document.sizeBytes)}</span>
            </div>
          </div>
        ),
      },
      {
        key: "remark",
        label: "Remark",
        renderCell: (document) => document.remark?.trim() || <span className="text-muted-foreground">-</span>,
      },
      {
        key: "associatedWith",
        label: "Associated With",
        renderCell: (document) => <span>{formatDocumentAssociation(document)}</span>,
      },
      {
        key: "uploadedBy",
        label: "Uploaded By",
        renderCell: (document) => document.uploadedByName?.trim() || "Unknown",
      },
      {
        key: "uploadDate",
        label: "Upload Date",
        renderCell: (document) => new Date(document.createdAt).toLocaleString(),
      },
      {
        key: "updatedDate",
        label: "Updated Date",
        renderCell: (document) => new Date(document.updatedAt).toLocaleString(),
      },
      {
        key: "actions",
        label: "Actions",
        renderCell: () => null,
      },
    ],
    [],
  );

  const openEditModal = useCallback((document: DocumentItem) => {
    setEditTarget(document);
    setEditRemark(document.remark ?? "");
    setEditFolder(document.folder || "general");
    setEditEntityType(toUiDocumentEntityType(document.entityType));
    setEditEntityQuery("");
    setEditEntityId(document.entityId ?? "");
    setAssociationOptions([]);
  }, []);

  const handleUpload = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (uploadFiles.length === 0) {
      toast.error("Select at least one file to upload");
      return;
    }
    if (uploadEntityType !== "general" && !uploadEntityId) {
      toast.error("Select an association record");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      for (const file of uploadFiles) {
        formData.append("files", file);
      }
      formData.set("entityType", toApiDocumentEntityType(uploadEntityType));
      formData.set("folder", uploadFolder.trim() || "general");
      if (uploadRemark.trim()) {
        formData.set("remark", uploadRemark.trim());
      }
      if (uploadEntityType !== "general") {
        formData.set("entityId", uploadEntityId);
      }

      const response = await apiRequest<DocumentUploadResponse>("/documents/upload", {
        method: "POST",
        body: formData,
      });

      toast.success(`${response.createdCount} document${response.createdCount === 1 ? "" : "s"} uploaded`);
      setUploadFiles([]);
      setUploadRemark("");
      setUploadFolder("general");
      setUploadEntityType("general");
      setUploadEntityId("");
      setUploadEntityQuery("");
      setAddModalOpen(false);
      setPage(1);
      await loadDocuments();
    } catch (requestError) {
      toast.error(requestError instanceof ApiError ? requestError.message : "Unable to upload documents");
    } finally {
      setSubmitting(false);
    }
  }, [loadDocuments, setPage, uploadEntityId, uploadEntityType, uploadFiles, uploadFolder, uploadRemark]);

  const handleUpdateDocument = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editTarget) {
      return;
    }
    if (editEntityType !== "general" && !editEntityId) {
      toast.error("Select an association record");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest(`/documents/${editTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          entityType: toApiDocumentEntityType(editEntityType),
          entityId: editEntityType === "general" ? null : editEntityId,
          folder: editFolder.trim() || "general",
          remark: editRemark.trim() || null,
        }),
      });
      toast.success("Document updated");
      setEditTarget(null);
      await loadDocuments();
    } catch (requestError) {
      toast.error(requestError instanceof ApiError ? requestError.message : "Unable to update document");
    } finally {
      setSubmitting(false);
    }
  }, [editEntityId, editEntityType, editFolder, editRemark, editTarget, loadDocuments]);

  const handleDeleteDocument = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleting(true);
    try {
      await apiRequest(`/documents/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Document deleted");
      setDeleteTarget(null);
      await loadDocuments();
    } catch (requestError) {
      toast.error(requestError instanceof ApiError ? requestError.message : "Unable to delete document");
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, loadDocuments]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedDocumentIds.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    setDeleting(true);
    try {
      const response = await apiRequest<{ count: number }>("/documents/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: selectedDocumentIds }),
      });
      toast.success(`${response.count} documents deleted`);
      setSelectedDocumentIds([]);
      setBulkDeleteOpen(false);
      await loadDocuments();
    } catch (requestError) {
      toast.error(requestError instanceof ApiError ? requestError.message : "Unable to bulk delete documents");
    } finally {
      setDeleting(false);
    }
  }, [loadDocuments, selectedDocumentIds]);

  const handleExport = useCallback(async () => {
    try {
      const exportItems: DocumentItem[] = [];
      const batchSize = 100;
      let exportOffset = 0;
      let hasMore = true;

      while (hasMore) {
        const params = new URLSearchParams();
        params.set("limit", String(batchSize));
        params.set("offset", String(exportOffset));
        if (filters.q.trim()) params.set("q", filters.q.trim());
        if (filters.folder.trim()) params.set("folder", filters.folder.trim());
        if (filters.entityType) params.set("entityType", filters.entityType);

        const response = await apiRequest<DocumentListResponse>(`/documents/list?${params.toString()}`, { skipCache: true });
        exportItems.push(...response.items);
        hasMore = response.items.length === batchSize;
        exportOffset += batchSize;
      }

      downloadCsvFile(buildDocumentsCsv(exportItems), "documents.csv");
      toast.success("Documents exported");
    } catch (requestError) {
      toast.error(requestError instanceof ApiError ? requestError.message : "Unable to export documents");
    }
  }, [filters.entityType, filters.folder, filters.q]);

  return (
    <div className="grid gap-4">
      <CrmListPageHeader
        title="Documents"
        actions={(
          <>
            <Button type="button" variant="outline" onClick={handleExport}>
              <Download className="size-4" />
              Export
            </Button>
            <Button type="button" onClick={() => setAddModalOpen(true)}>
              <Plus className="size-4" />
              Add files
            </Button>
          </>
        )}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Documents request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="overflow-hidden rounded-[1.5rem] border border-border/60 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.18)]">
        <CrmListToolbar
          searchValue={filters.q}
          searchPlaceholder="Search by file name or remark"
          onSearchChange={(value) => {
            setFilters((current) => ({ ...current, q: value }));
            setPage(1);
          }}
          onOpenFilters={() => setFilterOpen(true)}
          filterCount={appliedFilterChips.length}
          onOpenColumns={() => setColumnOpen(true)}
          onRefresh={() => void loadDocuments()}
          extraContent={selectedDocumentIds.length > 0 ? (
            <Button type="button" variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="size-4" />
              Delete selected ({selectedDocumentIds.length})
            </Button>
          ) : undefined}
        />

        <CrmAppliedFiltersBar
          chips={appliedFilterChips}
          onRemove={(key) => removeAppliedFilter(key)}
          onClear={clearAllFilters}
          emptyLabel="No active document filters."
        />

        <CrmDataTable
          columns={columns}
          rows={items}
          rowKey={(record) => record.id}
          loading={loading}
          emptyLabel="No documents found."
          columnVisibility={columnVisibility}
          selectable
          selectedRowIds={selectedDocumentIds}
          onToggleRow={(rowId, checked) => {
            setSelectedDocumentIds((current) => (checked ? Array.from(new Set([...current, rowId])) : current.filter((id) => id !== rowId)));
          }}
          onToggleAllVisible={(checked) => {
            if (!checked) {
              setSelectedDocumentIds((current) => current.filter((id) => !items.some((item) => item.id === id)));
              return;
            }
            setSelectedDocumentIds((current) => Array.from(new Set([...current, ...items.map((item) => item.id)])));
          }}
          actionColumn={{
            header: "Actions",
            className: "w-[180px]",
            renderCell: (document) => (
              <div className="flex items-center justify-end gap-1.5">
                <Button type="button" size="sm" variant="outline" onClick={() => openEditModal(document)}>
                  <Edit3 className="size-3.5" />
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => setDeleteTarget(document)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ),
          }}
        />

        <CrmPaginationBar
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          rowsPerPageOptions={rowsPerPageOptions}
          onPrev={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          onLimitChange={(value) => {
            setLimit(value);
            setPage(1);
          }}
        />
      </div>

      <CrmFilterDrawer
        open={filterOpen}
        title="Filter documents"
        description="Narrow by folder and association type."
        onClose={() => setFilterOpen(false)}
        onApply={() => {
          applyFilterDraft();
          setFilterOpen(false);
        }}
        onClear={() => {
          clearFilterDraft();
          setFilterDraft(defaultFilters);
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="document-filter-folder">Folder</FieldLabel>
            <Input
              id="document-filter-folder"
              value={filterDraft.folder}
              onChange={(event) => setFilterDraft((current) => ({ ...current, folder: event.target.value }))}
              placeholder="general"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="document-filter-entity">Association type</FieldLabel>
            <NativeSelect
              id="document-filter-entity"
              value={filterDraft.entityType}
              onChange={(event) => setFilterDraft((current) => ({ ...current, entityType: event.target.value }))}
            >
              <option value="">All</option>
              <option value="general">General</option>
              <option value="lead">Lead</option>
              <option value="deal">Deal</option>
              <option value="customer">Contact</option>
            </NativeSelect>
          </Field>
        </FieldGroup>
      </CrmFilterDrawer>

      <CrmColumnSettings
        open={columnOpen}
        title="Document columns"
        description="Choose the visible columns for the documents table."
        onClose={() => setColumnOpen(false)}
        columns={[
          { key: "name", label: "Filename" },
          { key: "remark", label: "Remark" },
          { key: "associatedWith", label: "Associated with" },
          { key: "uploadedBy", label: "Uploaded by" },
          { key: "uploadDate", label: "Upload date" },
          { key: "updatedDate", label: "Updated date" },
          { key: "actions", label: "Actions" },
        ]}
        columnVisibility={columnVisibility}
        lockedColumns={["name", "actions"]}
        onToggleColumn={toggleColumn}
        onReset={resetColumns}
      />

      <CrmModalShell
        open={addModalOpen}
        title="Add files"
        description="Upload one or more files with shared metadata and association."
        onClose={() => {
          if (!submitting) {
            setAddModalOpen(false);
          }
        }}
      >
        <form className="grid gap-4" onSubmit={handleUpload}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="upload-remark">Remark</FieldLabel>
              <Textarea id="upload-remark" value={uploadRemark} onChange={(event) => setUploadRemark(event.target.value)} rows={3} />
            </Field>
            <Field>
              <FieldLabel htmlFor="upload-folder">Folder</FieldLabel>
              <Input id="upload-folder" value={uploadFolder} onChange={(event) => setUploadFolder(event.target.value)} placeholder="general" />
            </Field>
            <Field>
              <FieldLabel htmlFor="upload-entity-type">Associated with</FieldLabel>
              <NativeSelect
                id="upload-entity-type"
                value={uploadEntityType}
                onChange={(event) => {
                  setUploadEntityType(event.target.value as DocumentUiEntityType);
                  setUploadEntityId("");
                  setUploadEntityQuery("");
                  setAssociationOptions([]);
                }}
              >
                <option value="general">General</option>
                <option value="lead">Lead</option>
                <option value="deal">Deal</option>
                <option value="contact">Contact</option>
              </NativeSelect>
            </Field>
            {uploadEntityType !== "general" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="upload-entity-query">Search association</FieldLabel>
                  <Input id="upload-entity-query" value={uploadEntityQuery} onChange={(event) => setUploadEntityQuery(event.target.value)} placeholder="Search by name or title" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="upload-entity-id">Select record</FieldLabel>
                  <NativeSelect id="upload-entity-id" value={uploadEntityId} onChange={(event) => setUploadEntityId(event.target.value)}>
                    <option value="">Choose record</option>
                    {associationOptions.map((option) => (
                      <option key={option.entityId} value={option.entityId}>
                        {option.entityLabel}{option.entitySubtitle ? ` - ${option.entitySubtitle}` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                  <FieldDescription>{associationLoading ? "Loading options..." : "Results are scoped to current company."}</FieldDescription>
                </Field>
              </>
            ) : null}
            <Field>
              <FieldLabel>Uploaded by</FieldLabel>
              <Input value={uploadedByName} readOnly />
            </Field>
          </FieldGroup>

          <div
            className="rounded-2xl border border-dashed border-border/80 bg-slate-50/65 p-5"
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const dropped = Array.from(event.dataTransfer.files || []);
              if (dropped.length > 0) {
                setUploadFiles((current) => [...current, ...dropped]);
              }
            }}
          >
            <div className="text-sm font-medium text-slate-900">Drop files here</div>
            <div className="mt-1 text-xs text-muted-foreground">You can upload multiple files in one submission.</div>
            <Input
              className="mt-3"
              type="file"
              multiple
              onChange={(event) => {
                const selected = Array.from(event.target.files || []);
                if (selected.length > 0) {
                  setUploadFiles((current) => [...current, ...selected]);
                }
                event.currentTarget.value = "";
              }}
            />
          </div>

          {uploadFiles.length > 0 ? (
            <div className="rounded-xl border border-border/70 px-3 py-2 text-xs text-slate-700">
              {uploadFiles.map((file, index) => (
                <div key={`${file.name}-${index}`}>{file.name}</div>
              ))}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="destructive" onClick={() => setAddModalOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Uploading..." : "Upload files"}
            </Button>
          </div>
        </form>
      </CrmModalShell>

      <CrmModalShell
        open={Boolean(editTarget)}
        title="Edit document"
        description={editTarget ? editTarget.originalName : undefined}
        onClose={() => {
          if (!submitting) {
            setEditTarget(null);
          }
        }}
      >
        <form className="grid gap-4" onSubmit={handleUpdateDocument}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="edit-remark">Remark</FieldLabel>
              <Textarea id="edit-remark" value={editRemark} onChange={(event) => setEditRemark(event.target.value)} rows={3} />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-folder">Folder</FieldLabel>
              <Input id="edit-folder" value={editFolder} onChange={(event) => setEditFolder(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-entity-type">Association type</FieldLabel>
              <NativeSelect
                id="edit-entity-type"
                value={editEntityType}
                onChange={(event) => {
                  setEditEntityType(event.target.value as DocumentUiEntityType);
                  setEditEntityId("");
                  setEditEntityQuery("");
                  setAssociationOptions([]);
                }}
              >
                <option value="general">General</option>
                <option value="lead">Lead</option>
                <option value="deal">Deal</option>
                <option value="contact">Contact</option>
              </NativeSelect>
            </Field>
            {editEntityType !== "general" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="edit-entity-query">Search association</FieldLabel>
                  <Input id="edit-entity-query" value={editEntityQuery} onChange={(event) => setEditEntityQuery(event.target.value)} placeholder="Search by name or title" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-entity-id">Select record</FieldLabel>
                  <NativeSelect id="edit-entity-id" value={editEntityId} onChange={(event) => setEditEntityId(event.target.value)}>
                    <option value="">Choose record</option>
                    {associationOptions.map((option) => (
                      <option key={option.entityId} value={option.entityId}>
                        {option.entityLabel}{option.entitySubtitle ? ` - ${option.entitySubtitle}` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </>
            ) : null}
          </FieldGroup>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="destructive" onClick={() => setEditTarget(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </CrmModalShell>

      <CrmConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete document"
        description={deleteTarget ? `Delete ${deleteTarget.originalName}` : undefined}
        warning="This action removes the file from storage and soft-deletes metadata from the records list."
        confirmLabel="Delete"
        submitting={deleting}
        onConfirm={() => {
          void handleDeleteDocument();
        }}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
          }
        }}
      />

      <CrmConfirmDialog
        open={bulkDeleteOpen}
        title="Delete selected documents"
        description={`${selectedDocumentIds.length} document${selectedDocumentIds.length === 1 ? "" : "s"} selected.`}
        warning="This action removes all selected files from storage and marks each document as deleted."
        confirmLabel="Delete selected"
        submitting={deleting}
        onConfirm={() => {
          void handleBulkDelete();
        }}
        onCancel={() => {
          if (!deleting) {
            setBulkDeleteOpen(false);
          }
        }}
      />
    </div>
  );
}
