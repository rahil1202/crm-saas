"use client";

import { Trash2 } from "lucide-react";

import { CrmDataTable } from "@/components/crm/crm-list-primitives";
import type { ColumnDefinition } from "@/components/crm/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDocumentFileSize } from "@/features/documents/helpers";
import type { DocumentItem } from "@/features/documents/types";
import { buildApiUrl } from "@/lib/api";

export type RelatedDocumentColumnKey = "name" | "folder" | "type" | "size" | "createdAt";

export const relatedDocumentColumns = [
  { key: "name", label: "File Name" },
  { key: "folder", label: "Folder" },
  { key: "type", label: "Type" },
  { key: "size", label: "Size" },
  { key: "createdAt", label: "Uploaded" },
] as const;

export function createRelatedDocumentTableColumns(formatDateTime: (value: string) => string): Array<ColumnDefinition<DocumentItem, RelatedDocumentColumnKey>> {
  return [
    {
      key: "name",
      label: "File Name",
      widthClassName: "min-w-[280px]",
      renderCell: (document) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">{document.originalName}</div>
          <div className="mt-1 text-xs text-muted-foreground">{document.entityId ? document.entityId.slice(0, 8) : "Unlinked"}</div>
        </div>
      ),
    },
    { key: "folder", label: "Folder", renderCell: (document) => <span className="text-slate-600">{document.folder}</span> },
    {
      key: "type",
      label: "Type",
      renderCell: (document) => (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{document.entityType}</Badge>
          {document.mimeType ? <Badge variant="secondary">{document.mimeType}</Badge> : null}
        </div>
      ),
    },
    { key: "size", label: "Size", renderCell: (document) => <span className="text-slate-600">{formatDocumentFileSize(document.sizeBytes)}</span> },
    { key: "createdAt", label: "Uploaded", renderCell: (document) => <span className="text-slate-600">{formatDateTime(document.createdAt)}</span> },
  ];
}

export function RelatedDocumentsTable({
  columns,
  rows,
  loading,
  columnVisibility,
  companyId,
  deletingId,
  onDelete,
}: {
  columns: Array<ColumnDefinition<DocumentItem, RelatedDocumentColumnKey>>;
  rows: DocumentItem[];
  loading: boolean;
  columnVisibility: Record<RelatedDocumentColumnKey, boolean>;
  companyId: string | null;
  deletingId: string | null;
  onDelete: (documentId: string) => Promise<void>;
}) {
  return (
    <CrmDataTable
      columns={columns}
      rows={rows}
      rowKey={(document) => document.id}
      loading={loading}
      emptyLabel="No uploaded docs found."
      columnVisibility={columnVisibility}
      actionColumn={{
        header: "Actions",
        renderCell: (document) => (
          <div className="flex justify-end gap-1.5">
            <a
              href={buildApiUrl(`/documents/${document.id}/download`, { companyId })}
              className="inline-flex items-center rounded-xl border border-border/60 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Download
            </a>
            <Button type="button" size="xs" variant="ghost" disabled={deletingId === document.id} onClick={() => void onDelete(document.id)}>
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </div>
        ),
      }}
    />
  );
}
