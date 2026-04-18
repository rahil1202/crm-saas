"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Mail,
  PencilLine,
  Phone,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { CrmDetailItem } from "@/components/crm/crm-detail-primitives";
import { CrmConfirmDialog, CrmModalShell } from "@/components/crm/crm-list-primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { getInitials } from "@/lib/auth-ui";
import { cn } from "@/lib/utils";
import {
  buildPartnerNotes,
  emptyPartnerMetadata,
  parsePartnerNotes,
  partnerBusinessTypeOptions,
  type PartnerBusinessType,
  type PartnerMetadata,
} from "@/features/partners/partner-metadata";

type Partner = {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
};

type PartnerUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  title: string | null;
  status: "active" | "inactive";
  accessLevel: "restricted" | "standard" | "manager";
  lastAccessAt?: string | null;
  createdAt: string;
};

type PartnerLead = {
  id: string;
  title: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  score: number;
  createdAt: string;
};

type PartnerDeal = {
  id: string;
  title: string;
  stage: string;
  status: string;
  value: number;
  createdAt: string;
};

type PartnerDetailResponse = {
  partner: Partner;
  creator: {
    id: string;
    fullName: string | null;
    email: string | null;
  } | null;
  users: PartnerUser[];
  recentLeads: PartnerLead[];
  recentDeals: PartnerDeal[];
  summary: {
    assignedLeads: number;
    activeUsers: number;
    managerUsers: number;
    openDeals: number;
    wonDeals: number;
    lastLoginAt: string | null;
  };
};

type PartnerFormState = {
  companyName: string;
  contactName: string;
  email: string;
  businessType: PartnerBusinessType;
  phone: string;
  country: string;
  state: string;
  city: string;
  ndaSigned: boolean;
  partnershipAgreement: boolean;
  status: "active" | "inactive";
  notes: string;
};

type ProfileTab = "overview" | "assignedLeads";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not Available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const DetailItem = CrmDetailItem;

function createFormState(partner: Partner): PartnerFormState {
  const metadata = parsePartnerNotes(partner.notes);
  return {
    companyName: metadata.companyName || partner.name,
    contactName: partner.contactName ?? "",
    email: partner.email ?? "",
    businessType: metadata.businessType,
    phone: partner.phone ?? "",
    country: metadata.country,
    state: metadata.state,
    city: metadata.city,
    ndaSigned: metadata.ndaSigned,
    partnershipAgreement: metadata.partnershipAgreement,
    status: partner.status,
    notes: metadata.extraNotes,
  };
}

function buildPayload(form: PartnerFormState) {
  const metadata: PartnerMetadata = {
    ...emptyPartnerMetadata,
    companyName: form.companyName.trim(),
    businessType: form.businessType,
    country: form.country.trim(),
    state: form.state.trim(),
    city: form.city.trim(),
    ndaSigned: form.ndaSigned,
    partnershipAgreement: form.partnershipAgreement,
    extraNotes: form.notes.trim(),
  };

  return {
    name: form.companyName.trim(),
    contactName: form.contactName.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    status: form.status,
    notes: buildPartnerNotes(metadata) || undefined,
  };
}


export default function PartnerProfilePage() {
  const params = useParams<{ partnerId: string }>();
  const router = useRouter();
  const partnerId = params?.partnerId;
  const [data, setData] = useState<PartnerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [form, setForm] = useState<PartnerFormState | null>(null);
  const [tab, setTab] = useState<ProfileTab>("overview");

  const loadDetail = useCallback(async () => {
    if (!partnerId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<PartnerDetailResponse>(`/partners/${partnerId}`);
      setData(response);
      setForm(createFormState(response.partner));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load partner profile");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const metadata = useMemo(() => parsePartnerNotes(data?.partner.notes), [data?.partner.notes]);

  const statusBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of data?.recentLeads ?? []) {
      counts.set(lead.status, (counts.get(lead.status) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data?.recentLeads]);

  const handleSave = async () => {
    if (!data || !form) return;

    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/partners/${data.partner.id}`, {
        method: "PATCH",
        body: JSON.stringify(buildPayload(form)),
      });
      toast.success("Partner updated");
      setEditing(false);
      await loadDetail();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to update partner";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!data) return;

    setDeleting(true);
    setError(null);
    try {
      await apiRequest(`/partners/${data.partner.id}`, { method: "DELETE" });
      toast.success("Partner removed");
      router.push("/dashboard/partners");
      router.refresh();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to delete partner";
      setError(message);
      toast.error(message);
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (loading) {
    return <div className="rounded-3xl border border-border/70 bg-white px-6 py-16 text-center text-sm text-muted-foreground">Loading partner profile...</div>;
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Request failed</AlertTitle>
        <AlertDescription>{error ?? "Partner not found"}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)_320px]">
        <aside className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-white shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
          <div className="border-b border-border/60 px-6 py-6">
            <Link href="/dashboard/partners" className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 transition hover:text-sky-700">
              <ArrowLeft className="size-4" />
              Back To Partners
            </Link>

            <Avatar className="mt-6 size-20 border border-border/60 bg-slate-50">
              <AvatarFallback className="bg-primary text-2xl font-semibold text-white">{getInitials(data.partner.contactName || data.partner.name)}</AvatarFallback>
            </Avatar>

            <div className="mt-5">
              <div className="text-[1.9rem] font-semibold tracking-[-0.03em] text-slate-900">{data.partner.contactName || data.partner.name}</div>
              <div className="mt-1 text-lg text-slate-500">{data.partner.name}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant={data.partner.status === "active" ? "secondary" : "outline"}>{data.partner.status}</Badge>
                <Badge variant="outline">{metadata.businessType}</Badge>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (data.partner.email) {
                  navigator.clipboard.writeText(data.partner.email);
                  toast.success("Email copied");
                }
              }}
              className="mt-5 inline-flex w-full items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-left text-sm text-sky-600 transition hover:bg-slate-50"
            >
              <span className="truncate">{data.partner.email || "No email address"}</span>
              {data.partner.email ? <Copy className="ml-auto size-4 text-sky-500" /> : null}
            </button>
          </div>

          <div className="grid gap-5 px-6 py-6">
            <div className="text-lg font-semibold text-slate-900">About</div>
            <DetailItem label="Contact Person" value={data.partner.contactName || "Not Available"} subtle={!data.partner.contactName} />
            <DetailItem label="Email" value={data.partner.email || "Not Available"} subtle={!data.partner.email} />
            <DetailItem label="Contact" value={data.partner.phone || "Not Available"} subtle={!data.partner.phone} />
            <DetailItem label="Country" value={metadata.country || "Not Available"} subtle={!metadata.country} />
          </div>
        </aside>

        <div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-white shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
          <div className="border-b border-border/60 px-5 py-4">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setTab("overview")}
                className={cn(
                  "rounded-full px-5 py-2 text-sm font-medium transition",
                  tab === "overview" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
                )}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setTab("assignedLeads")}
                className={cn(
                  "rounded-full px-5 py-2 text-sm font-medium transition",
                  tab === "assignedLeads" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
                )}
              >
                Assigned Leads
              </button>
            </div>
          </div>

          {tab === "overview" ? (
            <>
              <div className="grid gap-6 border-b border-border/60 px-7 py-6 lg:grid-cols-3">
                <div className="lg:col-span-3 text-[1.5rem] font-semibold tracking-[-0.03em] text-slate-900">Data Highlights</div>
                <DetailItem label="Created On" value={formatDateTime(data.partner.createdAt)} />
                <DetailItem label="Updated At" value={formatDateTime(data.partner.updatedAt)} />
                <DetailItem label="Last Login" value={formatDateTime(data.summary.lastLoginAt)} subtle={!data.summary.lastLoginAt} />
                <DetailItem label="Assigned Leads" value={String(data.summary.assignedLeads)} />
                <DetailItem label="User Type" value={data.users[0]?.accessLevel || "Not Available"} subtle={!data.users[0]?.accessLevel} />
                <DetailItem label="Active Users" value={String(data.summary.activeUsers)} />
              </div>

              <div className="grid gap-6 border-b border-border/60 px-7 py-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[1.5rem] font-semibold tracking-[-0.03em] text-slate-900">Personal Details</div>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" className="text-sky-600 hover:text-sky-700" onClick={() => setEditing(true)}>
                      <PencilLine className="size-4" /> Edit
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => setShowDeleteModal(true)}>
                      <Trash2 className="size-4" /> Delete
                    </Button>
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                  <DetailItem label="Name" value={data.partner.contactName || "Not Available"} subtle={!data.partner.contactName} />
                  <DetailItem label="Email" value={data.partner.email || "Not Available"} subtle={!data.partner.email} />
                  <DetailItem label="Contact" value={data.partner.phone || "Not Available"} subtle={!data.partner.phone} />
                  <DetailItem label="NDA Signed" value={metadata.ndaSigned ? "Yes" : "No"} />
                  <DetailItem label="Partnership Agreement" value={metadata.partnershipAgreement ? "Yes" : "No"} />
                  <DetailItem label="Business Type" value={metadata.businessType} />
                </div>
              </div>

              <div className="grid gap-6 px-7 py-6 lg:grid-cols-2">
                <div className="grid gap-4">
                  <div className="text-xl font-semibold text-slate-900">Recent Leads</div>
                  {data.recentLeads.length ? data.recentLeads.slice(0, 4).map((lead) => (
                    <Link
                      key={lead.id}
                      href={`/dashboard/leads/${lead.id}`}
                      className="rounded-2xl border border-border/60 bg-slate-50/60 p-4 transition hover:bg-slate-50"
                    >
                      <div className="font-medium text-slate-900">{lead.title}</div>
                      <div className="mt-1 text-sm text-slate-500">{lead.fullName || lead.email || lead.phone || "Lead record"}</div>
                    </Link>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">No leads assigned to this partner yet.</div>
                  )}
                </div>

                <div className="grid gap-4">
                  <div className="text-xl font-semibold text-slate-900">Recent Deals</div>
                  {data.recentDeals.length ? data.recentDeals.slice(0, 4).map((deal) => (
                    <Link
                      key={deal.id}
                      href={`/dashboard/deals/${deal.id}`}
                      className="rounded-2xl border border-border/60 bg-slate-50/60 p-4 transition hover:bg-slate-50"
                    >
                      <div className="font-medium text-slate-900">{deal.title}</div>
                      <div className="mt-1 text-sm text-slate-500">{deal.stage} • {deal.status}</div>
                    </Link>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">No deals linked to this partner yet.</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="grid gap-4 px-7 py-6">
              <div className="text-xl font-semibold text-slate-900">Assigned Leads</div>
              {data.recentLeads.length ? data.recentLeads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/dashboard/leads/${lead.id}`}
                  className="grid gap-3 rounded-2xl border border-border/60 bg-slate-50/60 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div>
                    <div className="font-medium text-slate-900">{lead.title}</div>
                    <div className="mt-1 text-sm text-slate-500">{lead.fullName || lead.email || "Lead record"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{lead.status}</Badge>
                    <Badge variant="secondary">Score {lead.score}</Badge>
                  </div>
                </Link>
              )) : (
                <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">No leads assigned to this partner yet.</div>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-5">
          <div className="rounded-[1.75rem] border border-border/70 bg-white px-6 py-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
            <div className="text-[1.4rem] font-semibold text-slate-900">Status Breakdown</div>
            <div className="mt-5 grid gap-3 text-base">
              {statusBreakdown.length ? statusBreakdown.map(([status, count]) => (
                <div key={status} className="flex items-center justify-between gap-3 text-rose-700">
                  <span className="capitalize">{status}</span>
                  <span>{count}</span>
                </div>
              )) : (
                <div className="text-sm text-slate-400">Not Available</div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-white shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
            <div className="flex items-center justify-between border-b border-border/60 px-7 py-5">
              <div className="text-xl font-semibold text-slate-900">Access Users</div>
              <Badge variant="outline">{data.users.length} total</Badge>
            </div>
            <div className="grid gap-4 px-7 py-6">
              {data.users.length ? data.users.map((user) => (
                <div key={user.id} className="grid gap-3 rounded-2xl border border-border/60 bg-slate-50/60 p-4">
                  <div className="font-medium text-slate-900">{user.fullName}</div>
                  <div className="text-sm text-slate-500">{user.email}</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={user.status === "active" ? "secondary" : "outline"}>{user.status}</Badge>
                    <Badge variant="outline">{user.accessLevel}</Badge>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">No partner access users have been created yet.</div>
              )}
            </div>
          </div>
        </div>
      </section>

      {editing && form ? (
        <CrmModalShell open title="Edit Partner" description="Update the partner profile details." onClose={() => setEditing(false)} maxWidthClassName="max-w-5xl">
          <div className="grid gap-5">
            <div className="grid gap-4 rounded-2xl border border-border/60 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Basic Information</div>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <Field className="md:col-span-2">
                  <FieldLabel>Partner Company</FieldLabel>
                  <Input value={form.companyName} onChange={(event) => setForm((current) => current ? { ...current, companyName: event.target.value } : current)} className="h-10 text-sm" />
                </Field>
                <Field>
                  <FieldLabel>Contact Person</FieldLabel>
                  <Input value={form.contactName} onChange={(event) => setForm((current) => current ? { ...current, contactName: event.target.value } : current)} className="h-10 text-sm" />
                </Field>
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input value={form.email} onChange={(event) => setForm((current) => current ? { ...current, email: event.target.value } : current)} className="h-10 text-sm" type="email" />
                </Field>
                <Field>
                  <FieldLabel>Phone</FieldLabel>
                  <Input value={form.phone} onChange={(event) => setForm((current) => current ? { ...current, phone: event.target.value } : current)} className="h-10 text-sm" />
                </Field>
                <Field>
                  <FieldLabel>Business Type</FieldLabel>
                  <NativeSelect value={form.businessType} onChange={(event) => setForm((current) => current ? { ...current, businessType: event.target.value as PartnerBusinessType } : current)} className="h-10 rounded-xl px-3 text-sm">
                    {partnerBusinessTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Country</FieldLabel>
                  <Input value={form.country} onChange={(event) => setForm((current) => current ? { ...current, country: event.target.value } : current)} className="h-10 text-sm" />
                </Field>
                <Field>
                  <FieldLabel>State</FieldLabel>
                  <Input value={form.state} onChange={(event) => setForm((current) => current ? { ...current, state: event.target.value } : current)} className="h-10 text-sm" />
                </Field>
                <Field>
                  <FieldLabel>City</FieldLabel>
                  <Input value={form.city} onChange={(event) => setForm((current) => current ? { ...current, city: event.target.value } : current)} className="h-10 text-sm" />
                </Field>
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <NativeSelect value={form.status} onChange={(event) => setForm((current) => current ? { ...current, status: event.target.value as "active" | "inactive" } : current)} className="h-10 rounded-xl px-3 text-sm">
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </NativeSelect>
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Agreements</FieldLabel>
                  <div className="grid gap-3 rounded-2xl border border-border/60 bg-slate-50/60 p-4 md:grid-cols-2">
                    <label className="flex items-center gap-3 text-sm text-slate-700">
                      <Checkbox checked={form.ndaSigned} onCheckedChange={(checked) => setForm((current) => current ? { ...current, ndaSigned: checked === true } : current)} />
                      NDA Signed
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-700">
                      <Checkbox checked={form.partnershipAgreement} onCheckedChange={(checked) => setForm((current) => current ? { ...current, partnershipAgreement: checked === true } : current)} />
                      Partnership Agreement
                    </label>
                  </div>
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Notes</FieldLabel>
                  <Textarea value={form.notes} onChange={(event) => setForm((current) => current ? { ...current, notes: event.target.value } : current)} className="min-h-32 text-sm" />
                  <FieldDescription>These notes are stored alongside the structured partner metadata.</FieldDescription>
                </Field>
              </FieldGroup>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="destructive" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={submitting}>
                {submitting ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </CrmModalShell>
      ) : null}

      {showDeleteModal ? (
        <CrmConfirmDialog
          open
          title="Delete Partner"
          description={`This will permanently remove ${data.partner.name} from the workspace.`}
          warning="This action cannot be undone. Confirm only if you want to remove the partner company and its admin-side profile."
          confirmLabel="Confirm delete"
          submitting={deleting}
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={() => void handleDelete()}
        />
      ) : null}
    </div>
  );
}
