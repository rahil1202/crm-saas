"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, CircleDot, Mail, PencilLine, Phone, Plus, Target, X } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { getInitials } from "@/lib/auth-ui";
import { cn } from "@/lib/utils";

type LeadStatus = "new" | "qualified" | "proposal" | "won" | "lost";

type LeadHistoryResponse = {
  lead: {
    id: string;
    title: string;
    fullName: string | null;
    email: string | null;
    phone: string | null;
    source: string | null;
    status: LeadStatus;
    score: number;
    notes: string | null;
    tags: string[];
    createdAt: string;
    updatedAt: string;
  };
  timeline: Array<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
  deals: Array<{ id: string; title: string; stage: string; status: string; value: number }>;
  customers: Array<{ id: string; fullName: string; email: string | null; phone: string | null }>;
  tasks: Array<{ id: string; title: string; status: string; priority: string | null; dueAt: string | null }>;
  campaigns: Array<{ id: string; name: string; channel: string; status: string; scheduledAt: string | null }>;
  creator: { id: string; fullName: string | null; email: string } | null;
  summary: { customers: number; deals: number; openDeals: number; timelineEvents: number };
};

type LeadFormState = {
  title: string;
  fullName: string;
  email: string;
  phone: string;
  source: string;
  status: LeadStatus;
  score: string;
  tags: string;
  notes: string;
};

const leadStatuses: LeadStatus[] = ["new", "qualified", "proposal", "won", "lost"];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not Available";
  return new Date(value).toLocaleString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not Available";
  return new Date(value).toLocaleDateString();
}

function parseTags(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function getStatusTone(status: LeadStatus) {
  if (status === "won") return "default";
  if (status === "lost") return "destructive";
  if (status === "qualified") return "secondary";
  return "outline";
}

function leadToForm(lead: LeadHistoryResponse["lead"]): LeadFormState {
  return {
    title: lead.title,
    fullName: lead.fullName ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    source: lead.source ?? "",
    status: lead.status,
    score: String(lead.score),
    tags: lead.tags.join(", "),
    notes: lead.notes ?? "",
  };
}

function fallback(value: string | null | undefined) {
  return value?.trim() ? value : "Not Available";
}

function OverlayModal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 px-4 py-5 backdrop-blur-sm">
      <div className="flex h-full items-start justify-center overflow-y-auto">
        <div className="w-full max-w-3xl overflow-hidden rounded-[1.5rem] border border-border/70 bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)]">
          <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
            <div>
              <div className="text-base font-semibold text-slate-900">{title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </div>
            <Button type="button" variant="destructive" size="xs" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="max-h-[calc(100vh-8rem)] overflow-y-auto px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function InfoGrid({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.6rem] border border-white/75 bg-white/90 shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
        <div className="flex items-center gap-2 text-slate-900">
          <CircleDot className="size-3 text-sky-500" fill="currentColor" />
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        {actionLabel ? (
          <button type="button" onClick={onAction} className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 transition-colors hover:text-sky-800">
            <PencilLine className="size-4" />
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function DetailItem({ label, value, subtle }: { label: string; value: ReactNode; subtle?: boolean }) {
  return (
    <div className="grid gap-1">
      <div className="text-[0.8rem] font-medium text-slate-500">{label}</div>
      <div className={cn("text-[0.95rem] text-slate-900", subtle && "text-slate-400")}>{value}</div>
    </div>
  );
}

export default function LeadProfilePage() {
  const params = useParams<{ leadId: string }>();
  const leadId = params?.leadId;

  const [data, setData] = useState<LeadHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [form, setForm] = useState<LeadFormState | null>(null);
  const [note, setNote] = useState("");

  const loadProfile = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<LeadHistoryResponse>(`/leads/${leadId}/history`, { skipCache: true });
      setData(response);
      setForm(leadToForm(response.lead));
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load lead profile.");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSave = async () => {
    if (!leadId || !form || !form.title.trim()) {
      toast.error("Lead title is required.");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest(`/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title.trim(),
          fullName: form.fullName.trim() || undefined,
          email: form.email.trim() || undefined,
          phone: form.phone.trim() || undefined,
          source: form.source.trim() || undefined,
          status: form.status,
          score: Number(form.score) || 0,
          notes: form.notes.trim() || undefined,
          tags: parseTags(form.tags),
        }),
      });
      toast.success("Lead updated.");
      setEditOpen(false);
      await loadProfile();
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to update lead.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddNote = async () => {
    if (!leadId || !note.trim()) {
      toast.error("Note is required.");
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest(`/leads/${leadId}/timeline`, {
        method: "POST",
        body: JSON.stringify({ type: "note", message: note.trim() }),
      });
      toast.success("Timeline note added.");
      setNote("");
      setNoteOpen(false);
      await loadProfile();
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to add note.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConvert = async () => {
    if (!leadId) return;
    setConverting(true);
    try {
      await apiRequest(`/leads/${leadId}/convert`, {
        method: "POST",
        body: JSON.stringify({ createCustomer: true, value: 0 }),
      });
      toast.success("Lead converted.");
      await loadProfile();
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to convert lead.");
    } finally {
      setConverting(false);
    }
  };

  if (loading) {
    return <div className="rounded-[1.6rem] border border-dashed border-border/70 bg-white/70 px-5 py-4 text-sm text-muted-foreground">Loading lead profile...</div>;
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Lead profile error</AlertTitle>
        <AlertDescription>{error ?? "Lead profile was not found."}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        <aside className="grid gap-4 self-start">
          <section className="overflow-hidden rounded-[1.7rem] border border-white/75 bg-white/92 shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
            <div className="border-b border-slate-200/80 px-5 py-4">
              <Link href="/dashboard/leads" className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 transition-colors hover:text-sky-800">
                <ArrowLeft className="size-4" />
                Back To Leads
              </Link>
            </div>
            <div className="grid justify-items-center gap-4 px-6 py-6 text-center">
              <Avatar className="size-32 border border-sky-200/70 bg-sky-50 text-sky-700">
                <AvatarFallback className="text-4xl font-semibold">{getInitials(data.lead.fullName ?? data.lead.title)}</AvatarFallback>
              </Avatar>
              <div className="grid gap-1">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{data.lead.title}</h1>
                <div className="text-sm text-slate-500">{fallback(data.lead.fullName)}</div>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <Badge variant={getStatusTone(data.lead.status)} className="capitalize">{data.lead.status}</Badge>
                  <Badge variant="outline">Score {data.lead.score}</Badge>
                </div>
              </div>
              <div className="grid gap-2 text-sm">
                <a href={data.lead.email ? `mailto:${data.lead.email}` : undefined} className="text-sky-600 hover:text-sky-800">
                  {fallback(data.lead.email)}
                </a>
                <div className="text-slate-500">{fallback(data.lead.phone)}</div>
              </div>
            </div>

            <div className="border-t border-slate-200/80 px-5 py-5">
              <div className="text-sm font-semibold text-slate-900">Quick Actions</div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Button type="button" variant="outline" className="h-auto flex-col gap-2 py-3" onClick={() => setNoteOpen(true)}>
                  <Plus className="size-4" />
                  <span className="text-xs">Note</span>
                </Button>
                <Button type="button" variant="outline" className="h-auto flex-col gap-2 py-3" onClick={() => setEditOpen(true)}>
                  <PencilLine className="size-4" />
                  <span className="text-xs">Edit</span>
                </Button>
                <Button type="button" className="h-auto flex-col gap-2 py-3" onClick={() => void handleConvert()} disabled={converting}>
                  <Target className="size-4" />
                  <span className="text-xs">{converting ? "..." : "Convert"}</span>
                </Button>
              </div>
            </div>
          </section>
        </aside>

        <main className="grid gap-4">
          <section className="rounded-[1.7rem] border border-white/75 bg-white/92 p-2 sm:p-3 shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
            <Tabs defaultValue="overview" className="grid gap-4">
              <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-2xl p-1">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="grid gap-4">
                <InfoGrid title="Recent Activities">
                  <div className="grid gap-3">
                    {data.timeline.length ? data.timeline.slice(0, 6).map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium text-slate-900">{item.type.replaceAll("_", " ")}</div>
                          <div className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</div>
                        </div>
                        <div className="mt-2 text-sm text-slate-600">{String(item.payload?.message ?? item.payload?.title ?? JSON.stringify(item.payload))}</div>
                      </div>
                    )) : <div className="text-sm text-slate-500">No timeline activity yet.</div>}
                  </div>
                </InfoGrid>

                <InfoGrid title="Basic Information" actionLabel="Edit" onAction={() => setEditOpen(true)}>
                  <div className="grid gap-8 md:grid-cols-3">
                    <DetailItem label="Lead Title" value={data.lead.title} />
                    <DetailItem label="Lead Name" value={fallback(data.lead.fullName)} subtle={!data.lead.fullName} />
                    <DetailItem label="Source" value={fallback(data.lead.source)} subtle={!data.lead.source} />
                    <DetailItem label="Email" value={data.lead.email ? <a href={`mailto:${data.lead.email}`} className="text-sky-600 hover:text-sky-800">{data.lead.email}</a> : "Not Available"} subtle={!data.lead.email} />
                    <DetailItem label="Phone" value={fallback(data.lead.phone)} subtle={!data.lead.phone} />
                    <DetailItem label="Score" value={String(data.lead.score)} />
                    <DetailItem label="Created On" value={formatDateTime(data.lead.createdAt)} />
                    <DetailItem label="Updated On" value={formatDateTime(data.lead.updatedAt)} />
                    <DetailItem label="Tags" value={data.lead.tags.length ? data.lead.tags.join(", ") : "No tags added"} subtle={!data.lead.tags.length} />
                  </div>
                </InfoGrid>

                <InfoGrid title="Lead Notes" actionLabel="Edit" onAction={() => setEditOpen(true)}>
                  <div className="whitespace-pre-wrap break-words text-sm text-slate-600">{data.lead.notes?.trim() || "No notes available."}</div>
                </InfoGrid>
              </TabsContent>

              <TabsContent value="contacts" className="grid gap-4">
                <InfoGrid title="Linked Contacts">
                  {data.customers.length ? (
                    <div className="grid gap-3">
                      {data.customers.map((customer) => (
                        <Link key={customer.id} href={`/dashboard/contacts/${customer.id}`} className="grid gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 hover:border-sky-200">
                          <div className="font-medium text-slate-900">{customer.fullName}</div>
                          <div className="text-sm text-slate-500">{customer.email ?? customer.phone ?? "No contact details"}</div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">No contacts linked yet.</div>
                  )}
                </InfoGrid>

                <InfoGrid title="Linked Deals">
                  {data.deals.length ? (
                    <div className="grid gap-3">
                      {data.deals.map((deal) => (
                        <Link key={deal.id} href={`/dashboard/deals/${deal.id}`} className="grid gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 hover:border-sky-200">
                          <div className="font-medium text-slate-900">{deal.title}</div>
                          <div className="text-sm text-slate-500">{deal.stage} • {deal.status} • {deal.value}</div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">No deals linked yet.</div>
                  )}
                </InfoGrid>
              </TabsContent>

              <TabsContent value="activity" className="rounded-[1.6rem] border border-white/75 bg-white/90 px-5 py-8 text-sm shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
                {data.tasks.length ? (
                  <div className="grid gap-3">
                    {data.tasks.map((task) => (
                      <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="font-medium text-slate-900">{task.title}</div>
                        <div className="mt-1 text-sm text-slate-500">{task.status.replaceAll("_", " ")} • {task.priority ?? "medium"} • {formatDate(task.dueAt)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-500">No tasks linked to this lead yet.</div>
                )}
              </TabsContent>

              <TabsContent value="campaigns" className="rounded-[1.6rem] border border-white/75 bg-white/90 px-5 py-8 text-sm shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
                {data.campaigns.length ? (
                  <div className="grid gap-3">
                    {data.campaigns.map((campaign) => (
                      <div key={campaign.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="font-medium text-slate-900">{campaign.name}</div>
                        <div className="mt-1 text-sm text-slate-500">{campaign.channel} • {campaign.status} • {formatDate(campaign.scheduledAt)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-500">No campaigns linked to this lead yet.</div>
                )}
              </TabsContent>
            </Tabs>
          </section>
        </main>

        <aside className="grid gap-4 self-start">
          <section className="overflow-hidden rounded-[1.7rem] border border-white/75 bg-white/92 shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
            <div className="border-b border-slate-200/80 px-5 py-5">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Data Highlights</h2>
              <div className="mt-4 grid gap-4">
                <DetailItem label="Created On" value={formatDateTime(data.lead.createdAt)} />
                <DetailItem label="Created By" value={data.creator?.fullName ?? "Not Available"} subtle={!data.creator?.fullName} />
                <DetailItem label="Updated On" value={formatDateTime(data.lead.updatedAt)} />
                <DetailItem label="Updated By" value={data.creator?.fullName ?? "Not Available"} subtle={!data.creator?.fullName} />
              </div>
            </div>

            <div className="border-b border-slate-200/80 px-5 py-5">
              <h3 className="text-xl font-semibold text-slate-950">Summary</h3>
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Contacts</div>
                  <div className="mt-2 text-xl font-semibold text-slate-950">{data.summary.customers}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Deals</div>
                  <div className="mt-2 text-xl font-semibold text-slate-950">{data.summary.deals}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Open Deals</div>
                  <div className="mt-2 text-xl font-semibold text-slate-950">{data.summary.openDeals}</div>
                </div>
              </div>
            </div>

            <div className="px-5 py-5">
              <h3 className="text-xl font-semibold text-slate-950">Quick Contact</h3>
              <div className="mt-4 grid gap-3">
                <div className="inline-flex items-center gap-2 text-sm text-slate-600"><Mail className="size-4 text-slate-400" /> {fallback(data.lead.email)}</div>
                <div className="inline-flex items-center gap-2 text-sm text-slate-600"><Phone className="size-4 text-slate-400" /> {fallback(data.lead.phone)}</div>
                <div className="inline-flex items-center gap-2 text-sm text-slate-600"><Target className="size-4 text-slate-400" /> {fallback(data.lead.source)}</div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {editOpen && form ? (
        <OverlayModal title="Edit Lead" description="Update any lead field for this profile." onClose={() => setEditOpen(false)}>
          <div className="grid gap-4">
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field><FieldLabel>Title</FieldLabel><Input value={form.title} onChange={(event) => setForm((current) => current ? { ...current, title: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Lead Name</FieldLabel><Input value={form.fullName} onChange={(event) => setForm((current) => current ? { ...current, fullName: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Email</FieldLabel><Input value={form.email} onChange={(event) => setForm((current) => current ? { ...current, email: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Phone</FieldLabel><Input value={form.phone} onChange={(event) => setForm((current) => current ? { ...current, phone: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Source</FieldLabel><Input value={form.source} onChange={(event) => setForm((current) => current ? { ...current, source: event.target.value } : current)} /></Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <NativeSelect value={form.status} onChange={(event) => setForm((current) => current ? { ...current, status: event.target.value as LeadStatus } : current)} className="h-10 rounded-xl px-3 text-sm">
                  {leadStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </NativeSelect>
              </Field>
              <Field><FieldLabel>Score</FieldLabel><Input type="number" min={0} max={100} value={form.score} onChange={(event) => setForm((current) => current ? { ...current, score: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Tags</FieldLabel><Input value={form.tags} onChange={(event) => setForm((current) => current ? { ...current, tags: event.target.value } : current)} /></Field>
            </FieldGroup>
            <Field><FieldLabel>Notes</FieldLabel><Textarea value={form.notes} onChange={(event) => setForm((current) => current ? { ...current, notes: event.target.value } : current)} className="min-h-28 text-sm" /></Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="destructive" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="button" onClick={() => void handleSave()} disabled={submitting}>{submitting ? "Saving..." : "Save changes"}</Button>
            </div>
          </div>
        </OverlayModal>
      ) : null}

      {noteOpen ? (
        <OverlayModal title="Add Timeline Note" description="Record a new timeline note for this lead." onClose={() => setNoteOpen(false)}>
          <div className="grid gap-4">
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-28 text-sm" placeholder="Add note" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="destructive" onClick={() => setNoteOpen(false)}>Cancel</Button>
              <Button type="button" onClick={() => void handleAddNote()} disabled={submitting}>{submitting ? "Saving..." : "Add note"}</Button>
            </div>
          </div>
        </OverlayModal>
      ) : null}
    </>
  );
}
