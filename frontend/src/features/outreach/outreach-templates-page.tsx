"use client";

import { FormEvent, useEffect, useState } from "react";
import { Edit3, Eye, Image, Mail, Plus, Search, Video, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ApiError, apiRequest } from "@/lib/api";
import { OutreachTopNav } from "@/features/outreach/outreach-top-nav";

type Template = {
  id: string;
  name: string;
  subject: string | null;
  content: string;
  notes: string | null;
  updatedAt: string;
};

type TemplateDraft = {
  id: string | null;
  name: string;
  subject: string;
  content: string;
  notes: string;
};

const emptyDraft: TemplateDraft = { id: null, name: "", subject: "", content: "", notes: "" };

// Detect if template has image/video
function getTemplateMediaType(content: string): "image" | "video" | null {
  if (/<img/i.test(content)) return "image";
  if (/<video|youtube\.com|youtu\.be|vimeo\.com/i.test(content)) return "video";
  return null;
}

function getTemplateCategory(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("onboard")) return "Onboarding";
  if (lower.includes("follow")) return "Follow-up";
  if (lower.includes("b2b") || lower.includes("business")) return "B2B";
  if (lower.includes("cold") || lower.includes("intro")) return "Cold Outreach";
  if (lower.includes("referral")) return "Referral";
  if (lower.includes("welcome")) return "Welcome";
  if (lower.includes("proposal")) return "Proposal";
  if (lower.includes("demo")) return "Demo";
  if (lower.includes("nurture")) return "Nurture";
  return "General";
}

const categoryColors: Record<string, string> = {
  Onboarding: "bg-emerald-100 text-emerald-800",
  "Follow-up": "bg-blue-100 text-blue-800",
  B2B: "bg-purple-100 text-purple-800",
  "Cold Outreach": "bg-orange-100 text-orange-800",
  Referral: "bg-pink-100 text-pink-800",
  Welcome: "bg-teal-100 text-teal-800",
  Proposal: "bg-indigo-100 text-indigo-800",
  Demo: "bg-yellow-100 text-yellow-800",
  Nurture: "bg-cyan-100 text-cyan-800",
  General: "bg-slate-100 text-slate-700",
};

export function OutreachTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Preview modal
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  // Edit modal
  const [editDraft, setEditDraft] = useState<TemplateDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ type: "email", limit: "100", offset: "0" });
        if (q.trim()) params.set("q", q.trim());
        const response = await apiRequest<{ items: Template[] }>(`/templates/list?${params.toString()}`);
        if (!disposed) setTemplates(response.items);
      } catch (caughtError) {
        if (!disposed) setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load templates");
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, [q, reloadKey]);

  const seedTemplates = async () => {
    setSeeding(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiRequest<{ createdTemplates: number }>("/outreach/examples", {
        method: "POST",
        body: JSON.stringify({ templates: true, leads: false }),
        skipCache: true,
      });
      setSuccess(response.createdTemplates > 0 ? `Added ${response.createdTemplates} starter templates.` : "Starter templates are already available.");
      setReloadKey((v) => v + 1);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to add starter templates");
    } finally {
      setSeeding(false);
    }
  };

  const seedAllTemplates = async () => {
    setSeeding(true);
    setError(null);
    setSuccess(null);
    try {
      // Seed the built-in starter templates first
      await apiRequest("/outreach/examples", {
        method: "POST",
        body: JSON.stringify({ templates: true, leads: false }),
        skipCache: true,
      });

      // Then create additional business templates
      const additionalTemplates = [
        {
          name: "B2B Intro - Decision Maker",
          subject: "Quick question for {{outreach.account.name}}",
          content: "<p>Hi {{outreach.contact.fullName}},</p><p>I help B2B companies like {{outreach.account.name}} streamline their sales process and close deals faster.</p><p>Would you be open to a 15-minute call this week to explore if there's a fit?</p><p>Best,<br/>{{sender_name}}</p>",
          notes: "B2B cold outreach to decision makers",
        },
        {
          name: "B2B Follow-up #1",
          subject: "Following up — {{outreach.account.name}}",
          content: "<p>Hi {{outreach.contact.fullName}},</p><p>I wanted to follow up on my previous email. I know your inbox is busy, so I'll keep this short.</p><p>We've helped similar companies reduce their sales cycle by 30%. Worth a quick chat?</p><p>Best,<br/>{{sender_name}}</p>",
          notes: "First follow-up after no reply",
        },
        {
          name: "B2B Follow-up #2 (Last Touch)",
          subject: "Last note — {{outreach.account.name}}",
          content: "<p>Hi {{outreach.contact.fullName}},</p><p>I'll make this my last email. If improving your team's outbound process isn't a priority right now, no worries at all.</p><p>If timing changes, feel free to reach out. I'll leave the door open.</p><p>Best,<br/>{{sender_name}}</p>",
          notes: "Final follow-up breakup email",
        },
        {
          name: "Onboarding Welcome",
          subject: "Welcome to {{sender_company}} — let's get started",
          content: "<p>Hi {{outreach.contact.fullName}},</p><p>Welcome aboard! We're thrilled to have {{outreach.account.name}} with us.</p><p>Here's what happens next:</p><ul><li>✅ Your account is being set up</li><li>📅 We'll schedule your onboarding call within 24 hours</li><li>📚 You'll receive our getting started guide shortly</li></ul><p>Any questions? Just reply to this email.</p><p>Best,<br/>{{sender_name}}</p>",
          notes: "Welcome email for new customers",
        },
        {
          name: "Onboarding Check-in (Day 7)",
          subject: "How's everything going at {{outreach.account.name}}?",
          content: "<p>Hi {{outreach.contact.fullName}},</p><p>It's been a week since you joined us — I wanted to check in and see how things are going.</p><p>Are you getting the value you expected? Any blockers we can help with?</p><p>Happy to jump on a quick call if that would help.</p><p>Best,<br/>{{sender_name}}</p>",
          notes: "Day 7 onboarding check-in",
        },
        {
          name: "Demo Request Follow-up",
          subject: "Your demo recap — {{outreach.account.name}}",
          content: "<p>Hi {{outreach.contact.fullName}},</p><p>Thanks for joining our demo today! I hope it gave you a clear picture of how we can help {{outreach.account.name}}.</p><p>As discussed, here are the key points:</p><ul><li>Feature A — solves your X problem</li><li>Feature B — saves your team Y hours/week</li><li>Pricing — starts at Z/month</li></ul><p>Ready to move forward? I can have you set up within 24 hours.</p><p>Best,<br/>{{sender_name}}</p>",
          notes: "Post-demo follow-up email",
        },
        {
          name: "Proposal Sent",
          subject: "Proposal for {{outreach.account.name}} — next steps",
          content: "<p>Hi {{outreach.contact.fullName}},</p><p>I've sent over the proposal for {{outreach.account.name}}. Please find it attached.</p><p>The proposal covers:</p><ul><li>Scope of work</li><li>Timeline and milestones</li><li>Investment and ROI projections</li></ul><p>I'm available for a call this week to walk through any questions. What time works best for you?</p><p>Best,<br/>{{sender_name}}</p>",
          notes: "Proposal delivery email",
        },
        {
          name: "Referral Ask",
          subject: "Quick favor — who should I talk to?",
          content: "<p>Hi {{outreach.contact.fullName}},</p><p>I'm reaching out to a few people at {{outreach.account.name}} to find the right person to speak with about improving your sales workflow.</p><p>Would you be the right person, or could you point me in the right direction?</p><p>I promise to keep it brief.</p><p>Thanks,<br/>{{sender_name}}</p>",
          notes: "Referral/warm intro ask",
        },
        {
          name: "Lead Nurture — Value Email",
          subject: "3 ways companies like {{outreach.account.name}} grow faster",
          content: "<p>Hi {{outreach.contact.fullName}},</p><p>I've been working with companies in your space and noticed three patterns that separate the fastest-growing teams:</p><ol><li><strong>Automated follow-up</strong> — never let a lead go cold</li><li><strong>Personalized outreach at scale</strong> — relevant messages, not blasts</li><li><strong>Clear pipeline visibility</strong> — know exactly where every deal stands</li></ol><p>Would any of these be useful for {{outreach.account.name}} right now?</p><p>Best,<br/>{{sender_name}}</p>",
          notes: "Value-add nurture email",
        },
        {
          name: "Re-engagement — Dormant Lead",
          subject: "Still relevant for {{outreach.account.name}}?",
          content: "<p>Hi {{outreach.contact.fullName}},</p><p>We spoke a while back about improving your team's outreach process. I wanted to check in — is this still something on your radar?</p><p>A lot has changed on our end, and I think the timing might be better now.</p><p>Worth a quick 10-minute catch-up?</p><p>Best,<br/>{{sender_name}}</p>",
          notes: "Re-engagement for dormant leads",
        },
        {
          name: "Event / Webinar Invite",
          subject: "Exclusive invite for {{outreach.contact.fullName}}",
          content: "<p>Hi {{outreach.contact.fullName}},</p><p>I'd like to personally invite you to our upcoming webinar: <strong>\"How to 3x Your Outbound Pipeline in 90 Days\"</strong></p><p>📅 Date: [DATE]<br/>⏰ Time: [TIME]<br/>🔗 Register: [LINK]</p><p>We'll cover real strategies used by top-performing sales teams. Seats are limited.</p><p>Hope to see you there!</p><p>Best,<br/>{{sender_name}}</p>",
          notes: "Webinar/event invitation",
        },
        {
          name: "Case Study Share",
          subject: "How [Company] achieved [Result] — relevant for {{outreach.account.name}}?",
          content: "<p>Hi {{outreach.contact.fullName}},</p><p>I thought this might be relevant for {{outreach.account.name}}.</p><p>One of our customers — a company similar to yours — achieved [specific result] within [timeframe] using our platform.</p><p>Here's the short version: [2-3 sentence summary of the case study]</p><p>Would you like me to send the full case study? Or better yet, let's hop on a call and I can walk you through it.</p><p>Best,<br/>{{sender_name}}</p>",
          notes: "Case study sharing email",
        },
      ];

      let created = 0;
      for (const tmpl of additionalTemplates) {
        try {
          await apiRequest("/templates", {
            method: "POST",
            body: JSON.stringify({ ...tmpl, type: "email" }),
            skipCache: true,
          });
          created++;
        } catch {
          // skip duplicates
        }
      }

      setSuccess(`Added ${created} business templates.`);
      setReloadKey((v) => v + 1);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to add templates");
    } finally {
      setSeeding(false);
    }
  };

  const openEdit = (template: Template) => {
    setEditDraft({
      id: template.id,
      name: template.name,
      subject: template.subject ?? "",
      content: template.content,
      notes: template.notes ?? "",
    });
  };

  const openNew = () => {
    setEditDraft({ ...emptyDraft });
  };

  const saveTemplate = async (event: FormEvent) => {
    event.preventDefault();
    if (!editDraft) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: editDraft.name.trim(),
        type: "email",
        subject: editDraft.subject.trim() || undefined,
        content: editDraft.content.trim(),
        notes: editDraft.notes.trim() || undefined,
      };
      if (editDraft.id) {
        await apiRequest(`/templates/${editDraft.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        setSuccess("Template updated.");
      } else {
        await apiRequest("/templates", { method: "POST", body: JSON.stringify(payload) });
        setSuccess("Template created.");
      }
      setEditDraft(null);
      setReloadKey((v) => v + 1);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Email Outreach Agent</h1>
        <p className="mt-1 text-sm text-slate-600">AI-driven discovery and automated email campaigns</p>
      </div>

      <OutreachTopNav />

      <Card className="border-border/70">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Email Templates</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={seedTemplates} disabled={seeding}>
                {seeding ? "Adding..." : "Add starter templates"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={seedAllTemplates} disabled={seeding}>
                {seeding ? "Adding..." : "Add business templates"}
              </Button>
              <Button type="button" size="sm" onClick={openNew} className="gap-1.5">
                <Plus className="size-4" />
                New Template
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates..." className="h-10 pl-9" />
          </div>

          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
          {loading ? <div className="rounded-xl border border-border/60 bg-slate-50 px-3 py-2 text-sm text-slate-500">Loading email templates...</div> : null}

          {/* Grid view */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => {
              const category = getTemplateCategory(template.name);
              const mediaType = getTemplateMediaType(template.content);
              return (
                <div
                  key={template.id}
                  className="group relative flex flex-col rounded-2xl border border-border/70 bg-white p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">{template.name}</div>
                      {template.subject ? (
                        <div className="mt-0.5 truncate text-xs text-slate-500">{template.subject}</div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {mediaType === "image" ? <Image className="size-3.5 text-sky-500" /> : null}
                      {mediaType === "video" ? <Video className="size-3.5 text-purple-500" /> : null}
                    </div>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.68rem] font-medium ${categoryColors[category] ?? categoryColors.General}`}>
                      {category}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[0.68rem] text-slate-500">
                      <Mail className="size-2.5" />
                      Email
                    </span>
                  </div>

                  <div className="mb-3 line-clamp-3 flex-1 text-xs text-slate-600" dangerouslySetInnerHTML={{ __html: template.content }} />

                  <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2">
                    <span className="text-[0.68rem] text-slate-400">{new Date(template.updatedAt).toLocaleDateString()}</span>
                    <div className="flex gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => setPreviewTemplate(template)}
                      >
                        <Eye className="size-3.5" />
                        Preview
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 px-2 text-xs"
                        onClick={() => openEdit(template)}
                      >
                        <Edit3 className="size-3.5" />
                        Edit
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {!loading && templates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 py-12 text-center">
              <Mail className="mx-auto mb-3 size-8 text-slate-300" />
              <div className="text-sm font-medium text-slate-600">No templates yet</div>
              <p className="mt-1 text-xs text-slate-400">Add starter or business templates, or create your own.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Preview Modal */}
      {previewTemplate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewTemplate(null)}>
          <div
            className="relative max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border/60 bg-white px-5 py-4">
              <div>
                <div className="font-semibold text-slate-900">{previewTemplate.name}</div>
                {previewTemplate.subject ? (
                  <div className="mt-0.5 text-sm text-slate-500">Subject: {previewTemplate.subject}</div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => { openEdit(previewTemplate); setPreviewTemplate(null); }}
                  className="gap-1.5"
                >
                  <Edit3 className="size-3.5" />
                  Edit
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => setPreviewTemplate(null)}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <div className="p-5">
              <div
                className="prose prose-sm max-w-none text-slate-800"
                dangerouslySetInnerHTML={{ __html: previewTemplate.content }}
              />
              {previewTemplate.notes ? (
                <div className="mt-4 rounded-xl border border-border/60 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  <strong>Notes:</strong> {previewTemplate.notes}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit / Create Modal */}
      {editDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-border/60 bg-white px-5 py-4">
              <div className="font-semibold text-slate-900">{editDraft.id ? "Edit Template" : "New Template"}</div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setEditDraft(null)} disabled={saving}>
                <X className="size-4" />
              </Button>
            </div>
            <form className="grid gap-4 p-5" onSubmit={saveTemplate}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Template Name</FieldLabel>
                  <Input
                    value={editDraft.name}
                    onChange={(e) => setEditDraft((d) => d ? { ...d, name: e.target.value } : d)}
                    placeholder="e.g. B2B Cold Intro"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>Subject Line</FieldLabel>
                  <Input
                    value={editDraft.subject}
                    onChange={(e) => setEditDraft((d) => d ? { ...d, subject: e.target.value } : d)}
                    placeholder="e.g. Quick question for {{outreach.account.name}}"
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-border/60 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <strong>Variables:</strong>{" "}
                {["{{outreach.contact.fullName}}", "{{outreach.account.name}}", "{{sender_name}}", "{{sender_company}}"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="mr-1 rounded bg-white px-1.5 py-0.5 font-mono text-[0.65rem] border border-border/60 hover:bg-slate-100"
                    onClick={() => setEditDraft((d) => d ? { ...d, content: d.content + v } : d)}
                  >
                    {v}
                  </button>
                ))}
              </div>

              <Field>
                <FieldLabel>Body (HTML supported)</FieldLabel>
                <Textarea
                  value={editDraft.content}
                  onChange={(e) => setEditDraft((d) => d ? { ...d, content: e.target.value } : d)}
                  className="min-h-56 font-mono text-xs"
                  placeholder="<p>Hi {{outreach.contact.fullName}},</p><p>Your message here...</p>"
                  required
                />
                <div className="mt-1 text-xs text-slate-400">
                  Supports HTML. Add images with &lt;img src="..."&gt; or embed video links.
                </div>
              </Field>

              <Field>
                <FieldLabel>Notes (internal)</FieldLabel>
                <Textarea
                  value={editDraft.notes}
                  onChange={(e) => setEditDraft((d) => d ? { ...d, notes: e.target.value } : d)}
                  className="min-h-16"
                  placeholder="When to use this template..."
                />
              </Field>

              {/* Live preview */}
              {editDraft.content.trim() ? (
                <div className="rounded-xl border border-border/60 bg-slate-50 p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</div>
                  {editDraft.subject ? (
                    <div className="mb-2 text-sm font-semibold text-slate-900">Subject: {editDraft.subject}</div>
                  ) : null}
                  <div
                    className="prose prose-sm max-w-none text-slate-800"
                    dangerouslySetInnerHTML={{ __html: editDraft.content }}
                  />
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEditDraft(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !editDraft.name.trim() || !editDraft.content.trim()}>
                  {saving ? "Saving..." : editDraft.id ? "Update Template" : "Create Template"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
