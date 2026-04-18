"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Globe, Plus, Trash2 } from "lucide-react";
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

function createField(index: number): FormFieldDefinition {
  return {
    id: crypto.randomUUID(),
    type: "text",
    name: `field_${index + 1}`,
    label: `Field ${index + 1}`,
    placeholder: "",
    helpText: "",
    required: false,
    width: "full",
    options: [],
  };
}

const defaultTheme: FormThemeSettings = {
  heading: "Reach out to us",
  subheading: "Get in touch for help and information.",
  submitButtonText: "Submit",
  primaryColor: "#0ea5e9",
  backgroundColor: "#ffffff",
};

const defaultResponse: FormResponseSettings = {
  mode: "message",
  messageTitle: "Thank you",
  messageBody: "Your response has been submitted successfully.",
  captchaEnabled: true,
};

export default function FormBuilderPage() {
  const [step, setStep] = useState<BuilderStep>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdForm, setCreatedForm] = useState<FormDefinition | null>(null);
  const [basic, setBasic] = useState({
    name: "",
    websiteDomain: "",
    description: "",
  });
  const [fields, setFields] = useState<FormFieldDefinition[]>([
    { id: crypto.randomUUID(), type: "text", name: "full_name", label: "Full Name", placeholder: "Eg: John", helpText: "", required: true, width: "half", options: [] },
    { id: crypto.randomUUID(), type: "email", name: "email", label: "Email", placeholder: "Eg: john@example.com", helpText: "", required: true, width: "half", options: [] },
    { id: crypto.randomUUID(), type: "phone", name: "phone", label: "Phone", placeholder: "Enter your phone", helpText: "", required: false, width: "half", options: [] },
    { id: crypto.randomUUID(), type: "textarea", name: "message", label: "Message", placeholder: "Enter your message", helpText: "", required: true, width: "full", options: [] },
  ]);
  const [theme, setTheme] = useState<FormThemeSettings>(defaultTheme);
  const [responseSettings, setResponseSettings] = useState<FormResponseSettings>(defaultResponse);

  const canContinue = useMemo(() => {
    if (step === 1) return basic.name.trim().length > 0;
    if (step === 2) return fields.length > 0 && fields.every((field) => field.name.trim() && field.label.trim());
    return true;
  }, [basic.name, fields, step]);

  const saveForm = async () => {
    setSaving(true);
    setError(null);
    try {
      const form = await apiRequest<FormDefinition>("/forms", {
        method: "POST",
        body: JSON.stringify({
          name: basic.name,
          websiteDomain: basic.websiteDomain,
          description: basic.description,
          schema: fields,
          themeSettings: theme,
          responseSettings,
        }),
      });
      setCreatedForm(form);
      toast.success("Form saved.");
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
    setError(null);
    try {
      const updated = await apiRequest<FormDefinition>(`/forms/${createdForm.id}/${target}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setCreatedForm(updated);
      toast.success(target === "publish" ? "Form published." : "Form unpublished.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to update form status.");
    } finally {
      setSaving(false);
    }
  };

  const previewValues = Object.fromEntries(fields.map((field) => [field.name, field.type === "checkbox" ? false : ""]));

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Form builder error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <Link href="/dashboard/forms" className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}>
          <ArrowLeft className="size-4" />
          Back
        </Link>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((value) => (
            <Badge key={value} variant={step === value ? "default" : "outline"}>{`Step ${value}`}</Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Form Details</CardTitle>
            <CardDescription>Set up the basics before publishing your hosted or embedded form.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="form-name">Form name</FieldLabel>
                <Input id="form-name" value={basic.name} onChange={(event) => setBasic((current) => ({ ...current, name: event.target.value }))} placeholder="Product demo request" />
              </Field>
              <Field>
                <FieldLabel htmlFor="website-domain">Website domain</FieldLabel>
                <Input id="website-domain" value={basic.websiteDomain} onChange={(event) => setBasic((current) => ({ ...current, websiteDomain: event.target.value }))} placeholder="example.com" />
                <FieldDescription>Used for attribution and initial embed-domain validation.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="form-description">Internal purpose</FieldLabel>
                <Textarea id="form-description" value={basic.description} onChange={(event) => setBasic((current) => ({ ...current, description: event.target.value }))} placeholder="Collect qualified leads from the website." rows={4} />
              </Field>
            </FieldGroup>

            {step >= 2 ? (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="form-heading">Heading</FieldLabel>
                  <Input id="form-heading" value={theme.heading} onChange={(event) => setTheme((current) => ({ ...current, heading: event.target.value }))} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="form-subheading">Subheading</FieldLabel>
                  <Textarea id="form-subheading" value={theme.subheading} onChange={(event) => setTheme((current) => ({ ...current, subheading: event.target.value }))} rows={3} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="submit-button-text">Submit button text</FieldLabel>
                  <Input id="submit-button-text" value={theme.submitButtonText} onChange={(event) => setTheme((current) => ({ ...current, submitButtonText: event.target.value }))} />
                </Field>
                <FieldGroup className="grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="primary-color">Primary color</FieldLabel>
                    <Input id="primary-color" value={theme.primaryColor} onChange={(event) => setTheme((current) => ({ ...current, primaryColor: event.target.value }))} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="background-color">Background color</FieldLabel>
                    <Input id="background-color" value={theme.backgroundColor} onChange={(event) => setTheme((current) => ({ ...current, backgroundColor: event.target.value }))} />
                  </Field>
                </FieldGroup>
                <Field>
                  <FieldLabel htmlFor="thank-you-title">Thank-you title</FieldLabel>
                  <Input id="thank-you-title" value={responseSettings.messageTitle} onChange={(event) => setResponseSettings((current) => ({ ...current, messageTitle: event.target.value }))} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="thank-you-body">Thank-you message</FieldLabel>
                  <Textarea id="thank-you-body" value={responseSettings.messageBody} onChange={(event) => setResponseSettings((current) => ({ ...current, messageBody: event.target.value }))} rows={4} />
                </Field>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={responseSettings.captchaEnabled} onChange={(event) => setResponseSettings((current) => ({ ...current, captchaEnabled: event.target.checked }))} />
                  CAPTCHA enabled by default
                </label>
              </FieldGroup>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {step === 1 ? (
            <Card>
              <CardHeader>
                <CardTitle>Step 1</CardTitle>
                <CardDescription>Name the form and set website attribution before you add fields.</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-end">
                <Button type="button" disabled={!canContinue} onClick={() => setStep(2)}>
                  Next
                  <ArrowRight className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {step === 2 ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Step 2</CardTitle>
                  <CardDescription>Define the form fields and submission response.</CardDescription>
                </div>
                <Button type="button" variant="outline" onClick={() => setFields((current) => [...current, createField(current.length)])}>
                  <Plus className="size-4" />
                  Add field
                </Button>
              </CardHeader>
              <CardContent className="grid gap-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid gap-4 rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-slate-900">{field.label || `Field ${index + 1}`}</div>
                      <Button type="button" variant="ghost" size="sm" disabled={fields.length === 1} onClick={() => setFields((current) => current.filter((item) => item.id !== field.id))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <FieldGroup className="grid-cols-2">
                      <Field>
                        <FieldLabel>Field type</FieldLabel>
                        <NativeSelect value={field.type} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, type: event.target.value as FormFieldDefinition["type"] } : item))}>
                          {fieldTypeOptions.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field>
                        <FieldLabel>Width</FieldLabel>
                        <NativeSelect value={field.width ?? "full"} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, width: event.target.value as "full" | "half" } : item))}>
                          <option value="full">Full</option>
                          <option value="half">Half</option>
                        </NativeSelect>
                      </Field>
                    </FieldGroup>
                    <FieldGroup className="grid-cols-2">
                      <Field>
                        <FieldLabel>Field name</FieldLabel>
                        <Input value={field.name} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, name: event.target.value } : item))} />
                      </Field>
                      <Field>
                        <FieldLabel>Label</FieldLabel>
                        <Input value={field.label} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, label: event.target.value } : item))} />
                      </Field>
                    </FieldGroup>
                    <FieldGroup className="grid-cols-2">
                      <Field>
                        <FieldLabel>Placeholder</FieldLabel>
                        <Input value={field.placeholder ?? ""} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, placeholder: event.target.value } : item))} />
                      </Field>
                      <Field>
                        <FieldLabel>Help text</FieldLabel>
                        <Input value={field.helpText ?? ""} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, helpText: event.target.value } : item))} />
                      </Field>
                    </FieldGroup>
                    {field.type === "select" || field.type === "radio" ? (
                      <Field>
                        <FieldLabel>Options</FieldLabel>
                        <Input value={(field.options ?? []).join(", ")} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, options: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) } : item))} placeholder="Option 1, Option 2" />
                      </Field>
                    ) : null}
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={field.required} onChange={(event) => setFields((current) => current.map((item) => item.id === field.id ? { ...item, required: event.target.checked } : item))} />
                      Required
                    </label>
                  </div>
                ))}
                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>
                    <ArrowLeft className="size-4" />
                    Back
                  </Button>
                  <Button type="button" disabled={!canContinue || saving} onClick={saveForm}>
                    {saving ? "Saving..." : "Save and continue"}
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Step 3</CardTitle>
                  <CardDescription>Publish the form, grab the live link, and embed it on any website with the iframe snippet.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <Field>
                    <FieldLabel>Live link</FieldLabel>
                    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                      <Globe className="size-4 text-slate-500" />
                      <span className="truncate">{createdForm?.publicUrl ?? "Form link will appear after save."}</span>
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel>Embed snippet</FieldLabel>
                    <Textarea value={createdForm?.embedSnippet ?? ""} readOnly rows={4} />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={!createdForm || saving || createdForm.status === "published"} onClick={() => void publishToggle("publish")}>
                      {saving && createdForm?.status !== "published" ? "Working..." : "Publish"}
                    </Button>
                    <Button type="button" variant="outline" disabled={!createdForm || saving || createdForm.status !== "published"} onClick={() => void publishToggle("unpublish")}>
                      Unpublish
                    </Button>
                    {createdForm ? (
                      <Link href={`/dashboard/forms/${createdForm.id}`} className={cn(buttonVariants({ variant: "outline" }))}>Open form detail</Link>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>Preview the live structure that will be shown on your hosted or embedded form.</CardDescription>
                </CardHeader>
                <CardContent>
                  <HostedFormPreview name={basic.name} theme={theme} fields={fields} responseSettings={responseSettings} values={previewValues} />
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function HostedFormPreview({
  name,
  theme,
  fields,
  responseSettings,
}: {
  name: string;
  theme: FormThemeSettings;
  fields: FormFieldDefinition[];
  responseSettings: FormResponseSettings;
  values?: Record<string, string | boolean>;
}) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 p-6" style={{ backgroundColor: theme.backgroundColor }}>
      <div className="mb-6 grid gap-2">
        <h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900">{theme.heading || name || "Untitled form"}</h2>
        <p className="text-sm text-slate-500">{theme.subheading}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <div key={field.id} className={field.width === "full" ? "md:col-span-2" : ""}>
            <label className="mb-2 block text-sm font-medium text-slate-700">{field.label}{field.required ? " *" : ""}</label>
            {field.type === "textarea" ? (
              <textarea className="min-h-32 w-full rounded-xl border border-slate-300 px-4 py-3" placeholder={field.placeholder} readOnly />
            ) : field.type === "select" ? (
              <select className="h-12 w-full rounded-xl border border-slate-300 px-4" disabled>
                <option>{field.placeholder || "Select an option"}</option>
                {(field.options ?? []).map((option) => <option key={option}>{option}</option>)}
              </select>
            ) : field.type === "radio" ? (
              <div className="flex flex-wrap gap-4 rounded-xl border border-slate-300 px-4 py-3">
                {(field.options ?? []).map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" disabled />{option}</label>
                ))}
              </div>
            ) : field.type === "checkbox" ? (
              <label className="flex h-12 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm text-slate-700"><input type="checkbox" disabled />{field.helpText || field.label}</label>
            ) : (
              <input className="h-12 w-full rounded-xl border border-slate-300 px-4" placeholder={field.placeholder} readOnly />
            )}
            {field.helpText ? <p className="mt-2 text-xs text-slate-500">{field.helpText}</p> : null}
          </div>
        ))}
      </div>
      <Button type="button" className="mt-5 h-12 w-full text-base" style={{ backgroundColor: theme.primaryColor }}>
        {theme.submitButtonText}
      </Button>
      <p className="mt-3 text-center text-xs text-slate-500">{responseSettings.messageTitle}: {responseSettings.messageBody}</p>
    </div>
  );
}
