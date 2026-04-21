export type DocumentEntityType = "general" | "lead" | "deal" | "customer";
export type DocumentUiEntityType = "general" | "lead" | "deal" | "contact";

export interface DocumentItem {
  id: string;
  entityType: DocumentEntityType;
  entityId: string | null;
  folder: string;
  originalName: string;
  remark: string | null;
  entityLabel: string | null;
  entitySubtitle: string | null;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  storageProvider?: string;
  storageBucket?: string;
  storageObjectPath?: string;
}

export interface DocumentListResponse {
  items: DocumentItem[];
  total: number;
  limit?: number;
  offset?: number;
}

export interface DocumentUploadResponse {
  items: DocumentItem[];
  createdCount: number;
}

export interface DocumentAssociationOption {
  entityType: "lead" | "deal" | "customer";
  entityId: string;
  entityLabel: string;
  entitySubtitle: string | null;
}

export interface DocumentAssociationOptionListResponse {
  items: DocumentAssociationOption[];
}

export function toApiDocumentEntityType(value: DocumentUiEntityType): DocumentEntityType {
  if (value === "contact") {
    return "customer";
  }
  return value;
}

export function toUiDocumentEntityType(value: DocumentEntityType): DocumentUiEntityType {
  if (value === "customer") {
    return "contact";
  }
  return value;
}
