"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { buildApiUrl, ApiError, apiRequest } from "@/lib/api";
import { getCompanyCookie } from "@/lib/cookies";

type DocumentEntityType = "general" | "lead" | "deal" | "customer";

interface DocumentItem {
  id: string;
  entityType: DocumentEntityType;
  entityId: string | null;
  folder: string;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
}

interface DocumentListResponse {
  items: DocumentItem[];
  total: number;
}

function formatFileSize(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("");
  const [folder, setFolder] = useState("general");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const companyId = getCompanyCookie();

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (folderFilter.trim()) {
      params.set("folder", folderFilter.trim());
    }
    if (entityTypeFilter) {
      params.set("entityType", entityTypeFilter);
    }

    try {
      const data = await apiRequest<DocumentListResponse>(`/documents/list?${params.toString()}`);
      setItems(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load files");
    } finally {
      setLoading(false);
    }
  }, [entityTypeFilter, folderFilter, query]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) {
      setError("Select a file to upload");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("entityType", "general");
      formData.set("folder", folder);

      await apiRequest("/documents/upload", {
        method: "POST",
        body: formData,
      });

      setFile(null);
      setFolder("general");
      const input = document.getElementById("document-upload-input") as HTMLInputElement | null;
      if (input) {
        input.value = "";
      }
      await loadDocuments();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    setDeletingId(documentId);
    setError(null);

    try {
      await apiRequest(`/documents/${documentId}`, {
        method: "DELETE",
      });
      await loadDocuments();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to delete file");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppShell
      title="Files and documents"
      description="Search uploaded files, manage shared folders, and keep lead and deal attachments in one company-scoped index."
    >
      <div className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Documents request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <CardHeader>
              <CardTitle>Upload shared file</CardTitle>
              <CardDescription>General files are stored under the selected folder and remain searchable from this index.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={handleUpload}>
                <Field>
                  <FieldLabel htmlFor="document-folder">Folder</FieldLabel>
                  <Input id="document-folder" value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="general" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="document-upload-input">File</FieldLabel>
                  <Input id="document-upload-input" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                </Field>
                <Button type="submit" disabled={uploading}>
                  {uploading ? "Uploading..." : "Upload file"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>File search</CardTitle>
              <CardDescription>Search by filename, narrow by folder, or filter to a specific attachment type.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
                <Field>
                  <FieldLabel htmlFor="document-search">Search</FieldLabel>
                  <Input id="document-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="proposal, boq, contract..." />
                </Field>
                <Field>
                  <FieldLabel htmlFor="document-folder-filter">Folder</FieldLabel>
                  <Input id="document-folder-filter" value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)} placeholder="general" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="document-entity-filter">Entity</FieldLabel>
                  <select
                    id="document-entity-filter"
                    value={entityTypeFilter}
                    onChange={(event) => setEntityTypeFilter(event.target.value)}
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    <option value="">All types</option>
                    <option value="general">general</option>
                    <option value="lead">lead</option>
                    <option value="deal">deal</option>
                    <option value="customer">customer</option>
                  </select>
                </Field>
                <div className="flex items-end">
                  <Button type="button" variant="outline" onClick={() => void loadDocuments()}>
                    Apply
                  </Button>
                </div>
              </div>

              {loading ? <div className="text-sm text-muted-foreground">Loading files...</div> : null}

              {!loading ? (
                <div className="grid gap-3">
                  {items.map((item) => (
                    <div key={item.id} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{item.originalName}</span>
                          <Badge variant="outline">{item.folder}</Badge>
                          <Badge variant="secondary">{item.entityType}</Badge>
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {formatFileSize(item.sizeBytes)} • {item.mimeType ?? "unknown type"} • {new Date(item.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <a
                        href={buildApiUrl(`/documents/${item.id}/download`, { companyId })}
                        className="text-sm font-medium underline underline-offset-4"
                      >
                        Download
                      </a>
                      <Button type="button" variant="outline" disabled={deletingId === item.id} onClick={() => void handleDelete(item.id)}>
                        {deletingId === item.id ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  ))}

                  {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                      No files found for the current filter.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
