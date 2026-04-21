import { toCsvCell } from "@/components/crm/csv-export";
import type { DocumentEntityType, DocumentItem } from "@/features/documents/types";

export function formatDocumentFileSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDocumentEntityType(value: DocumentEntityType) {
  if (value === "customer") {
    return "Contact";
  }
  if (value === "general") {
    return "General";
  }
  return value === "lead" ? "Lead" : "Deal";
}

export function formatDocumentAssociation(document: DocumentItem) {
  const typeLabel = formatDocumentEntityType(document.entityType);
  const main = document.entityLabel ?? (document.entityType === "general" ? "Unlinked" : "Unknown");
  const subtitle = document.entitySubtitle?.trim();
  return subtitle ? `${typeLabel} / ${main} (${subtitle})` : `${typeLabel} / ${main}`;
}

export function isPdfMimeType(mimeType: string | null | undefined) {
  return (mimeType ?? "").toLowerCase() === "application/pdf";
}

export function isWordMimeType(mimeType: string | null | undefined) {
  const normalized = (mimeType ?? "").toLowerCase();
  return normalized === "application/msword" || normalized === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export function isPreviewableDocumentMimeType(mimeType: string | null | undefined) {
  return isPdfMimeType(mimeType) || isWordMimeType(mimeType);
}

export function buildDocumentsCsv(items: DocumentItem[]) {
  return [
    ["file_name", "remark", "associated_type", "associated_label", "associated_subtitle", "uploaded_by", "mime_type", "size_bytes", "created_at", "updated_at"],
    ...items.map((document) => [
      document.originalName,
      document.remark ?? "",
      document.entityType,
      document.entityLabel ?? "",
      document.entitySubtitle ?? "",
      document.uploadedByName ?? "",
      document.mimeType ?? "",
      String(document.sizeBytes),
      document.createdAt,
      document.updatedAt,
    ]),
  ]
    .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
    .join("\n");
}
