"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CircleDot,
  Globe,
  Mail,
  PencilLine,
  Phone,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { CrmDetailItem } from "@/components/crm/crm-detail-primitives";
import { CrmConfirmDialog, CrmModalShell } from "@/components/crm/crm-list-primitives";
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

type Customer = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  notes?: string | null;
};

type Lead = {
  id: string;
  title: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  score: number;
  notes: string | null;
  tags: string[];
  createdAt: string;
};

type Deal = {
  id: string;
  title: string;
  stage: string;
  status: string;
  value: number;
  expectedCloseDate: string | null;
  createdAt: string;
};

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  dueAt: string | null;
  createdAt: string;
};

type Campaign = {
  id: string;
  name: string;
  channel: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
};

type Creator = {
  id: string;
  fullName: string | null;
  email: string;
};

type CustomerHistoryResponse = {
  customer: Customer;
  creator: Creator | null;
  lead: Lead | null;
  deals: Deal[];
  tasks: Task[];
  campaigns: Campaign[];
  summary: {
    openDeals: number;
    wonDeals: number;
    pendingTasks: number;
    completedTasks: number;
    campaigns: number;
  };
};

type ContactNotes = Partial<
  Record<
    | "title"
    | "seniority"
    | "departments"
    | "remarks"
    | "callRemark"
    | "callStatus"
    | "country"
    | "source"
    | "status"
    | "linkedin"
    | "facebook"
    | "twitter"
    | "corporatePhone"
    | "mobilePhone"
    | "otherPhone"
    | "workDirectPhone",
    string
  >
>;

type ContactEditorState = {
  fullName: string;
  email: string;
  phone: string;
  tagsInput: string;
  title: string;
  seniority: string;
  departments: string;
  country: string;
  source: string;
  status: string;
  callRemark: string;
  callStatus: string;
  remarks: string;
  linkedin: string;
  facebook: string;
  twitter: string;
  corporatePhone: string;
  mobilePhone: string;
  otherPhone: string;
  workDirectPhone: string;
  extraNotes: string;
};

type DealFormState = {
  title: string;
  value: string;
  pipeline: string;
  stage: string;
  status: "open" | "won" | "lost";
  expectedCloseDate: string;
  notes: string;
};

type TaskFormState = {
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done" | "overdue";
  priority: "low" | "medium" | "high";
  dueAt: string;
};

type ProfileModal = "contact" | "deal" | "task" | null;

const callRemarkOptions = ["Interested", "Not Interested", "No Assets", "Not Started"] as const;
const callStatusOptions = ["Not Started", "Answered", "Not Answered 1", "Not Answered 2", "Not Connected", "Out of Reach", "Wrong Number"] as const;

function parseContactNotes(notes: string | null | undefined): ContactNotes {
  const result: ContactNotes = {};
  const extraLines: string[] = [];
  const raw = notes ?? "";

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (!match) {
      extraLines.push(line);
      continue;
    }

    const key = match[1]?.trim().toLowerCase();
    const value = match[2]?.trim() ?? "";
    if (!value) continue;

    if (key === "title") result.title = value;
    if (key === "seniority") result.seniority = value;
    if (key === "departments") result.departments = value;
    if (key === "remarks") result.remarks = value;
    if (key === "call remark") result.callRemark = value;
    if (key === "call status") result.callStatus = value;
    if (key === "country") result.country = value;
    if (key === "source") result.source = value;
    if (key === "status") result.status = value;
    if (key === "linkedin") result.linkedin = value;
    if (key === "facebook") result.facebook = value;
    if (key === "twitter") result.twitter = value;
    if (key === "corporate phone") result.corporatePhone = value;
    if (key === "mobile phone") result.mobilePhone = value;
    if (key === "other phone") result.otherPhone = value;
    if (key === "work direct phone") result.workDirectPhone = value;
    if (!["title", "seniority", "departments", "remarks", "call remark", "call status", "country", "source", "status", "linkedin", "facebook", "twitter", "corporate phone", "mobile phone", "other phone", "work direct phone"].includes(key ?? "")) {
      extraLines.push(line);
    }
  }

  if (!result.callRemark) result.callRemark = "Not Started";
  if (!result.callStatus) result.callStatus = "Not Started";
  if (!result.remarks && raw.trim()) result.remarks = raw.trim();
  (result as ContactNotes & { extraNotes?: string }).extraNotes = extraLines.join("\n").trim();

  return result;
}

function parseTags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function customerToEditorState(customer: Customer): ContactEditorState {
  const details = parseContactNotes(customer.notes);
  return {
    fullName: customer.fullName,
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    tagsInput: (customer.tags ?? []).join(", "),
    title: details.title ?? "",
    seniority: details.seniority ?? "",
    departments: details.departments ?? "",
    country: details.country ?? "",
    source: details.source ?? "",
    status: details.status ?? "",
    callRemark: details.callRemark ?? "Not Started",
    callStatus: details.callStatus ?? "Not Started",
    remarks: details.remarks ?? "",
    linkedin: details.linkedin ?? "",
    facebook: details.facebook ?? "",
    twitter: details.twitter ?? "",
    corporatePhone: details.corporatePhone ?? "",
    mobilePhone: details.mobilePhone ?? "",
    otherPhone: details.otherPhone ?? "",
    workDirectPhone: details.workDirectPhone ?? "",
    extraNotes: (details as ContactNotes & { extraNotes?: string }).extraNotes ?? "",
  };
}

function buildContactNotes(form: ContactEditorState) {
  const lines = [
    ["Title", form.title],
    ["Seniority", form.seniority],
    ["Departments", form.departments],
    ["Country", form.country],
    ["Source", form.source],
    ["Status", form.status],
    ["Call Remark", form.callRemark || "Not Started"],
    ["Call Status", form.callStatus || "Not Started"],
    ["Remarks", form.remarks],
    ["Corporate phone", form.corporatePhone],
    ["Mobile phone", form.mobilePhone],
    ["Other phone", form.otherPhone],
    ["Work direct phone", form.workDirectPhone],
    ["LinkedIn", form.linkedin],
    ["Facebook", form.facebook],
    ["Twitter", form.twitter],
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value}`);

  return [...lines, form.extraNotes.trim()].filter(Boolean).join("\n");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not Available";
  return new Date(value).toLocaleString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not Available";
  return new Date(value).toLocaleDateString();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
}

function fallback(value: string | null | undefined) {
  return value?.trim() ? value : "Not Available";
}

function domainFromEmail(email: string | null | undefined) {
  return email?.includes("@") ? email.split("@")[1] : null;
}

function domainToLabel(domain: string | null) {
  if (!domain) return "Not Available";
  const base = domain.replace(/^www\./, "").split(".")[0] ?? "";
  if (!base) return "Not Available";
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
    <CrmModalShell open title={title} description={description} onClose={onClose} maxWidthClassName="max-w-3xl">
      {children}
    </CrmModalShell>
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

const DetailItem = CrmDetailItem;

export default function CustomerProfilePage() {
  const params = useParams<Record<string, string | string[]>>();
  const customerId =
    typeof params?.contactId === "string"
      ? params.contactId
      : typeof params?.customerId === "string"
        ? params.customerId
        : undefined;

  const [data, setData] = useState<CustomerHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ProfileModal>(null);
  const [contactForm, setContactForm] = useState<ContactEditorState | null>(null);
  const [dealForm, setDealForm] = useState<DealFormState>({
    title: "",
    value: "0",
    pipeline: "default",
    stage: "new",
    status: "open",
    expectedCloseDate: "",
    notes: "",
  });
  const [taskForm, setTaskForm] = useState<TaskFormState>({
    title: "",
    description: "",
    status: "todo",
    priority: "medium",
    dueAt: "",
  });
  const [savingContact, setSavingContact] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<CustomerHistoryResponse>(`/customers/${customerId}/history`, { skipCache: true });
      setData(response);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load contact profile.");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const details = useMemo(() => parseContactNotes(data?.customer.notes), [data?.customer.notes]);
  const companyDomain = domainFromEmail(data?.customer.email);
  const companyLabel = domainToLabel(companyDomain);

  const activityItems = useMemo(() => {
    if (!data) return [];

    const base = [
      {
        id: `customer-created-${data.customer.id}`,
        title: "Contact created",
        description: data.creator?.fullName ? `${data.creator.fullName} created this contact.` : "Contact record created.",
        when: data.customer.createdAt,
        badge: "Created",
      },
      {
        id: `customer-updated-${data.customer.id}`,
        title: "Contact updated",
        description: "Customer details were updated.",
        when: data.customer.updatedAt,
        badge: "Updated",
      },
      ...data.tasks.map((task) => ({
        id: `task-${task.id}`,
        title: task.title,
        description: `Task ${task.status.replaceAll("_", " ")}${task.dueAt ? ` • due ${formatDate(task.dueAt)}` : ""}`,
        when: task.createdAt,
        badge: "Task",
      })),
      ...data.deals.map((deal) => ({
        id: `deal-${deal.id}`,
        title: deal.title,
        description: `${deal.stage} • ${deal.status} • ${formatCurrency(deal.value)}`,
        when: deal.createdAt,
        badge: "Deal",
      })),
      ...data.campaigns.map((campaign) => ({
        id: `campaign-${campaign.id}`,
        title: campaign.name,
        description: `${campaign.channel} campaign • ${campaign.status}`,
        when: campaign.createdAt,
        badge: "Campaign",
      })),
    ];

    return base.sort((left, right) => new Date(right.when).getTime() - new Date(left.when).getTime()).slice(0, 10);
  }, [data]);

  const openContactEditor = useCallback(() => {
    if (!data) return;
    setContactForm(customerToEditorState(data.customer));
    setModal("contact");
  }, [data]);

  const handleContactSave = useCallback(async () => {
    if (!data || !contactForm) return;
    if (!contactForm.fullName.trim()) {
      toast.error("Contact name is required.");
      return;
    }

    setSavingContact(true);
    try {
      await apiRequest(`/customers/${data.customer.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: contactForm.fullName.trim(),
          email: contactForm.email.trim() || null,
          phone: contactForm.phone.trim() || null,
          tags: parseTags(contactForm.tagsInput),
          notes: buildContactNotes(contactForm),
        }),
      });
      await loadProfile();
      setModal(null);
      toast.success("Contact updated.");
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to update contact.");
    } finally {
      setSavingContact(false);
    }
  }, [contactForm, data, loadProfile]);

  const handleDealCreate = useCallback(async () => {
    if (!data || !dealForm.title.trim()) {
      toast.error("Deal title is required.");
      return;
    }

    setSavingDeal(true);
    try {
      await apiRequest("/deals", {
        method: "POST",
        body: JSON.stringify({
          title: dealForm.title.trim(),
          value: Number(dealForm.value) || 0,
          pipeline: dealForm.pipeline.trim() || "default",
          stage: dealForm.stage.trim() || "new",
          status: dealForm.status,
          notes: dealForm.notes.trim() || undefined,
          expectedCloseDate: dealForm.expectedCloseDate ? new Date(`${dealForm.expectedCloseDate}T00:00:00.000Z`).toISOString() : undefined,
          customerId: data.customer.id,
        }),
      });
      await loadProfile();
      setDealForm({ title: "", value: "0", pipeline: "default", stage: "new", status: "open", expectedCloseDate: "", notes: "" });
      setModal(null);
      toast.success("Deal added to contact.");
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to create deal.");
    } finally {
      setSavingDeal(false);
    }
  }, [data, dealForm, loadProfile]);

  const handleTaskCreate = useCallback(async () => {
    if (!data || !taskForm.title.trim()) {
      toast.error("Task title is required.");
      return;
    }

    setSavingTask(true);
    try {
      await apiRequest("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || undefined,
          status: taskForm.status,
          priority: taskForm.priority,
          dueAt: taskForm.dueAt ? new Date(`${taskForm.dueAt}T00:00:00.000Z`).toISOString() : undefined,
          customerId: data.customer.id,
        }),
      });
      await loadProfile();
      setTaskForm({ title: "", description: "", status: "todo", priority: "medium", dueAt: "" });
      setModal(null);
      toast.success("Allocation added to contact.");
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to create allocation.");
    } finally {
      setSavingTask(false);
    }
  }, [data, loadProfile, taskForm]);

  const handleDelete = useCallback(async () => {
    if (!data) return;
    setSavingContact(true);
    try {
      await apiRequest(`/customers/${data.customer.id}`, { method: "DELETE" });
      toast.success("Contact moved to trash.");
      window.location.href = "/dashboard/contacts";
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to move contact to trash.");
    } finally {
      setSavingContact(false);
      setDeleteOpen(false);
    }
  }, [data]);

  if (loading) {
    return <div className="rounded-[1.6rem] border border-dashed border-border/70 bg-white/70 px-5 py-4 text-sm text-muted-foreground">Loading contact profile...</div>;
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Contact profile error</AlertTitle>
        <AlertDescription>{error ?? "Contact profile was not found."}</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
      <aside className="grid gap-4 self-start">
        <section className="overflow-hidden rounded-[1.7rem] border border-white/75 bg-white/92 shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
          <div className="border-b border-slate-200/80 px-5 py-4">
            <Link href="/dashboard/contacts" className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 transition-colors hover:text-sky-800">
              <ArrowLeft className="size-4" />
              Back To Contacts
            </Link>
          </div>
          <div className="grid justify-items-center gap-4 px-6 py-6 text-center">
            <Avatar className="size-32 border border-sky-200/70 bg-sky-50 text-sky-700">
              <AvatarFallback className="text-4xl font-semibold">{getInitials(data.customer.fullName)}</AvatarFallback>
            </Avatar>
            <div className="grid gap-1">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{data.customer.fullName}</h1>
              <div className="text-sm text-slate-500">{fallback(details.seniority)}</div>
              <div className="text-sm text-slate-400">{companyLabel}</div>
            </div>
            <div className="grid gap-2 text-sm">
              <a href={data.customer.email ? `mailto:${data.customer.email}` : undefined} className="text-sky-600 hover:text-sky-800">
                {fallback(data.customer.email)}
              </a>
              <div className="text-slate-500">{fallback(data.customer.phone)}</div>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Badge variant="secondary" className="rounded-full px-3 py-1">Verified</Badge>
              <Badge className="rounded-full px-3 py-1">Invite</Badge>
            </div>
          </div>

          <div className="border-t border-slate-200/80 px-5 py-4">
            <div className="text-sm font-semibold text-slate-900">Quick Connect</div>
            <div className="mt-3 grid grid-cols-4 gap-3">
              {[
                { href: data.customer.email ? `mailto:${data.customer.email}` : undefined, icon: Mail },
                { href: data.customer.phone ? `tel:${data.customer.phone}` : undefined, icon: Phone },
                { href: details.linkedin, icon: UserRound },
                { href: details.twitter, icon: Globe },
              ].map((item, index) => {
                const Icon = item.icon;
                return item.href ? (
                  <a key={index} href={item.href} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-sky-300 hover:text-sky-700">
                    <Icon className="size-5" />
                  </a>
                ) : (
                  <div key={index} className="flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-300">
                    <Icon className="size-5" />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-200/80 px-5 py-4">
            <div className="text-sm font-semibold text-slate-900">Summary</div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{fallback(details.title)}</div>
            <Button type="button" variant="destructive" className="mt-3 w-full" onClick={() => setDeleteOpen(true)} disabled={savingContact}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </section>
      </aside>

      <main className="min-w-0 grid gap-4">
        <section className="rounded-[1.8rem] border border-white/75 bg-white/92 px-4 py-4 shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
          <Tabs defaultValue="overview" queryKey="tab" className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="allocation">Allocation</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="meeting">Meeting</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="grid gap-4">
              <InfoGrid title="Recent Activities">
                <div className="grid max-h-[240px] gap-4 overflow-y-auto pr-2">
                  {activityItems.length ? (
                    activityItems.map((item) => (
                      <div key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                        <div className="flex size-8 items-center justify-center rounded-full bg-fuchsia-600 text-xs font-semibold text-white">
                          {getInitials(data.customer.fullName)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">{item.title}</span>
                            <span className="text-xs text-slate-400">{formatDateTime(item.when)}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                          <Badge variant="outline" className="mt-2 rounded-full px-2.5 py-0.5 text-[0.68rem]">{item.badge}</Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">No activity recorded yet.</div>
                  )}
                </div>
              </InfoGrid>

              <InfoGrid title="Basic Information" actionLabel="Edit" onAction={openContactEditor}>
                <div className="grid gap-8 md:grid-cols-3">
                  <DetailItem label="Name" value={data.customer.fullName} />
                  <DetailItem label="Job Title" value={fallback(details.title)} subtle={fallback(details.title) === "Not Available"} />
                  <DetailItem label="Seniority" value={fallback(details.seniority)} subtle={fallback(details.seniority) === "Not Available"} />
                  <DetailItem label="Country" value={fallback(details.country)} subtle={fallback(details.country) === "Not Available"} />
                  <DetailItem label="Departments" value={fallback(details.departments)} subtle={fallback(details.departments) === "Not Available"} />
                  <DetailItem label="Source" value={fallback(details.source ?? data.lead?.source)} subtle={fallback(details.source ?? data.lead?.source) === "Not Available"} />
                  <DetailItem label="Email" value={data.customer.email ? <a href={`mailto:${data.customer.email}`} className="text-sky-600 hover:text-sky-800">{data.customer.email}</a> : "Not Available"} subtle={!data.customer.email} />
                  <DetailItem label="Mobile Phone" value={fallback(details.mobilePhone ?? data.customer.phone)} subtle={fallback(details.mobilePhone ?? data.customer.phone) === "Not Available"} />
                  <DetailItem label="Corporate Phone" value={fallback(details.corporatePhone)} subtle={fallback(details.corporatePhone) === "Not Available"} />
                  <DetailItem label="Work Direct Phone" value={fallback(details.workDirectPhone)} subtle={fallback(details.workDirectPhone) === "Not Available"} />
                  <DetailItem label="Other Phone" value={fallback(details.otherPhone)} subtle={fallback(details.otherPhone) === "Not Available"} />
                  <DetailItem label="Tags" value={data.customer.tags?.length ? data.customer.tags.join(", ") : "No tags added"} subtle={!data.customer.tags?.length} />
                </div>
              </InfoGrid>

              <InfoGrid title="Other Information" actionLabel="Edit" onAction={openContactEditor}>
                <div className="grid gap-8 md:grid-cols-3">
                  <DetailItem label="Call Remark" value={fallback(details.callRemark)} subtle={fallback(details.callRemark) === "Not Available"} />
                  <DetailItem label="Call Status" value={fallback(details.callStatus)} subtle={fallback(details.callStatus) === "Not Available"} />
                  <DetailItem label="Remarks" value={fallback(details.remarks)} subtle={fallback(details.remarks) === "Not Available"} />
                  <DetailItem label="Last Contacted" value={data.tasks[0]?.createdAt ? formatDate(data.tasks[0].createdAt) : "Not Available"} subtle={!data.tasks[0]?.createdAt} />
                  <DetailItem label="Lead Score" value={data.lead ? String(data.lead.score) : "Not Available"} subtle={!data.lead} />
                  <DetailItem label="Status" value={fallback(details.status ?? data.lead?.status)} subtle={fallback(details.status ?? data.lead?.status) === "Not Available"} />
                </div>
              </InfoGrid>

              <InfoGrid title="Associated Company Details" actionLabel="Edit" onAction={openContactEditor}>
                <div className="grid gap-8 md:grid-cols-3">
                  <DetailItem label="Business Name" value={companyLabel} subtle={companyLabel === "Not Available"} />
                  <DetailItem label="Website" value={companyDomain ? <a href={`https://${companyDomain}`} target="_blank" rel="noreferrer" className="text-sky-600 hover:text-sky-800">{`https://${companyDomain}`}</a> : "Not Available"} subtle={!companyDomain} />
                  <DetailItem label="Country" value={companyDomain?.split(".").at(-1)?.toUpperCase() ?? "Not Available"} subtle={!companyDomain} />
                  <DetailItem label="Contact Person" value={data.creator?.fullName ?? "Not Available"} subtle={!data.creator?.fullName} />
                  <DetailItem label="Company Email" value={fallback(data.customer.email)} subtle={!data.customer.email} />
                  <DetailItem label="Phone" value={fallback(data.customer.phone)} subtle={!data.customer.phone} />
                </div>
              </InfoGrid>

              <InfoGrid title="Social Media" actionLabel="Edit" onAction={openContactEditor}>
                <div className="grid gap-8 md:grid-cols-3">
                  <DetailItem label="LinkedIn" value={details.linkedin ? <a href={details.linkedin} target="_blank" rel="noreferrer" className="text-sky-600 hover:text-sky-800">{details.linkedin}</a> : "Not Available"} subtle={!details.linkedin} />
                  <DetailItem label="Facebook" value={details.facebook ? <a href={details.facebook} target="_blank" rel="noreferrer" className="text-sky-600 hover:text-sky-800">{details.facebook}</a> : "Not Available"} subtle={!details.facebook} />
                  <DetailItem label="Twitter" value={details.twitter ? <a href={details.twitter} target="_blank" rel="noreferrer" className="text-sky-600 hover:text-sky-800">{details.twitter}</a> : "Not Available"} subtle={!details.twitter} />
                </div>
              </InfoGrid>

              <InfoGrid title="Associated Deals">
                {data.deals.length ? (
                  <div className="grid gap-3">
                    {data.deals.map((deal) => (
                      <div key={deal.id} className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900">{deal.title}</div>
                          <div className="mt-1 text-sm text-slate-500">{deal.stage} • {deal.status}</div>
                        </div>
                        <div className="text-sm font-medium text-slate-900">{formatCurrency(deal.value)}</div>
                        <div className="text-sm text-slate-500">{deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "No close date"}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">No deal assignments found</div>
                )}
              </InfoGrid>
            </TabsContent>

            <TabsContent value="allocation" className="rounded-[1.6rem] border border-white/75 bg-white/90 px-5 py-8 text-sm text-slate-500 shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
              {data.tasks.length ? (
                <div className="grid gap-3">
                  {data.tasks.map((task) => (
                    <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="font-medium text-slate-900">{task.title}</div>
                      <div className="mt-1 text-sm text-slate-500">
                        {task.status.replaceAll("_", " ")}{task.priority ? ` • ${task.priority}` : ""}{task.dueAt ? ` • due ${formatDate(task.dueAt)}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                "No task allocations available for this contact yet."
              )}
            </TabsContent>

            <TabsContent value="notes" className="rounded-[1.6rem] border border-white/75 bg-white/90 px-5 py-8 text-sm shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
              <pre className="whitespace-pre-wrap break-words font-sans text-slate-600">{data.customer.notes?.trim() || "No notes available."}</pre>
            </TabsContent>

            <TabsContent value="meeting" className="rounded-[1.6rem] border border-white/75 bg-white/90 px-5 py-8 text-sm text-slate-500 shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
              Meeting history is not available yet for this contact.
            </TabsContent>
          </Tabs>
        </section>
      </main>

      <aside className="grid gap-4 self-start">
        <section className="overflow-hidden rounded-[1.7rem] border border-white/75 bg-white/92 shadow-[0_18px_48px_-36px_rgba(35,86,166,0.28)]">
          <div className="border-b border-slate-200/80 px-5 py-5">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Data Highlights</h2>
            <div className="mt-4 grid gap-4">
              <DetailItem label="Created On" value={formatDateTime(data.customer.createdAt)} />
              <DetailItem label="Created By" value={data.creator?.fullName ?? "Not Available"} subtle={!data.creator?.fullName} />
              <DetailItem label="Updated On" value={formatDateTime(data.customer.updatedAt)} />
              <DetailItem label="Updated By" value={data.creator?.fullName ?? "Not Available"} subtle={!data.creator?.fullName} />
            </div>
          </div>

          <div className="border-b border-slate-200/80 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-slate-950">Allocated to</h3>
              <button type="button" onClick={() => setModal("task")} className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-800">
                <Plus className="size-4" />
                Add
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              {data.tasks.length ? data.tasks.slice(0, 4).map((task) => (
                <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="font-medium text-slate-900">{task.title}</div>
                  <div className="mt-1 text-sm text-slate-500">{task.status.replaceAll("_", " ")}{task.dueAt ? ` • ${formatDate(task.dueAt)}` : ""}</div>
                </div>
              )) : <p className="text-sm text-slate-500">No allocations associated with this record.</p>}
            </div>
          </div>

          <div className="border-b border-slate-200/80 px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-slate-950">Company</h3>
              <button type="button" onClick={openContactEditor} className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-800">
                <PencilLine className="size-4" />
                Edit
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              <div className="text-sky-600">{companyLabel}</div>
              <div className="text-sm text-slate-500">{companyDomain ? `https://${companyDomain}` : "Not Available"}</div>
              <div className="inline-flex items-center gap-2 text-sm text-slate-600"><UserRound className="size-4 text-slate-400" /> {data.creator?.fullName ?? "Not Available"}</div>
              <div className="inline-flex items-center gap-2 text-sm text-slate-600"><Phone className="size-4 text-slate-400" /> {fallback(data.customer.phone)}</div>
              <div className="inline-flex items-center gap-2 text-sm text-slate-600"><Globe className="size-4 text-slate-400" /> {companyDomain?.split(".").at(-1)?.toUpperCase() ?? "Not Available"}</div>
            </div>
          </div>

          <div className="px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-slate-950">Deals</h3>
              <button type="button" onClick={() => setModal("deal")} className="inline-flex items-center gap-1 text-sm font-medium text-sky-600 hover:text-sky-800">
                <Plus className="size-4" />
                Add
              </button>
            </div>
            <div className="mt-4 grid gap-3">
              {data.deals.length ? data.deals.slice(0, 4).map((deal) => (
                <div key={deal.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="font-medium text-slate-900">{deal.title}</div>
                  <div className="mt-1 text-sm text-slate-500">{deal.stage} • {formatCurrency(deal.value)}</div>
                </div>
              )) : <p className="text-sm text-slate-500">No deals associated with this record.</p>}
            </div>
          </div>
        </section>
      </aside>
    </div>

    {modal === "contact" && contactForm ? (
      <OverlayModal title="Edit Contact" description="Update any contact field for this profile." onClose={() => setModal(null)}>
        <div className="grid gap-5">
          <div className="grid gap-4 rounded-2xl border border-border/60 bg-slate-50/70 p-4">
            <div className="text-sm font-semibold text-slate-900">Identity</div>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field><FieldLabel>Full name</FieldLabel><Input value={contactForm.fullName} onChange={(event) => setContactForm((current) => current ? { ...current, fullName: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Email</FieldLabel><Input value={contactForm.email} onChange={(event) => setContactForm((current) => current ? { ...current, email: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Primary phone</FieldLabel><Input value={contactForm.phone} onChange={(event) => setContactForm((current) => current ? { ...current, phone: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Tags</FieldLabel><Input value={contactForm.tagsInput} onChange={(event) => setContactForm((current) => current ? { ...current, tagsInput: event.target.value } : current)} placeholder="priority, enterprise" /></Field>
            </FieldGroup>
          </div>

          <div className="grid gap-4 rounded-2xl border border-border/60 bg-white p-4">
            <div className="text-sm font-semibold text-slate-900">Profile details</div>
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field><FieldLabel>Title</FieldLabel><Input value={contactForm.title} onChange={(event) => setContactForm((current) => current ? { ...current, title: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Seniority</FieldLabel><Input value={contactForm.seniority} onChange={(event) => setContactForm((current) => current ? { ...current, seniority: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Departments</FieldLabel><Input value={contactForm.departments} onChange={(event) => setContactForm((current) => current ? { ...current, departments: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Country</FieldLabel><Input value={contactForm.country} onChange={(event) => setContactForm((current) => current ? { ...current, country: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Source</FieldLabel><Input value={contactForm.source} onChange={(event) => setContactForm((current) => current ? { ...current, source: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Status</FieldLabel><Input value={contactForm.status} onChange={(event) => setContactForm((current) => current ? { ...current, status: event.target.value } : current)} /></Field>
              <Field>
                <FieldLabel>Call Remark</FieldLabel>
                <NativeSelect value={contactForm.callRemark} onChange={(event) => setContactForm((current) => current ? { ...current, callRemark: event.target.value } : current)} className="h-10 rounded-xl px-3 text-sm">
                  {callRemarkOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Call Status</FieldLabel>
                <NativeSelect value={contactForm.callStatus} onChange={(event) => setContactForm((current) => current ? { ...current, callStatus: event.target.value } : current)} className="h-10 rounded-xl px-3 text-sm">
                  {callStatusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                </NativeSelect>
              </Field>
              <Field><FieldLabel>Corporate phone</FieldLabel><Input value={contactForm.corporatePhone} onChange={(event) => setContactForm((current) => current ? { ...current, corporatePhone: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Mobile phone</FieldLabel><Input value={contactForm.mobilePhone} onChange={(event) => setContactForm((current) => current ? { ...current, mobilePhone: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Other phone</FieldLabel><Input value={contactForm.otherPhone} onChange={(event) => setContactForm((current) => current ? { ...current, otherPhone: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Work direct phone</FieldLabel><Input value={contactForm.workDirectPhone} onChange={(event) => setContactForm((current) => current ? { ...current, workDirectPhone: event.target.value } : current)} /></Field>
            </FieldGroup>
          </div>

          <div className="grid gap-4 rounded-2xl border border-border/60 bg-slate-50/70 p-4">
            <div className="text-sm font-semibold text-slate-900">Social and notes</div>
            <FieldGroup className="grid gap-4 md:grid-cols-3">
              <Field><FieldLabel>LinkedIn</FieldLabel><Input value={contactForm.linkedin} onChange={(event) => setContactForm((current) => current ? { ...current, linkedin: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Facebook</FieldLabel><Input value={contactForm.facebook} onChange={(event) => setContactForm((current) => current ? { ...current, facebook: event.target.value } : current)} /></Field>
              <Field><FieldLabel>Twitter</FieldLabel><Input value={contactForm.twitter} onChange={(event) => setContactForm((current) => current ? { ...current, twitter: event.target.value } : current)} /></Field>
            </FieldGroup>
            <Field><FieldLabel>Remarks</FieldLabel><Textarea value={contactForm.remarks} onChange={(event) => setContactForm((current) => current ? { ...current, remarks: event.target.value } : current)} className="min-h-24 text-sm" /></Field>
            <Field><FieldLabel>Additional notes</FieldLabel><Textarea value={contactForm.extraNotes} onChange={(event) => setContactForm((current) => current ? { ...current, extraNotes: event.target.value } : current)} className="min-h-24 text-sm" /></Field>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="destructive" onClick={() => setModal(null)}>Cancel</Button>
            <Button type="button" onClick={() => void handleContactSave()} disabled={savingContact}>{savingContact ? "Saving..." : "Save changes"}</Button>
          </div>
        </div>
      </OverlayModal>
    ) : null}

    {modal === "deal" ? (
      <OverlayModal title="Add Deal" description="Create a new deal linked to this contact." onClose={() => setModal(null)}>
        <div className="grid gap-4">
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field><FieldLabel>Deal title</FieldLabel><Input value={dealForm.title} onChange={(event) => setDealForm((current) => ({ ...current, title: event.target.value }))} /></Field>
            <Field><FieldLabel>Value</FieldLabel><Input type="number" min={0} value={dealForm.value} onChange={(event) => setDealForm((current) => ({ ...current, value: event.target.value }))} /></Field>
            <Field><FieldLabel>Pipeline</FieldLabel><Input value={dealForm.pipeline} onChange={(event) => setDealForm((current) => ({ ...current, pipeline: event.target.value }))} /></Field>
            <Field><FieldLabel>Stage</FieldLabel><Input value={dealForm.stage} onChange={(event) => setDealForm((current) => ({ ...current, stage: event.target.value }))} /></Field>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <NativeSelect value={dealForm.status} onChange={(event) => setDealForm((current) => ({ ...current, status: event.target.value as DealFormState["status"] }))} className="h-10 rounded-xl px-3 text-sm">
                <option value="open">Open</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
              </NativeSelect>
            </Field>
            <Field><FieldLabel>Expected close date</FieldLabel><Input type="date" value={dealForm.expectedCloseDate} onChange={(event) => setDealForm((current) => ({ ...current, expectedCloseDate: event.target.value }))} /></Field>
          </FieldGroup>
          <Field><FieldLabel>Notes</FieldLabel><Textarea value={dealForm.notes} onChange={(event) => setDealForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-24 text-sm" /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="destructive" onClick={() => setModal(null)}>Cancel</Button>
            <Button type="button" onClick={() => void handleDealCreate()} disabled={savingDeal}>{savingDeal ? "Adding..." : "Add deal"}</Button>
          </div>
        </div>
      </OverlayModal>
    ) : null}

    {modal === "task" ? (
      <OverlayModal title="Add Allocation" description="Create a task allocation tied to this contact." onClose={() => setModal(null)}>
        <div className="grid gap-4">
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field><FieldLabel>Task title</FieldLabel><Input value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} /></Field>
            <Field><FieldLabel>Due date</FieldLabel><Input type="date" value={taskForm.dueAt} onChange={(event) => setTaskForm((current) => ({ ...current, dueAt: event.target.value }))} /></Field>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <NativeSelect value={taskForm.status} onChange={(event) => setTaskForm((current) => ({ ...current, status: event.target.value as TaskFormState["status"] }))} className="h-10 rounded-xl px-3 text-sm">
                <option value="todo">Todo</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
                <option value="overdue">Overdue</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Priority</FieldLabel>
              <NativeSelect value={taskForm.priority} onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value as TaskFormState["priority"] }))} className="h-10 rounded-xl px-3 text-sm">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </NativeSelect>
            </Field>
          </FieldGroup>
          <Field><FieldLabel>Description</FieldLabel><Textarea value={taskForm.description} onChange={(event) => setTaskForm((current) => ({ ...current, description: event.target.value }))} className="min-h-24 text-sm" /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="destructive" onClick={() => setModal(null)}>Cancel</Button>
            <Button type="button" onClick={() => void handleTaskCreate()} disabled={savingTask}>{savingTask ? "Adding..." : "Add allocation"}</Button>
          </div>
        </div>
      </OverlayModal>
    ) : null}

    <CrmConfirmDialog
      open={deleteOpen}
      title="Move Contact To Trash"
      description={data ? `${data.customer.fullName} will be removed from active records.` : undefined}
      warning="This moves the contact to the deleted view. You can restore it later from the contacts list."
      confirmLabel="Move to trash"
      submitting={savingContact}
      onConfirm={() => void handleDelete()}
      onCancel={() => {
        if (!savingContact) setDeleteOpen(false);
      }}
    />
  </>
  );
}
