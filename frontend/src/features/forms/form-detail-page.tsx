"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, apiRequest } from "@/lib/api";
import { HostedFormPreview } from "@/features/forms/form-builder-page";
import type { FormDetailResponse, FormResponseListResponse } from "@/features/forms/types";
import { cn } from "@/lib/utils";
import { CrmConfirmDialog } from "@/components/crm/crm-list-primitives";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function FormDetailPage() {
  const params = useParams<{ formId: string }>();
  const [form, setForm] = useState<FormDetailResponse | null>(null);
  const [responses, setResponses] = useState<FormResponseListResponse["items"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!params.formId) return;
    setLoading(true);
    setError(null);
    try {
      const [formData, responseData] = await Promise.all([
        apiRequest<FormDetailResponse>(`/forms/${params.formId}`),
        apiRequest<FormResponseListResponse>(`/forms/${params.formId}/responses?limit=50&offset=0`),
      ]);
      setForm(formData);
      setResponses(responseData.items);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load form detail.");
    } finally {
      setLoading(false);
    }
  }, [params.formId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => form?.stats ?? { submissions: 0, lastSubmissionAt: null, conversions: 0 }, [form]);

  const handleArchiveToggle = useCallback(async () => {
    if (!form) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiRequest(`/forms/${form.id}/${form.status === "archived" ? "unarchive" : "archive"}`, { method: "POST", body: JSON.stringify({}) });
      toast.success(form.status === "archived" ? "Form moved to draft." : "Form archived.");
      await load();
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to update form status.");
    } finally {
      setActionLoading(false);
    }
  }, [form, load]);

  const handleDelete = useCallback(async () => {
    if (!form) return;
    setActionLoading(true);
    setError(null);
    try {
      await apiRequest(`/forms/${form.id}`, { method: "DELETE" });
      toast.success("Form moved to trash.");
      window.location.href = "/dashboard/forms";
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to move form to trash.");
    } finally {
      setActionLoading(false);
      setDeleteOpen(false);
    }
  }, [form]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading form detail...</div>;
  }

  if (error || !form) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Form detail error</AlertTitle>
        <AlertDescription>{error ?? "Form not found."}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle>{form.name}</CardTitle>
              <Badge variant={form.status === "published" ? "default" : "secondary"}>{form.status}</Badge>
            </div>
            <CardDescription>{form.description || "No internal description added."}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={actionLoading} onClick={() => void handleArchiveToggle()}>
                {form.status === "archived" ? "Unarchive" : "Archive"}
              </Button>
              <Button type="button" variant="destructive" disabled={actionLoading} onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            </div>
            <div className="grid gap-2 text-sm text-slate-700">
              <div><span className="font-medium">Domain:</span> {form.websiteDomain ?? "—"}</div>
              <div><span className="font-medium">Created:</span> {formatDate(form.createdAt)}</div>
              <div><span className="font-medium">Updated:</span> {formatDate(form.updatedAt)}</div>
            </div>
            <div className="grid gap-3 rounded-2xl border border-slate-200 p-4">
              <div className="text-sm font-medium text-slate-900">Live link</div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="max-w-full truncate rounded bg-slate-100 px-2 py-1 text-xs">{form.publicUrl}</code>
                <Button type="button" variant="outline" size="sm" onClick={async () => { await navigator.clipboard.writeText(form.publicUrl); toast.success("Live link copied."); }}>
                  <Copy className="size-4" />
                  Copy
                </Button>
                <Link href={form.publicUrl} target="_blank" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                  <ExternalLink className="size-4" />
                  Open
                </Link>
              </div>
              <div className="text-sm font-medium text-slate-900">Embed snippet</div>
              <textarea className="min-h-24 rounded-xl border border-slate-200 p-3 text-xs" value={form.embedSnippet} readOnly />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card size="sm">
            <CardHeader>
              <CardDescription>Total responses</CardDescription>
              <CardTitle className="text-3xl">{summary.submissions}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Lead conversions</CardDescription>
              <CardTitle className="text-3xl">{summary.conversions}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Last response</CardDescription>
              <CardTitle className="text-base">{formatDate(summary.lastSubmissionAt)}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="responses" className="grid gap-4">
        <TabsList>
          <TabsTrigger value="responses">Responses</TabsTrigger>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="responses">
          <Card>
            <CardHeader>
              <CardTitle>Responses</CardTitle>
              <CardDescription>Every submission is preserved here even after the linked lead changes.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {responses.map((response) => (
                <div key={response.id} className="grid gap-2 rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-medium text-slate-900">{response.fullName || response.email || "Anonymous response"}</div>
                    <div className="text-xs text-slate-500">{formatDate(response.submittedAt)}</div>
                  </div>
                  <div className="text-sm text-slate-600">{response.email || "No email"} {response.phone ? `• ${response.phone}` : ""}</div>
                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                    <pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(response.payload, null, 2)}</pre>
                  </div>
                </div>
              ))}
              {responses.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-muted-foreground">No responses submitted yet.</div> : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="builder">
          <Card>
            <CardHeader>
              <CardTitle>Builder configuration</CardTitle>
              <CardDescription>Current saved fields and response behavior.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {form.schema.map((field) => (
                <div key={field.id} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">{field.label}</div>
                  <div>{field.type} • {field.name} • {field.required ? "required" : "optional"}</div>
                  {field.options?.length ? <div>Options: {field.options.join(", ")}</div> : null}
                </div>
              ))}
              <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                <div className="font-medium text-slate-900">Thank-you response</div>
                <div>{form.responseSettings.messageTitle}</div>
                <div>{form.responseSettings.messageBody}</div>
                <div className="mt-2">CAPTCHA: {form.responseSettings.captchaEnabled ? "enabled" : "disabled"}</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="preview">
          <Card>
            <CardHeader>
              <CardTitle>Hosted preview</CardTitle>
              <CardDescription>Rendered with the same schema and theme used by the public hosted page.</CardDescription>
            </CardHeader>
            <CardContent>
              <HostedFormPreview name={form.name} theme={form.themeSettings} fields={form.schema} responseSettings={form.responseSettings} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CrmConfirmDialog
        open={deleteOpen}
        title="Move Form To Trash"
        description={form ? `${form.name} will be removed from active records.` : undefined}
        warning="This moves the form to the deleted view. You can restore it later from the forms list."
        confirmLabel="Move to trash"
        submitting={actionLoading}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (!actionLoading) {
            setDeleteOpen(false);
          }
        }}
      />
    </div>
  );
}
