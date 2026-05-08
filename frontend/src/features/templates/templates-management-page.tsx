"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Edit3, Plus, RefreshCw, RotateCcw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CrmModalShell } from "@/components/crm/crm-list-primitives";
import { ApiError, apiRequest } from "@/lib/api";

type TemplateTab = "email" | "whatsapp";
type WhatsappStatus = "draft" | "approved" | "rejected" | "paused";

interface EmailTemplate {
  id: string;
  name: string;
  type: "email" | "whatsapp" | "sms" | "task" | "pipeline";
  subject: string | null;
  content: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

interface WhatsappTemplateVariable {
  key: string;
  fallback?: string;
}

interface WhatsappTemplate {
  id: string;
  workspaceId: string | null;
  name: string;
  category: string | null;
  language: string;
  status: WhatsappStatus;
  body: string;
  variables: WhatsappTemplateVariable[];
  providerTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WhatsappWorkspace {
  id: string;
  name: string;
  phoneNumberId: string;
  isActive: boolean;
}

type EmailDraft = {
  id: string | null;
  name: string;
  subject: string;
  content: string;
  notes: string;
};

type WhatsappDraft = {
  id: string | null;
  workspaceId: string;
  name: string;
  category: string;
  language: string;
  status: WhatsappStatus;
  body: string;
  variables: WhatsappTemplateVariable[];
  providerTemplateId: string;
};

const emailVariables = ["{{name}}", "{{sender_company}}", "{{receiver_company}}", "{{date}}", "{{email}}", "{{phone}}"];
const whatsappStatuses: WhatsappStatus[] = ["draft", "approved", "rejected", "paused"];
const emptyEmailDraft: EmailDraft = { id: null, name: "", subject: "", content: "", notes: "" };
const emptyWhatsappDraft: WhatsappDraft = {
  id: null,
  workspaceId: "",
  name: "",
  category: "marketing",
  language: "en",
  status: "draft",
  body: "",
  variables: [],
  providerTemplateId: "",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function emailDraftFromTemplate(template: EmailTemplate): EmailDraft {
  return {
    id: template.id,
    name: template.name,
    subject: template.subject ?? "",
    content: template.content,
    notes: template.notes ?? "",
  };
}

function whatsappDraftFromTemplate(template: WhatsappTemplate): WhatsappDraft {
  return {
    id: template.id,
    workspaceId: template.workspaceId ?? "",
    name: template.name,
    category: template.category ?? "",
    language: template.language,
    status: template.status,
    body: template.body,
    variables: template.variables ?? [],
    providerTemplateId: template.providerTemplateId ?? "",
  };
}

function renderWhatsappPreview(body: string, variables: WhatsappTemplateVariable[]) {
  return variables.reduce((current, variable) => {
    const key = variable.key.trim();
    if (!key) return current;
    const replacement = variable.fallback?.trim() || `{{${key}}}`;
    return current.replaceAll(`{{${key}}}`, replacement);
  }, body);
}

function apiErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function TemplatesManagementPage() {
  const [tab, setTab] = useState<TemplateTab>("email");
  const [q, setQ] = useState("");
  const [emailLifecycle, setEmailLifecycle] = useState<"active" | "deleted">("active");
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsappTemplate[]>([]);
  const [workspaces, setWorkspaces] = useState<WhatsappWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailEditorOpen, setEmailEditorOpen] = useState(false);
  const [whatsappEditorOpen, setWhatsappEditorOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState<EmailDraft>(emptyEmailDraft);
  const [whatsappDraft, setWhatsappDraft] = useState<WhatsappDraft>(emptyWhatsappDraft);
  const [working, setWorking] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    | { type: "delete-email" | "permanent-email" | "delete-whatsapp"; id: string; label: string }
    | null
  >(null);

  const loadEmailTemplates = useCallback(async () => {
    const params = new URLSearchParams({ type: "email", lifecycle: emailLifecycle, limit: "100", offset: "0" });
    if (q.trim()) params.set("q", q.trim());
    const response = await apiRequest<{ items: EmailTemplate[] }>(`/templates/list?${params.toString()}`, { skipCache: true });
    setEmailTemplates(response.items);
  }, [emailLifecycle, q]);

  const loadWhatsappTemplates = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    const response = await apiRequest<{ items: WhatsappTemplate[] }>(`/whatsapp-templates${params.toString() ? `?${params.toString()}` : ""}`, {
      skipCache: true,
    });
    setWhatsappTemplates(response.items);
  }, [q]);

  const loadWorkspaces = useCallback(async () => {
    const response = await apiRequest<{ items: WhatsappWorkspace[] }>("/whatsapp-workspaces", { skipCache: true });
    setWorkspaces(response.items);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "email") {
        await loadEmailTemplates();
      } else {
        await Promise.all([loadWhatsappTemplates(), loadWorkspaces()]);
      }
    } catch (caughtError) {
      setError(apiErrorMessage(caughtError, "Unable to load templates"));
    } finally {
      setLoading(false);
    }
  }, [loadEmailTemplates, loadWhatsappTemplates, loadWorkspaces, tab]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 160);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const selectedWorkspaceName = useCallback(
    (workspaceId: string | null) => workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? "-",
    [workspaces],
  );

  const activeRows = tab === "email" ? emailTemplates : whatsappTemplates;
  const title = tab === "email" ? "Email Templates" : "WhatsApp Templates";

  const openNewEmail = () => {
    setEmailDraft(emptyEmailDraft);
    setEmailEditorOpen(true);
  };

  const openNewWhatsapp = () => {
    setWhatsappDraft({ ...emptyWhatsappDraft, workspaceId: workspaces[0]?.id ?? "" });
    setWhatsappEditorOpen(true);
  };

  const saveEmailTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!emailDraft.name.trim() || !emailDraft.content.trim()) return;
    setWorking(true);
    setError(null);
    try {
      const payload = {
        name: emailDraft.name.trim(),
        type: "email",
        subject: emailDraft.subject.trim() || undefined,
        content: emailDraft.content.trim(),
        notes: emailDraft.notes.trim() || undefined,
      };
      if (emailDraft.id) {
        await apiRequest(`/templates/${emailDraft.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast.success("Email template updated");
      } else {
        await apiRequest("/templates", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Email template created");
      }
      setEmailEditorOpen(false);
      await loadEmailTemplates();
    } catch (caughtError) {
      const message = apiErrorMessage(caughtError, "Unable to save email template");
      setError(message);
      toast.error(message);
    } finally {
      setWorking(false);
    }
  };

  const saveWhatsappTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!whatsappDraft.name.trim() || !whatsappDraft.body.trim()) return;
    setWorking(true);
    setError(null);
    try {
      const payload = {
        workspaceId: whatsappDraft.workspaceId || undefined,
        name: whatsappDraft.name.trim(),
        category: whatsappDraft.category.trim() || undefined,
        language: whatsappDraft.language.trim() || "en",
        status: whatsappDraft.status,
        body: whatsappDraft.body.trim(),
        variables: whatsappDraft.variables.filter((variable) => variable.key.trim()).map((variable) => ({
          key: variable.key.trim(),
          ...(variable.fallback?.trim() ? { fallback: variable.fallback.trim() } : {}),
        })),
        providerTemplateId: whatsappDraft.providerTemplateId.trim() || undefined,
      };
      if (whatsappDraft.id) {
        await apiRequest(`/whatsapp-templates/${whatsappDraft.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast.success("WhatsApp template updated");
      } else {
        await apiRequest("/whatsapp-templates", { method: "POST", body: JSON.stringify(payload) });
        toast.success("WhatsApp template created");
      }
      setWhatsappEditorOpen(false);
      await loadWhatsappTemplates();
    } catch (caughtError) {
      const message = apiErrorMessage(caughtError, "Unable to save WhatsApp template");
      setError(message);
      toast.error(message);
    } finally {
      setWorking(false);
    }
  };

  const restoreEmailTemplate = async (templateId: string) => {
    setError(null);
    try {
      await apiRequest(`/templates/${templateId}/restore`, { method: "POST", body: JSON.stringify({}) });
      toast.success("Email template restored");
      await loadEmailTemplates();
    } catch (caughtError) {
      const message = apiErrorMessage(caughtError, "Unable to restore email template");
      setError(message);
      toast.error(message);
    }
  };

  const syncWhatsappTemplate = async (template: WhatsappTemplate) => {
    setError(null);
    try {
      await apiRequest(`/whatsapp-templates/${template.id}/sync`, {
        method: "POST",
        body: JSON.stringify({ status: template.status, providerTemplateId: template.providerTemplateId ?? undefined }),
      });
      toast.success("WhatsApp template sync fields saved");
      await loadWhatsappTemplates();
    } catch (caughtError) {
      const message = apiErrorMessage(caughtError, "Unable to sync WhatsApp template");
      setError(message);
      toast.error(message);
    }
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    setWorking(true);
    setError(null);
    try {
      if (confirmAction.type === "delete-email") {
        await apiRequest(`/templates/${confirmAction.id}`, { method: "DELETE", body: JSON.stringify({}) });
        toast.success("Email template moved to trash");
        await loadEmailTemplates();
      }
      if (confirmAction.type === "permanent-email") {
        await apiRequest(`/templates/${confirmAction.id}/permanent`, { method: "DELETE" });
        toast.success("Email template deleted permanently");
        await loadEmailTemplates();
      }
      if (confirmAction.type === "delete-whatsapp") {
        await apiRequest(`/whatsapp-templates/${confirmAction.id}`, { method: "DELETE" });
        toast.success("WhatsApp template deleted");
        await loadWhatsappTemplates();
      }
      setConfirmAction(null);
    } catch (caughtError) {
      const message = apiErrorMessage(caughtError, "Unable to complete template action");
      setError(message);
      toast.error(message);
    } finally {
      setWorking(false);
    }
  };

  const updateWhatsappVariable = (index: number, patch: Partial<WhatsappTemplateVariable>) => {
    setWhatsappDraft((current) => ({
      ...current,
      variables: current.variables.map((variable, currentIndex) => (currentIndex === index ? { ...variable, ...patch } : variable)),
    }));
  };

  const addWhatsappVariable = () => {
    setWhatsappDraft((current) => ({ ...current, variables: [...current.variables, { key: "", fallback: "" }] }));
  };

  const removeWhatsappVariable = (index: number) => {
    setWhatsappDraft((current) => ({ ...current, variables: current.variables.filter((_, currentIndex) => currentIndex !== index) }));
  };

  const emailPreview = useMemo(
    () => ({
      subject: emailDraft.subject.trim() || "No subject",
      content: emailDraft.content.trim() || "No body content.",
    }),
    [emailDraft.content, emailDraft.subject],
  );

  const whatsappPreview = useMemo(
    () => renderWhatsappPreview(whatsappDraft.body.trim() || "No body content.", whatsappDraft.variables),
    [whatsappDraft.body, whatsappDraft.variables],
  );

  return (
    <div className="grid gap-5">
      <div className="grid max-w-full min-w-0 gap-3 rounded-[1.25rem] border border-border/60 bg-white px-5 py-4 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.18)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <h1 className="text-[1.7rem] font-semibold tracking-[-0.03em] text-slate-900">Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage reusable email messages and local WhatsApp Cloud API template records.</p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadData()}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
          <Link href={`/dashboard/templates/new?type=${tab}`}>
            <Button type="button" size="sm">
              <Plus className="size-4" /> New Template
            </Button>
          </Link>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Template request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-white shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
        <div className="border-b border-border/60 px-4 pt-3">
          <Tabs value={tab} onValueChange={(next) => setTab(next as TemplateTab)}>
            <TabsList variant="line" className="border-b border-border/60 p-0">
              <TabsTrigger value="email" className="rounded-none px-4 py-3 text-sm">
                Email
              </TabsTrigger>
              <TabsTrigger value="whatsapp" className="rounded-none px-4 py-3 text-sm">
                WhatsApp
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid gap-3 border-b border-border/60 bg-slate-50/45 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={`Search ${title.toLowerCase()}`}
              className="h-11 rounded-2xl border-border/70 bg-white pl-10 text-sm shadow-sm"
            />
          </div>
          {tab === "email" ? (
            <NativeSelect
              value={emailLifecycle}
              onChange={(event) => setEmailLifecycle(event.target.value as "active" | "deleted")}
              className="h-11 min-w-[150px] rounded-2xl border-border/70 bg-white"
            >
              <option value="active">Active</option>
              <option value="deleted">Deleted</option>
            </NativeSelect>
          ) : null}
          <Button type="button" size="sm" onClick={tab === "email" ? openNewEmail : openNewWhatsapp}>
            <Plus className="size-4" /> Create
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead className="bg-slate-50/90">
              <tr className="text-left">
                <th className="border-b border-border/60 px-4 py-3.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Name</th>
                {tab === "email" ? (
                  <>
                    <th className="border-b border-border/60 px-4 py-3.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Subject</th>
                    <th className="border-b border-border/60 px-4 py-3.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Updated</th>
                  </>
                ) : (
                  <>
                    <th className="border-b border-border/60 px-4 py-3.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace</th>
                    <th className="border-b border-border/60 px-4 py-3.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</th>
                    <th className="border-b border-border/60 px-4 py-3.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Language</th>
                  </>
                )}
                <th className="border-b border-border/60 px-4 py-3.5 text-right text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-20 text-center text-sm text-muted-foreground">
                    Loading templates...
                  </td>
                </tr>
              ) : activeRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-20 text-center text-sm text-muted-foreground">
                    No {title.toLowerCase()} found.
                  </td>
                </tr>
              ) : tab === "email" ? (
                emailTemplates.map((template) => (
                  <tr key={template.id} className="text-sm hover:bg-slate-50/75">
                    <td className="border-b border-border/50 px-4 py-3.5 font-medium text-slate-900">{template.name}</td>
                    <td className="border-b border-border/50 px-4 py-3.5 text-slate-600">{template.subject || "-"}</td>
                    <td className="border-b border-border/50 px-4 py-3.5 text-slate-600">{formatDateTime(template.updatedAt)}</td>
                    <td className="border-b border-border/50 px-4 py-3.5">
                      <div className="flex flex-wrap justify-end gap-2">
                        {emailLifecycle === "deleted" ? (
                          <>
                            <Button type="button" variant="outline" size="xs" onClick={() => void restoreEmailTemplate(template.id)}>
                              <RotateCcw className="size-3.5" /> Restore
                            </Button>
                            <Button type="button" variant="ghost" size="xs" className="text-rose-600 hover:text-rose-700" onClick={() => setConfirmAction({ type: "permanent-email", id: template.id, label: template.name })}>
                              Delete permanently
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button type="button" variant="outline" size="xs" onClick={() => { setEmailDraft(emailDraftFromTemplate(template)); setEmailEditorOpen(true); }}>
                              <Edit3 className="size-3.5" /> Edit
                            </Button>
                            <Button type="button" variant="ghost" size="xs" className="text-rose-600 hover:text-rose-700" onClick={() => setConfirmAction({ type: "delete-email", id: template.id, label: template.name })}>
                              <Trash2 className="size-3.5" /> Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                whatsappTemplates.map((template) => (
                  <tr key={template.id} className="text-sm hover:bg-slate-50/75">
                    <td className="border-b border-border/50 px-4 py-3.5">
                      <div className="font-medium text-slate-900">{template.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{template.category || "No category"} {template.providerTemplateId ? `- ${template.providerTemplateId}` : ""}</div>
                    </td>
                    <td className="border-b border-border/50 px-4 py-3.5 text-slate-600">{selectedWorkspaceName(template.workspaceId)}</td>
                    <td className="border-b border-border/50 px-4 py-3.5">
                      <Badge variant={template.status === "approved" ? "secondary" : template.status === "rejected" ? "destructive" : "outline"} className="capitalize">
                        {template.status}
                      </Badge>
                    </td>
                    <td className="border-b border-border/50 px-4 py-3.5 text-slate-600">{template.language}</td>
                    <td className="border-b border-border/50 px-4 py-3.5">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" size="xs" onClick={() => { setWhatsappDraft(whatsappDraftFromTemplate(template)); setWhatsappEditorOpen(true); }}>
                          <Edit3 className="size-3.5" /> Edit
                        </Button>
                        <Button type="button" variant="outline" size="xs" onClick={() => void syncWhatsappTemplate(template)}>
                          <CheckCircle2 className="size-3.5" /> Sync
                        </Button>
                        <Button type="button" variant="ghost" size="xs" className="text-rose-600 hover:text-rose-700" onClick={() => setConfirmAction({ type: "delete-whatsapp", id: template.id, label: template.name })}>
                          <Trash2 className="size-3.5" /> Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <CrmModalShell
        open={emailEditorOpen}
        title={emailDraft.id ? "Edit Email Template" : "Create Email Template"}
        description="Email templates use a subject, plain body content, and optional notes."
        onClose={() => !working && setEmailEditorOpen(false)}
        maxWidthClassName="max-w-4xl"
      >
        <form className="grid gap-5" onSubmit={saveEmailTemplate}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input value={emailDraft.name} onChange={(event) => setEmailDraft((current) => ({ ...current, name: event.target.value }))} required />
            </Field>
            <Field>
              <FieldLabel>Subject</FieldLabel>
              <Input value={emailDraft.subject} onChange={(event) => setEmailDraft((current) => ({ ...current, subject: event.target.value }))} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {emailVariables.map((token) => (
              <Button key={token} type="button" variant="outline" size="sm" onClick={() => setEmailDraft((current) => ({ ...current, content: `${current.content}${current.content ? " " : ""}${token}` }))}>
                {token}
              </Button>
            ))}
          </div>
          <Field>
            <FieldLabel>Body</FieldLabel>
            <Textarea value={emailDraft.content} onChange={(event) => setEmailDraft((current) => ({ ...current, content: event.target.value }))} className="min-h-56" required />
          </Field>
          <Field>
            <FieldLabel>Notes</FieldLabel>
            <Textarea value={emailDraft.notes} onChange={(event) => setEmailDraft((current) => ({ ...current, notes: event.target.value }))} className="min-h-24" />
          </Field>
          <div className="grid gap-2 rounded-2xl border border-border/60 bg-slate-50/70 p-4 text-sm">
            <div className="font-semibold text-slate-900">Subject: {emailPreview.subject}</div>
            <div className="whitespace-pre-wrap text-slate-700">{emailPreview.content}</div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEmailEditorOpen(false)} disabled={working}>
              Cancel
            </Button>
            <Button type="submit" disabled={working || !emailDraft.name.trim() || !emailDraft.content.trim()}>
              {working ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </form>
      </CrmModalShell>

      <CrmModalShell
        open={whatsappEditorOpen}
        title={whatsappDraft.id ? "Edit WhatsApp Template" : "Create WhatsApp Template"}
        description="Local WhatsApp template records track Meta status and provider IDs without submitting to Meta."
        onClose={() => !working && setWhatsappEditorOpen(false)}
        maxWidthClassName="max-w-5xl"
      >
        <form className="grid gap-5" onSubmit={saveWhatsappTemplate}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input value={whatsappDraft.name} onChange={(event) => setWhatsappDraft((current) => ({ ...current, name: event.target.value }))} required />
              <FieldDescription>Use the Meta template name, such as order_update.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Workspace</FieldLabel>
              <NativeSelect value={whatsappDraft.workspaceId} onChange={(event) => setWhatsappDraft((current) => ({ ...current, workspaceId: event.target.value }))}>
                <option value="">No workspace</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} ({workspace.phoneNumberId})
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Category</FieldLabel>
              <Input value={whatsappDraft.category} onChange={(event) => setWhatsappDraft((current) => ({ ...current, category: event.target.value }))} placeholder="marketing" />
            </Field>
            <Field>
              <FieldLabel>Language</FieldLabel>
              <Input value={whatsappDraft.language} onChange={(event) => setWhatsappDraft((current) => ({ ...current, language: event.target.value }))} placeholder="en" />
            </Field>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <NativeSelect value={whatsappDraft.status} onChange={(event) => setWhatsappDraft((current) => ({ ...current, status: event.target.value as WhatsappStatus }))}>
                {whatsappStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Provider Template ID</FieldLabel>
              <Input value={whatsappDraft.providerTemplateId} onChange={(event) => setWhatsappDraft((current) => ({ ...current, providerTemplateId: event.target.value }))} />
            </Field>
          </div>
          <Field>
            <FieldLabel>Body</FieldLabel>
            <Textarea value={whatsappDraft.body} onChange={(event) => setWhatsappDraft((current) => ({ ...current, body: event.target.value }))} className="min-h-44" required />
          </Field>
          <div className="grid gap-3 rounded-2xl border border-border/60 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-900">Variables</div>
                <p className="mt-1 text-sm text-muted-foreground">Fallback values are used in the local preview.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addWhatsappVariable}>
                <Plus className="size-4" /> Add Variable
              </Button>
            </div>
            {whatsappDraft.variables.length === 0 ? <div className="text-sm text-muted-foreground">No variables configured.</div> : null}
            {whatsappDraft.variables.map((variable, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <Input value={variable.key} onChange={(event) => updateWhatsappVariable(index, { key: event.target.value })} placeholder="name" />
                <Input value={variable.fallback ?? ""} onChange={(event) => updateWhatsappVariable(index, { fallback: event.target.value })} placeholder="Fallback value" />
                <Button type="button" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => removeWhatsappVariable(index)}>
                  <X className="size-4" /> Remove
                </Button>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-border/60 bg-slate-50/70 p-4 text-sm">
            <div className="mb-2 font-semibold text-slate-900">Preview</div>
            <div className="whitespace-pre-wrap text-slate-700">{whatsappPreview}</div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setWhatsappEditorOpen(false)} disabled={working}>
              Cancel
            </Button>
            <Button type="submit" disabled={working || !whatsappDraft.name.trim() || !whatsappDraft.body.trim()}>
              {working ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </form>
      </CrmModalShell>

      <CrmModalShell
        open={Boolean(confirmAction)}
        title={confirmAction?.type === "permanent-email" ? "Delete Permanently" : "Delete Template"}
        description={confirmAction ? `${confirmAction.label} will be ${confirmAction.type === "delete-email" ? "moved to trash" : "deleted"}.` : undefined}
        onClose={() => !working && setConfirmAction(null)}
        maxWidthClassName="max-w-xl"
      >
        <div className="grid gap-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {confirmAction?.type === "delete-email" ? "You can restore this email template from the deleted filter." : "This action cannot be undone from this screen."}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmAction(null)} disabled={working}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void runConfirmedAction()} disabled={working}>
              {working ? "Working..." : "Confirm"}
            </Button>
          </div>
        </div>
      </CrmModalShell>
    </div>
  );
}
