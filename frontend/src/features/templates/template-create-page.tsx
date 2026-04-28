"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";

type SupportedTemplateType = "email" | "whatsapp";

const emailVariables = ["{{name}}", "{{sender_company}}", "{{receiver_company}}", "{{date}}", "{{email}}", "{{phone}}"];

export function TemplateCreatePage() {
  const router = useRouter();

  const [step, setStep] = useState<"setup" | "editor">("setup");
  const [name, setName] = useState("");
  const [type, setType] = useState<SupportedTemplateType>("email");

  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [footer, setFooter] = useState("");
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [draftQuickReply, setDraftQuickReply] = useState("");

  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notes = useMemo(() => {
    const parts: string[] = [];
    if (setAsDefault) {
      parts.push("default_template=true");
    }
    if (type === "whatsapp") {
      if (footer.trim()) {
        parts.push(`footer=${footer.trim()}`);
      }
      if (quickReplies.length > 0) {
        parts.push(`quick_replies=${quickReplies.join("|")}`);
      }
    }
    return parts.length > 0 ? parts.join("\n") : undefined;
  }, [footer, quickReplies, setAsDefault, type]);

  const canOpenEditor = name.trim().length >= 2;
  const canCreate = name.trim().length >= 2 && content.trim().length > 0;

  const addQuickReply = () => {
    const value = draftQuickReply.trim();
    if (!value) {
      return;
    }
    if (quickReplies.length >= 5) {
      toast.error("Maximum 5 quick reply buttons are supported.");
      return;
    }
    setQuickReplies((current) => [...current, value]);
    setDraftQuickReply("");
  };

  const removeQuickReply = (index: number) => {
    setQuickReplies((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const insertVariable = (token: string) => {
    setContent((current) => `${current}${current ? " " : ""}${token}`);
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate) {
      return;
    }

    setWorking(true);
    setError(null);
    try {
      await apiRequest("/templates", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          type,
          subject: subject.trim() || undefined,
          content: content.trim(),
          notes,
        }),
      });
      toast.success("Template created");
      router.push("/dashboard/templates");
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to create template";
      setError(message);
      toast.error(message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="grid gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Template create failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {step === "setup" ? (
        <section className="rounded-[1.6rem] border border-border/70 bg-white p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
          <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-4">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Create New Template</h2>
            <div className="flex items-center gap-2">
              <Link href="/dashboard/templates">
                <Button type="button" variant="ghost" size="sm">
                  Cancel
                </Button>
              </Link>
              <Button type="button" size="sm" disabled={!canOpenEditor} onClick={() => setStep("editor")}>
                Next
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-5">
            <Field>
              <FieldLabel>Template Name</FieldLabel>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter template name" className="h-12" />
            </Field>

            <Field>
              <FieldLabel>Template Type</FieldLabel>
              <select
                value={type}
                onChange={(event) => setType(event.target.value as SupportedTemplateType)}
                className="h-12 w-full rounded-xl border border-border bg-background px-3 text-sm"
              >
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </Field>
          </div>
        </section>
      ) : (
        <form className="grid gap-5" onSubmit={handleCreate}>
          <div className="flex items-center justify-between gap-4 rounded-[1.6rem] border border-border/70 bg-white px-4 py-3 shadow-[0_20px_50px_-38px_rgba(15,23,42,0.3)]">
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep("setup")}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <div className="text-xl font-semibold text-slate-900">{type === "email" ? "Email Template" : "WhatsApp Template"}</div>
            </div>
            <Button type="submit" size="sm" disabled={working || !canCreate}>
              {working ? "Creating..." : "Create Template"}
            </Button>
          </div>

          <section className="rounded-[1.6rem] border border-border/70 bg-white p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
            {type === "email" ? (
              <div className="grid gap-5">
                <div className="grid gap-3">
                  <div className="text-base font-semibold text-slate-900">Available Variables</div>
                  <div className="flex flex-wrap gap-2">
                    {emailVariables.map((token) => (
                      <Button key={token} type="button" variant="outline" size="sm" onClick={() => insertVariable(token)}>
                        {token}
                      </Button>
                    ))}
                  </div>
                  <div className="text-sm text-muted-foreground">Click a variable to append it to the email body.</div>
                </div>

                <Field>
                  <FieldLabel>Subject</FieldLabel>
                  <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Eg: Welcome to our service" />
                </Field>

                <Field>
                  <FieldLabel>Email Body</FieldLabel>
                  <Textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="Eg: Hi John, we're excited to have you onboard..."
                    className="min-h-72"
                  />
                </Field>
              </div>
            ) : (
              <div className="grid gap-5">
                <Field>
                  <FieldLabel>Header (Optional)</FieldLabel>
                  <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Eg: Hello John" />
                </Field>

                <Field>
                  <FieldLabel>Body (Required)</FieldLabel>
                  <Textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="Eg: Hi John, thank you for reaching out..."
                    className="min-h-40"
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel>Footer (Optional)</FieldLabel>
                  <Input value={footer} onChange={(event) => setFooter(event.target.value)} placeholder="Eg: Best regards" />
                </Field>

                <div className="grid gap-2">
                  <div className="text-base font-semibold text-slate-900">Buttons (Optional)</div>
                  <div className="text-sm text-muted-foreground">Add quick reply buttons (maximum 5).</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={draftQuickReply}
                      onChange={(event) => setDraftQuickReply(event.target.value)}
                      placeholder="Enter quick reply text"
                      className="max-w-xs"
                    />
                    <Button type="button" variant="ghost" onClick={addQuickReply}>
                      <Plus className="size-4" />
                      Add Button
                    </Button>
                  </div>
                  {quickReplies.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {quickReplies.map((item, index) => (
                        <div key={`${item}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-border bg-slate-50 px-3 py-1 text-sm">
                          <span>{item}</span>
                          <button type="button" onClick={() => removeQuickReply(index)} className="text-slate-500 hover:text-rose-600">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center gap-2">
              <Checkbox checked={setAsDefault} onCheckedChange={(checked) => setSetAsDefault(checked === true)} id="template-default" />
              <label htmlFor="template-default" className="text-base text-slate-900">
                Set as Default Template
              </label>
            </div>

            <div className="mt-6 grid gap-2">
              <div className="text-2xl font-semibold tracking-tight text-slate-900">Preview</div>
              <div className="rounded-xl border border-border bg-slate-50 p-4">
                {type === "email" ? (
                  <div className="grid gap-2 text-sm">
                    <div className="font-semibold text-slate-900">Subject: {subject.trim() || "No Subject Provided"}</div>
                    <div className="text-slate-700 whitespace-pre-wrap">{content.trim() || "No content in the email body."}</div>
                  </div>
                ) : (
                  <div className="grid gap-2 text-sm">
                    {subject.trim() ? <div className="font-semibold text-slate-900">{subject.trim()}</div> : null}
                    <div className="text-slate-700 whitespace-pre-wrap">{content.trim() || "No body content"}</div>
                    {footer.trim() ? <div className="text-slate-500">{footer.trim()}</div> : null}
                    {quickReplies.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {quickReplies.map((item, index) => (
                          <span key={`${item}-${index}`} className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium">
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </section>
        </form>
      )}
    </div>
  );
}
