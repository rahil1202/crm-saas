"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Globe, GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { FormDefinition, FormFieldDefinition, FormResponseSettings, FormThemeSettings } from "@/features/forms/types";

type BuilderStep = 1 | 2 | 3;
const fieldTypeOptions: Array<FormFieldDefinition["type"]> = ["text", "email", "phone", "textarea", "select", "radio", "checkbox", "url"];
const nameRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const hexRegex = /^#[0-9a-fA-F]{6}$/;

function createField(index: number): FormFieldDefinition {
  return { id: crypto.randomUUID(), type: "text", name: `field_${index + 1}`, label: `Field ${index + 1}`, placeholder: "", helpText: "", required: false, width: "full", options: [] };
}

const defaultTheme: FormThemeSettings = { heading: "Reach out to us", subheading: "Get in touch for help and information.", submitButtonText: "Submit", primaryColor: "#0ea5e9", backgroundColor: "#ffffff" };
const defaultResponse: FormResponseSettings = { mode: "message", messageTitle: "Thank you", messageBody: "Your response has been submitted successfully.", captchaEnabled: true };

export default function FormBuilderPage() {
  const searchParams = useSearchParams();
  const formId = searchParams.get("formId");
  const [step, setStep] = useState<BuilderStep>(1);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdForm, setCreatedForm] = useState<FormDefinition | null>(null);
  const [basic, setBasic] = useState({ name: "", websiteDomain: "", description: "" });
  const [fields, setFields] = useState<FormFieldDefinition[]>([createField(0)]);
  const [theme, setTheme] = useState<FormThemeSettings>(defaultTheme);
  const [responseSettings, setResponseSettings] = useState<FormResponseSettings>(defaultResponse);
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    if (!formId) return;
    setLoading(true);
    void apiRequest<FormDefinition>(`/forms/${formId}`)
      .then((form) => {
        setCreatedForm(form);
        setBasic({ name: form.name, websiteDomain: form.websiteDomain ?? "", description: form.description ?? "" });
        setFields(form.schema.length ? form.schema : [createField(0)]);
        setTheme(form.themeSettings);
        setResponseSettings(form.responseSettings);
      })
      .catch((caughtError) => setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load form for editing."))
      .finally(() => setLoading(false));
  }, [formId]);

  const validationErrors = useMemo(() => {
    const issues: string[] = [];
    if (!basic.name.trim()) issues.push("Form name is required.");
    if (basic.websiteDomain.trim() && !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(basic.websiteDomain.trim().replace(/^https?:\/\//, ""))) issues.push("Website domain is invalid.");
    if (fields.length === 0) issues.push("At least one field is required.");
    if (!hexRegex.test(theme.primaryColor)) issues.push("Primary color must be a full hex code.");
    if (!hexRegex.test(theme.backgroundColor)) issues.push("Background color must be a full hex code.");

    const names = new Set<string>();
    for (const field of fields) {
      if (!field.label.trim()) issues.push(`Label is required for ${field.name || field.id}.`);
      if (!field.name.trim()) issues.push("Field name cannot be empty.");
      if (field.name.trim() && !nameRegex.test(field.name.trim())) issues.push(`Field name ${field.name} must match letters, numbers, underscores and start with a letter.`);
      const normalized = field.name.trim().toLowerCase();
      if (normalized && names.has(normalized)) issues.push(`Field name ${field.name} is duplicated.`);
      names.add(normalized);
      if ((field.type === "select" || field.type === "radio") && (!field.options || field.options.length === 0)) issues.push(`Field ${field.name} requires options.`);
    }
    return issues;
  }, [basic.name, basic.websiteDomain, fields, theme.backgroundColor, theme.primaryColor]);

  const canContinue = useMemo(() => (step === 1 ? basic.name.trim().length > 0 : step === 2 ? fields.length > 0 : true), [basic.name, fields.length, step]);

  const saveForm = async () => {
    if (validationErrors.length > 0) {
      setError(validationErrors[0]);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: basic.name,
        websiteDomain: basic.websiteDomain,
        description: basic.description,
        schema: fields,
        themeSettings: theme,
        responseSettings,
      };
      const form = createdForm
        ? await apiRequest<FormDefinition>(`/forms/${createdForm.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await apiRequest<FormDefinition>("/forms", { method: "POST", body: JSON.stringify(payload) });
      setCreatedForm(form);
      toast.success(createdForm ? "Form updated." : "Form saved.");
      setStep(3);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to save form.");
    } finally {
      setSaving(false);
    }
  };

  const publishToggle = async (target: "publish" | "unpublish") => {
    if (!createdForm) return;
    setSaving(true);
    try {
      const updated = await apiRequest<FormDefinition>(`/forms/${createdForm.id}/${target}`, { method: "POST", body: JSON.stringify({}) });
      setCreatedForm(updated);
      toast.success(target === "publish" ? "Form published." : "Form unpublished.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading form...</div>;

  return (
    <div className="grid gap-6">
      {error ? <Alert variant="destructive"><AlertTitle>Form builder error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="flex items-center justify-between gap-4">
        <Link href="/dashboard/forms" className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}><ArrowLeft className="size-4" />Back</Link>
        <div className="flex items-center gap-2">{[1, 2, 3].map((value) => <Badge key={value} variant={step === value ? "default" : "outline"}>{`Step ${value}`}</Badge>)}</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card>
          <CardHeader><CardTitle>Form Details</CardTitle><CardDescription>Configure form details, theme, and response.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <Field><FieldLabel>Form name</FieldLabel><Input value={basic.name} onChange={(event) => setBasic((current) => ({ ...current, name: event.target.value }))} /></Field>
            <Field><FieldLabel>Website domain</FieldLabel><Input value={basic.websiteDomain} onChange={(event) => setBasic((current) => ({ ...current, websiteDomain: event.target.value }))} placeholder="example.com" /><FieldDescription>Domain-only format recommended.</FieldDescription></Field>
            <Field><FieldLabel>Internal purpose</FieldLabel><Textarea value={basic.description} rows={3} onChange={(event) => setBasic((current) => ({ ...current, description: event.target.value }))} /></Field>
            <Field><FieldLabel>Heading</FieldLabel><Input value={theme.heading} onChange={(event) => setTheme((current) => ({ ...current, heading: event.target.value }))} /></Field>
            <Field><FieldLabel>Subheading</FieldLabel><Textarea rows={3} value={theme.subheading} onChange={(event) => setTheme((current) => ({ ...current, subheading: event.target.value }))} /></Field>
            <Field><FieldLabel>Submit button text</FieldLabel><Input value={theme.submitButtonText} onChange={(event) => setTheme((current) => ({ ...current, submitButtonText: event.target.value }))} /></Field>
            <FieldGroup className="grid-cols-2">
              <Field><FieldLabel>Primary color</FieldLabel><div className="flex gap-2"><Input type="color" value={theme.primaryColor} onChange={(event) => setTheme((current) => ({ ...current, primaryColor: event.target.value }))} className="h-10 w-14 p-1" /><Input value={theme.primaryColor} onChange={(event) => setTheme((current) => ({ ...current, primaryColor: event.target.value }))} /></div></Field>
              <Field><FieldLabel>Background color</FieldLabel><div className="flex gap-2"><Input type="color" value={theme.backgroundColor} onChange={(event) => setTheme((current) => ({ ...current, backgroundColor: event.target.value }))} className="h-10 w-14 p-1" /><Input value={theme.backgroundColor} onChange={(event) => setTheme((current) => ({ ...current, backgroundColor: event.target.value }))} /></div></Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {step <= 2 ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div><CardTitle>Step {step}</CardTitle><CardDescription>Build fields with drag-and-drop ordering.</CardDescription></div>
                <Button type="button" variant="outline" onClick={() => setFields((current) => [...current, createField(current.length)])}><Plus className="size-4" />Add field</Button>
              </CardHeader>
              <CardContent className="grid gap-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid gap-4 rounded-2xl border border-slate-200 p-4" draggable onDragStart={() => setDragId(field.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => {
                    if (!dragId || dragId === field.id) return;
                    const sourceIndex = fields.findIndex((f) => f.id === dragId);
                    const targetIndex = fields.findIndex((f) => f.id === field.id);
                    if (sourceIndex < 0 || targetIndex < 0) return;
                    const next = [...fields];
                    const [moved] = next.splice(sourceIndex, 1);
                    next.splice(targetIndex, 0, moved);
                    setFields(next);
                    setDragId(null);
                  }}>
                    <div className="flex items-center justify-between"><div className="flex items-center gap-2 font-medium text-slate-900"><GripVertical className="size-4 text-slate-500" />{field.label || `Field ${index + 1}`}</div><Button type="button" variant="ghost" size="sm" disabled={fields.length === 1} onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))}><Trash2 className="size-4" /></Button></div>
                    <FieldGroup className="grid-cols-2">
                      <Field><FieldLabel>Field type</FieldLabel><NativeSelect value={field.type} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, type: event.target.value as FormFieldDefinition["type"] } : item))}>{fieldTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</NativeSelect></Field>
                      <Field><FieldLabel>Width</FieldLabel><NativeSelect value={field.width ?? "full"} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, width: event.target.value as "full" | "half" } : item))}><option value="full">Full</option><option value="half">Half</option></NativeSelect></Field>
                    </FieldGroup>
                    <FieldGroup className="grid-cols-2"><Field><FieldLabel>Field name</FieldLabel><Input value={field.name} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, name: event.target.value } : item))} /></Field><Field><FieldLabel>Label</FieldLabel><Input value={field.label} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, label: event.target.value } : item))} /></Field></FieldGroup>
                    <FieldGroup className="grid-cols-2"><Field><FieldLabel>Placeholder</FieldLabel><Input value={field.placeholder ?? ""} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, placeholder: event.target.value } : item))} /></Field><Field><FieldLabel>Help text</FieldLabel><Input value={field.helpText ?? ""} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, helpText: event.target.value } : item))} /></Field></FieldGroup>
                    {field.type === "select" || field.type === "radio" ? <Field><FieldLabel>Options</FieldLabel><Input value={(field.options ?? []).join(", ")} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, options: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) } : item))} placeholder="Option 1, Option 2" /></Field> : null}
                    <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={field.required} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, required: event.target.checked } : item))} />Required</label>
                  </div>
                ))}
                <div className="flex justify-between"><Button type="button" variant="outline" onClick={() => setStep((current) => (current === 1 ? 1 : 1))}><ArrowLeft className="size-4" />Back</Button><Button type="button" disabled={!canContinue || saving} onClick={step === 1 ? () => setStep(2) : saveForm}>{step === 1 ? "Next" : saving ? "Saving..." : "Save and continue"}<ArrowRight className="size-4" /></Button></div>
              </CardContent>
            </Card>
          ) : null}

          {step === 3 ? <Card><CardHeader><CardTitle>Step 3</CardTitle><CardDescription>Publish and share this form.</CardDescription></CardHeader><CardContent className="grid gap-4"><Field><FieldLabel>Live link</FieldLabel><div className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm"><Globe className="size-4 text-slate-500" /><span className="truncate">{createdForm?.publicUrl ?? "Form link will appear after save."}</span></div></Field><Field><FieldLabel>Embed snippet</FieldLabel><Textarea value={createdForm?.embedSnippet ?? ""} readOnly rows={4} /></Field><div className="flex flex-wrap gap-2"><Button type="button" disabled={!createdForm || saving || createdForm.status === "published"} onClick={() => void publishToggle("publish")}>Publish</Button><Button type="button" variant="outline" disabled={!createdForm || saving || createdForm.status !== "published"} onClick={() => void publishToggle("unpublish")}>Unpublish</Button>{createdForm ? <Link href={`/dashboard/forms/${createdForm.id}`} className={cn(buttonVariants({ variant: "outline" }))}>Open form detail</Link> : null}</div></CardContent></Card> : null}

          <Card>
            <CardHeader><CardTitle>Live Preview</CardTitle><CardDescription>Preview matches the hosted structure while editing.</CardDescription></CardHeader>
            <CardContent><HostedFormPreview name={basic.name} theme={theme} fields={fields} responseSettings={responseSettings} /></CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function HostedFormPreview({ name, theme, fields, responseSettings }: { name: string; theme: FormThemeSettings; fields: FormFieldDefinition[]; responseSettings: FormResponseSettings; values?: Record<string, string | boolean> }) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8" style={{ backgroundColor: theme.backgroundColor }}>
      <div className="mb-8 grid gap-2">
        <h2 className="text-4xl font-semibold tracking-[-0.04em] text-slate-900">{theme.heading || name || "Untitled form"}</h2>
        <p className="text-lg text-slate-500">{theme.subheading}</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {fields.map((field) => (
          <div key={field.id} className={field.width === "full" ? "md:col-span-2" : ""}>
            <label className="mb-2 block text-sm font-medium text-slate-700">{field.label}{field.required ? " *" : ""}</label>
            {field.type === "textarea" ? <textarea className="min-h-40 w-full rounded-none border border-slate-300 px-4 py-3 text-lg" placeholder={field.placeholder} readOnly /> : field.type === "select" ? <select className="h-12 w-full rounded-none border border-slate-300 px-4 text-lg" disabled><option value="">{field.placeholder || "Select an option"}</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select> : field.type === "radio" ? <div className="flex flex-wrap gap-4 rounded-none border border-slate-300 px-4 py-3">{(field.options ?? []).map((option) => <label key={option} className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" disabled />{option}</label>)}</div> : field.type === "checkbox" ? <label className="flex h-12 items-center gap-2 rounded-none border border-slate-300 px-4 text-sm text-slate-700"><input type="checkbox" disabled />{field.helpText || field.label}</label> : <input type={field.type === "phone" ? "tel" : field.type} className="h-12 w-full rounded-none border border-slate-300 px-4 text-lg" placeholder={field.placeholder} readOnly />}
            {field.helpText ? <p className="mt-2 text-xs text-slate-500">{field.helpText}</p> : null}
          </div>
        ))}
      </div>
      <Button type="button" className="mt-5 h-12 w-full text-lg" style={{ backgroundColor: theme.primaryColor }}>{theme.submitButtonText}</Button>
      <p className="mt-3 text-center text-xs text-slate-500">{responseSettings.messageTitle}: {responseSettings.messageBody}</p>
    </div>
  );
}
