"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, RefreshCw, Send, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageSection } from "@/components/ui/page-patterns";
import { ApiError, apiRequest } from "@/lib/api";
import { formatRelativeTime } from "@/features/whatsapp-crm/format";

interface Template {
  id: string;
  workspaceId: string | null;
  name: string;
  category: string | null;
  language: string;
  status: "draft" | "approved" | "rejected" | "paused";
  body: string;
  variables: Array<{ key: string; fallback?: string }>;
  providerTemplateId: string | null;
  rejectionReason: string | null;
  qualityScore: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  approved: CheckCircle2,
  rejected: XCircle,
  draft: Clock,
  paused: Clock,
};

export function WhatsappTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [testDraft, setTestDraft] = useState({ templateName: "", language: "en", to: "" });
  const [testSending, setTestSending] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      const payload = await apiRequest<{ items: Template[] }>(`/whatsapp-templates?${params.toString()}`, { skipCache: true });
      setTemplates(payload.items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load templates.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const syncTemplates = async () => {
    setSyncing(true);
    try {
      const result = await apiRequest<{ syncedCount: number }>("/whatsapp-templates/sync", {
        method: "POST",
        body: JSON.stringify({ fullSync: true }),
      });
      toast.success(`Synced ${result.syncedCount} templates from Meta.`);
      await loadTemplates();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to sync templates.");
    } finally {
      setSyncing(false);
    }
  };

  const testSend = async () => {
    if (!testDraft.templateName || !testDraft.to) {
      toast.error("Template name and phone number are required.");
      return;
    }
    setTestSending(true);
    try {
      await apiRequest("/whatsapp/templates/test-send", {
        method: "POST",
        body: JSON.stringify(testDraft),
      });
      toast.success("Test message queued.");
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to send test.");
    } finally {
      setTestSending(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-dashed border-border/80 bg-white/45 px-4 py-3 text-sm text-muted-foreground">Loading templates…</div>;
  }

  const approved = templates.filter((t) => t.status === "approved").length;
  const rejected = templates.filter((t) => t.status === "rejected").length;

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <PageSection
        title="WhatsApp Templates"
        description={`${templates.length} templates total. ${approved} approved, ${rejected} rejected.`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <NativeSelect value={filter} onChange={(e) => setFilter(e.target.value)} className="h-9">
            <option value="">All statuses</option>
            <option value="approved">Approved</option>
            <option value="draft">Draft</option>
            <option value="rejected">Rejected</option>
            <option value="paused">Paused</option>
          </NativeSelect>
          <Button variant="outline" size="sm" onClick={() => void syncTemplates()} disabled={syncing}>
            <RefreshCw className="mr-1.5 size-3.5" />
            {syncing ? "Syncing…" : "Sync from Meta"}
          </Button>
        </div>
      </PageSection>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const Icon = STATUS_ICONS[template.status] ?? Clock;
          return (
            <Card key={template.id} className="border-border/70 bg-card/95">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-sm">{template.name}</CardTitle>
                    <CardDescription>{template.language} · {template.category ?? "utility"}</CardDescription>
                  </div>
                  <Badge
                    variant={template.status === "approved" ? "secondary" : template.status === "rejected" ? "destructive" : "outline"}
                  >
                    <Icon className="mr-1 size-3" />
                    {template.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2">
                <div className="rounded-lg border border-border/60 bg-white/70 p-2 text-xs text-slate-700 whitespace-pre-wrap line-clamp-4">
                  {template.body}
                </div>
                {template.variables.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {template.variables.map((v) => (
                      <Badge key={v.key} variant="outline" className="text-[0.62rem]">
                        {`{{${v.key}}}`}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {template.rejectionReason ? (
                  <div className="text-xs text-destructive">Rejection: {template.rejectionReason}</div>
                ) : null}
                <div className="flex items-center justify-between text-[0.68rem] text-muted-foreground">
                  <span>Quality: {template.qualityScore ?? "—"}</span>
                  <span>Synced {formatRelativeTime(template.lastSyncedAt)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <PageSection title="Test send" description="Send a template message to a test number to verify rendering.">
        <Card className="border-border/70 bg-card/95">
          <CardContent className="grid gap-4 pt-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel>Template name</FieldLabel>
                <NativeSelect value={testDraft.templateName} onChange={(e) => setTestDraft({ ...testDraft, templateName: e.target.value })}>
                  <option value="">Select template</option>
                  {templates.filter((t) => t.status === "approved").map((t) => (
                    <option key={t.id} value={t.name}>{t.name} ({t.language})</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Language</FieldLabel>
                <Input value={testDraft.language} onChange={(e) => setTestDraft({ ...testDraft, language: e.target.value })} placeholder="en" />
              </Field>
              <Field>
                <FieldLabel>Send to (E.164)</FieldLabel>
                <Input value={testDraft.to} onChange={(e) => setTestDraft({ ...testDraft, to: e.target.value })} placeholder="+15551234567" />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => void testSend()} disabled={testSending}>
                <Send className="mr-1.5 size-3.5" />
                {testSending ? "Sending…" : "Send test"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageSection>
    </div>
  );
}
