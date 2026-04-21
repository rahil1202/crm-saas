"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ApiError, apiRequest, buildApiUrl } from "@/lib/api";
import { getCompanyCookie } from "@/lib/cookies";
import {
  formatDocumentAssociation,
  formatDocumentFileSize,
  isPdfMimeType,
  isPreviewableDocumentMimeType,
  isWordMimeType,
} from "@/features/documents/helpers";
import type { DocumentItem } from "@/features/documents/types";

export default function DocumentFilePage() {
  const params = useParams<{ documentId: string }>();
  const companyId = getCompanyCookie();
  const documentId = params.documentId;

  const [item, setItem] = useState<DocumentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDocument() {
      setLoading(true);
      setError(null);
      try {
        const response = await apiRequest<DocumentItem>(`/documents/${documentId}`, { skipCache: true });
        if (active) {
          setItem(response);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof ApiError ? requestError.message : "Unable to load document");
          setItem(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDocument();

    return () => {
      active = false;
    };
  }, [documentId]);

  const openUrl = useMemo(() => buildApiUrl(`/documents/${documentId}/open`, { companyId }), [companyId, documentId]);
  const downloadUrl = useMemo(() => buildApiUrl(`/documents/${documentId}/download`, { companyId }), [companyId, documentId]);

  if (loading) {
    return <div className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground">Loading document...</div>;
  }

  if (error || !item) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Document unavailable</AlertTitle>
        <AlertDescription>{error ?? "Document was not found."}</AlertDescription>
      </Alert>
    );
  }

  const previewable = isPreviewableDocumentMimeType(item.mimeType);
  const pdf = isPdfMimeType(item.mimeType);
  const word = isWordMimeType(item.mimeType);

  return (
    <div className="grid gap-4">
      <div className="rounded-[1.25rem] border border-border/60 bg-white px-5 py-4 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.18)]">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div className="grid gap-1">
            <h1 className="text-[1.45rem] font-semibold tracking-[-0.02em] text-slate-900">{item.originalName}</h1>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{item.folder}</Badge>
              <span>{formatDocumentFileSize(item.sizeBytes)}</span>
              <span>{item.mimeType ?? "Unknown type"}</span>
              <span>{formatDocumentAssociation(item)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/documents" className={buttonVariants({ variant: "outline" })}>Back to documents</Link>
            <a href={openUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>Open</a>
            <a href={downloadUrl} className={buttonVariants()}>Download</a>
          </div>
        </div>
      </div>

      {previewable ? (
        <div className="overflow-hidden rounded-[1.25rem] border border-border/60 bg-white shadow-[0_18px_38px_-30px_rgba(15,23,42,0.18)]">
          {word ? (
            <div className="border-b border-border/60 bg-slate-50 px-4 py-3 text-xs text-muted-foreground">
              Word preview is browser-dependent. If preview does not load, use Open or Download.
            </div>
          ) : null}
          <iframe
            src={openUrl}
            className="h-[72vh] w-full"
            title="Document preview"
          />
        </div>
      ) : (
        <div className="rounded-[1.25rem] border border-border/60 bg-white p-6 text-sm text-muted-foreground shadow-[0_18px_38px_-30px_rgba(15,23,42,0.18)]">
          {pdf ? "" : "This file type is not previewable in-browser."} Use Download to open it locally.
        </div>
      )}
    </div>
  );
}
