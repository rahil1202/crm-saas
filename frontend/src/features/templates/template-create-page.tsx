"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";

type SupportedTemplateType = "email" | "whatsapp";
type WhatsappStatus = "draft" | "approved" | "rejected" | "paused";

interface WhatsappWorkspace {
  id: string;
  name: string;
  phoneNumberId: string;
}

interface WhatsappTemplateVariable {
  key: string;
  fallback?: string;
}

const emailVariables = ["{{name}}", "{{sender_company}}", "{{receiver_company}}", "{{date}}", "{{email}}", "{{phone}}"];
const whatsappStatuses: WhatsappStatus[] = ["draft", "approved", "rejected", "paused"];

function renderWhatsappPreview(body: string, variables: WhatsappTemplateVariable[]) {
  return variables.reduce((current, variable) => {
    const key = variable.key.trim();
    if (!key) return current;
    return current.replaceAll(`{{${key}}}`, variable.fallback?.trim() || `{{${key}}}`);
  }, body);
}

function apiErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function TemplateCreatePage() {
  const router = useRouter();
  const [type, setType] = useState<SupportedTemplateType>("email");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [notes, setNotes] = useState("");
  const [workspaces, setWorkspaces] = useState<WhatsappWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [category, setCategory] = useState("marketing");
  const [language, setLanguage] = useState("en");
  const [status, setStatus] = useState<WhatsappStatus>("draft");
  const [providerTemplateId, setProviderTemplateId] = useState("");
  const [variables, setVariables] = useState<WhatsappTemplateVariable[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedType = params.get("type");
    if (requestedType === "whatsapp" || requestedType === "email") {
      setType(requestedType);
    }
  }, []);

  useEffect(() => {
    if (type !== "whatsapp") {
      return;
    }

    let disposed = false;
    const loadWorkspaces = async () => {
      try {
        const response = await apiRequest<{ items: WhatsappWorkspace[] }>("/whatsapp-workspaces", { skipCache: true });
        if (!disposed) {
          setWorkspaces(response.items);
          setWorkspaceId((current) => current || response.items[0]?.id || "");
        }
      } catch (caughtError) {
        if (!disposed) {
          setError(apiErrorMessage(caughtError, "Unable to load WhatsApp workspaces"));
        }
      }
    };

    void loadWorkspaces();
    return () => {
      disposed = true;
    };
  }, [type]);

  const canCreate = name.trim().length >= 2 && content.trim().length > 0;

  const emailPreview = useMemo(
    () => ({
      subject: subject.trim() || "No subject",
      content: content.trim() || "No body content.",
    }),
    [content, subject],
  );

  const whatsappPreview = useMemo(
    () => renderWhatsappPreview(content.trim() || "No body content.", variables),
    [content, variables],
  );

  const addVariable = () => {
    setVariables((current) => [...current, { key: "", fallback: "" }]);
  };

  const updateVariable = (index: number, patch: Partial<WhatsappTemplateVariable>) => {
    setVariables((current) => current.map((variable, currentIndex) => (currentIndex === index ? { ...variable, ...patch } : variable)));
  };

  const removeVariable = (index: number) => {
    setVariables((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate) {
      return;
    }

    setWorking(true);
    setError(null);
    try {
      if (type === "email") {
        await apiRequest("/templates", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            type: "email",
            subject: subject.trim() || undefined,
            content: content.trim(),
            notes: notes.trim() || undefined,
          }),
        });
      } else {
        await apiRequest("/whatsapp-templates", {
          method: "POST",
          body: JSON.stringify({
            workspaceId: workspaceId || undefined,
            name: name.trim(),
            category: category.trim() || undefined,
            language: language.trim() || "en",
            status,
            body: content.trim(),
            variables: variables.filter((variable) => variable.key.trim()).map((variable) => ({
              key: variable.key.trim(),
              ...(variable.fallback?.trim() ? { fallback: variable.fallback.trim() } : {}),
            })),
            providerTemplateId: providerTemplateId.trim() || undefined,
          }),
        });
      }
      toast.success("Template created");
      router.push("/dashboard/templates");
    } catch (requestError) {
      const message = apiErrorMessage(requestError, "Unable to create template");
      setError(message);
      toast.error(message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <form className="grid gap-5" onSubmit={handleCreate}>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[1.25rem] border border-border/60 bg-white px-5 py-4 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.18)]">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/templates">
            <Button type="button" variant="outline" size="sm">
              <ArrowLeft className="size-4" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-[1.7rem] font-semibold tracking-[-0.03em] text-slate-900">Create Template</h1>
            <p className="mt-1 text-sm text-muted-foreground">Create an email template or a local WhatsApp Cloud API template record.</p>
          </div>
        </div>
        <Button type="submit" size="sm" disabled={working || !canCreate}>
          {working ? "Creating..." : "Create Template"}
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Template create failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-5 rounded-[1.6rem] border border-border/70 bg-white p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel>Template Type</FieldLabel>
            <NativeSelect value={type} onChange={(event) => setType(event.target.value as SupportedTemplateType)}>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>Template Name</FieldLabel>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={type === "email" ? "Welcome email" : "order_update"} required />
          </Field>
        </div>

        {type === "email" ? (
          <>
            <div className="flex flex-wrap gap-2">
              {emailVariables.map((token) => (
                <Button key={token} type="button" variant="outline" size="sm" onClick={() => setContent((current) => `${current}${current ? " " : ""}${token}`)}>
                  {token}
                </Button>
              ))}
            </div>
            <Field>
              <FieldLabel>Subject</FieldLabel>
              <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Welcome to our service" />
            </Field>
            <Field>
              <FieldLabel>Email Body</FieldLabel>
              <Textarea value={content} onChange={(event) => setContent(event.target.value)} className="min-h-72" required />
            </Field>
            <Field>
              <FieldLabel>Notes</FieldLabel>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-24" />
            </Field>
          </>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel>Workspace</FieldLabel>
                <NativeSelect value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
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
                <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="marketing" />
              </Field>
              <Field>
                <FieldLabel>Language</FieldLabel>
                <Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="en" />
              </Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <NativeSelect value={status} onChange={(event) => setStatus(event.target.value as WhatsappStatus)}>
                  {whatsappStatuses.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel>Provider Template ID</FieldLabel>
                <Input value={providerTemplateId} onChange={(event) => setProviderTemplateId(event.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel>Body</FieldLabel>
              <Textarea value={content} onChange={(event) => setContent(event.target.value)} className="min-h-48" required />
              <FieldDescription>Use variables like {"{{name}}"} and add matching variable keys below.</FieldDescription>
            </Field>
            <div className="grid gap-3 rounded-2xl border border-border/60 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900">Variables</div>
                <Button type="button" variant="outline" size="sm" onClick={addVariable}>
                  <Plus className="size-4" /> Add Variable
                </Button>
              </div>
              {variables.length === 0 ? <div className="text-sm text-muted-foreground">No variables configured.</div> : null}
              {variables.map((variable, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <Input value={variable.key} onChange={(event) => updateVariable(index, { key: event.target.value })} placeholder="name" />
                  <Input value={variable.fallback ?? ""} onChange={(event) => updateVariable(index, { fallback: event.target.value })} placeholder="Fallback value" />
                  <Button type="button" variant="ghost" className="text-rose-600 hover:text-rose-700" onClick={() => removeVariable(index)}>
                    <X className="size-4" /> Remove
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="grid gap-2 rounded-2xl border border-border/60 bg-slate-50/70 p-4 text-sm">
          <div className="font-semibold text-slate-900">Preview</div>
          {type === "email" ? (
            <>
              <div className="font-semibold text-slate-900">Subject: {emailPreview.subject}</div>
              <div className="whitespace-pre-wrap text-slate-700">{emailPreview.content}</div>
            </>
          ) : (
            <div className="whitespace-pre-wrap text-slate-700">{whatsappPreview}</div>
          )}
        </div>
      </section>
    </form>
  );
}
