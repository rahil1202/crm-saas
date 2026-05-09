"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Import, PencilLine, Plus, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

import {
  CrmAppliedFiltersBar,
  CrmBulkSelectionBar,
  CrmColumnSettings,
  CrmDataTable,
  CrmFilterDrawer,
  CrmListPageHeader,
  CrmListToolbar,
  CrmListViewTabs,
  CrmModalShell,
  CrmPaginationBar,
} from "@/components/crm/crm-list-primitives";
import { SuggestionInputField } from "@/components/crm/crm-form-fields";
import { useCrmFormSuggestions } from "@/components/crm/use-crm-form-suggestions";
import { downloadCsvFile, toCsvCell } from "@/components/crm/csv-export";
import type { ColumnDefinition } from "@/components/crm/types";
import { useCrmListState, usePersistedColumnVisibility } from "@/components/crm/use-crm-list-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { getCompanyCookie } from "@/lib/cookies";
import { loadMe } from "@/lib/me-cache";
import { buildDocumentsCsv } from "@/features/documents/helpers";
import {
  createRelatedDocumentTableColumns,
  relatedDocumentColumns,
  RelatedDocumentsTable,
  type RelatedDocumentColumnKey,
} from "@/features/documents/related-documents-table";
import type { DocumentItem, DocumentListResponse } from "@/features/documents/types";

type LeadStatus = "new" | "qualified" | "proposal" | "won" | "lost";
type LeadPriority = "hot" | "warm" | "nurture" | "cold";
type SortDirection = "asc" | "desc";
type ModalMode = "create" | "edit" | "delete" | "permanentDelete" | "import" | "filter" | null;
type LeadSortKey =
  | "id"
  | "title"
  | "fullName"
  | "email"
  | "phone"
  | "source"
  | "status"
  | "score"
  | "priority"
  | "createdAt"
  | "updatedAt";
type LeadColumnKey = LeadSortKey | "actions";
type LeadColumnVisibility = Record<LeadColumnKey, boolean>;
type DocumentColumnVisibility = Record<RelatedDocumentColumnKey, boolean>;

interface Lead {
  id: string;
  title: string;
  fullName: string | null;
  associatedCompany: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  partnerCompanyId: string | null;
  assignedToUserId: string | null;
  status: LeadStatus;
  score: number;
  priorityBand?: LeadPriority;
  priorityLabel?: string;
  priorityReason?: string;
  notes: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

interface ListLeadResponse {
  items: Lead[];
  total: number;
  limit: number;
  offset: number;
}

interface LeadSourceSettings {
  leadSources: Array<{
    key: string;
    label: string;
  }>;
}

interface PartnerListResponse {
  items: Array<{
    id: string;
    name: string;
    status: "active" | "inactive";
  }>;
}

type LeadFormState = {
  title: string;
  fullName: string;
  associatedCompany: string;
  email: string;
  phone: string;
  source: string;
  status: LeadStatus;
  score: string;
  notes: string;
  tags: string;
};

type LeadFilters = {
  q: string;
  source: string;
  status: string;
  lifecycle: string;
  priority: string;
  productTags: string;
  title: string;
  description: string;
  fullName: string;
  email: string;
  phone: string;
  createdFrom: string;
  createdTo: string;
  documentFolder: string;
};

type LeadFilterKey = keyof LeadFilters;

type LeadFilterChip = {
  key: LeadFilterKey;
  label: string;
  value: string;
};

const rowsPerPageOptions = [10, 20, 50, 100] as const;
const leadColumnStorageKey = "crm-saas-leads-columns";
const leadDocumentColumnStorageKey = "crm-saas-lead-documents-columns";
const leadStatuses: LeadStatus[] = ["new", "qualified", "proposal", "won", "lost"];
const importSample = `title,full_name,email,phone,source,status,score,tags,notes
Acme HQ fit-out,Riya Mehta,riya@acme.com,+91 9988816709,website,new,78,enterprise|priority,Inbound lead
North zone referral,Vikram Singh,,+91 9876543210,referral,qualified,62,partner,Requested callback`;

const emptyLeadForm: LeadFormState = {
  title: "",
  fullName: "",
  associatedCompany: "",
  email: "",
  phone: "",
  source: "",
  status: "new",
  score: "0",
  notes: "",
  tags: "",
};

const emptyFilters: LeadFilters = {
  q: "",
  source: "",
  status: "",
  lifecycle: "active",
  priority: "",
  productTags: "",
  title: "",
  description: "",
  fullName: "",
  email: "",
  phone: "",
  createdFrom: "",
  createdTo: "",
  documentFolder: "",
};

const leadColumnLabels: Record<LeadSortKey, string> = {
  id: "ID",
  title: "Title / Designation",
  fullName: "Lead Name",
  email: "Email",
  phone: "Mobile Phone",
  source: "Source",
  status: "Lead Status",
  score: "Score",
  priority: "Priority",
  createdAt: "Created On",
  updatedAt: "Updated On",
};

const defaultLeadColumnVisibility: LeadColumnVisibility = {
  id: true,
  title: true,
  fullName: true,
  email: true,
  phone: true,
  source: true,
  status: true,
  score: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  actions: true,
};

const defaultDocumentColumnVisibility: DocumentColumnVisibility = {
  name: true,
  folder: true,
  type: true,
  size: true,
  createdAt: true,
};

const lockedLeadColumns: Exclude<LeadColumnKey, "actions">[] = ["title"];
const leadColumnOrder: LeadColumnKey[] = [
  "id",
  "title",
  "fullName",
  "email",
  "phone",
  "source",
  "status",
  "score",
  "priority",
  "createdAt",
  "updatedAt",
  "actions",
];

function parseTags(value: string) {
  return value
    .split(/[|,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function getStatusTone(status: LeadStatus) {
  if (status === "won") return "default";
  if (status === "lost") return "destructive";
  if (status === "qualified") return "secondary";
  return "outline";
}

function getPriority(lead: Pick<Lead, "score" | "priorityBand" | "priorityLabel">) {
  if (lead.priorityBand && lead.priorityLabel) {
    return { key: lead.priorityBand, label: lead.priorityLabel };
  }
  if (lead.score >= 75) return { key: "hot" as LeadPriority, label: "Hot" };
  if (lead.score >= 50) return { key: "warm" as LeadPriority, label: "Warm" };
  if (lead.score >= 25) return { key: "nurture" as LeadPriority, label: "Nurture" };
  return { key: "cold" as LeadPriority, label: "Cold" };
}

function getPriorityTone(priority: LeadPriority) {
  if (priority === "hot") return "destructive";
  if (priority === "warm") return "default";
  if (priority === "nurture") return "secondary";
  return "outline";
}

function compareValues(left: string | number, right: string | number, direction: SortDirection) {
  if (typeof left === "number" && typeof right === "number") {
    return direction === "asc" ? left - right : right - left;
  }

  const comparison = String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return direction === "asc" ? comparison : -comparison;
}

function getLeadSortValue(lead: Lead, key: LeadSortKey) {
  switch (key) {
    case "id":
      return lead.id;
    case "title":
      return lead.title;
    case "fullName":
      return lead.fullName ?? "";
    case "email":
      return lead.email ?? "";
    case "phone":
      return lead.phone ?? "";
    case "source":
      return lead.source ?? "";
    case "status":
      return lead.status;
    case "score":
      return lead.score;
    case "priority":
      return ["cold", "nurture", "warm", "hot"].indexOf(getPriority(lead).key);
    case "createdAt":
      return new Date(lead.createdAt).getTime();
    case "updatedAt":
      return new Date(lead.updatedAt).getTime();
    default:
      return "";
  }
}

function getFilterChips(filters: LeadFilters) {
  const chips: LeadFilterChip[] = [];

  if (filters.q.trim()) chips.push({ key: "q", label: "Search", value: filters.q.trim() });
  if (filters.source.trim()) chips.push({ key: "source", label: "Source", value: filters.source.trim() });
  if (filters.status.trim()) chips.push({ key: "status", label: "Lead Status", value: filters.status.trim() });
  if (filters.priority.trim()) chips.push({ key: "priority", label: "Priority", value: filters.priority.trim() });
  if (filters.productTags.trim()) chips.push({ key: "productTags", label: "Product Tags", value: filters.productTags.trim() });
  if (filters.title.trim()) chips.push({ key: "title", label: "Job Title", value: filters.title.trim() });
  if (filters.description.trim()) chips.push({ key: "description", label: "Description", value: filters.description.trim() });
  if (filters.fullName.trim()) chips.push({ key: "fullName", label: "Full Name", value: filters.fullName.trim() });
  if (filters.lifecycle.trim() && filters.lifecycle !== "active") chips.push({ key: "lifecycle", label: "Record State", value: filters.lifecycle.trim() });
  if (filters.email.trim()) chips.push({ key: "email", label: "Email", value: filters.email.trim() });
  if (filters.phone.trim()) chips.push({ key: "phone", label: "Phone", value: filters.phone.trim() });
  if (filters.createdFrom.trim()) chips.push({ key: "createdFrom", label: "Created From", value: filters.createdFrom.trim() });
  if (filters.createdTo.trim()) chips.push({ key: "createdTo", label: "Created To", value: filters.createdTo.trim() });
  if (filters.documentFolder.trim()) chips.push({ key: "documentFolder", label: "Folder", value: filters.documentFolder.trim() });

  return chips;
}

function readFiltersFromSearchParams(params: Pick<URLSearchParams, "get">): LeadFilters {
  return {
    q: params.get("q") ?? "",
    source: params.get("source") ?? "",
    status: params.get("status") ?? "",
    lifecycle: params.get("lifecycle") ?? "active",
    priority: params.get("priority") ?? "",
    productTags: params.get("productTags") ?? "",
    title: params.get("title") ?? "",
    description: params.get("description") ?? "",
    fullName: params.get("fullName") ?? "",
    email: params.get("email") ?? "",
    phone: params.get("phone") ?? "",
    createdFrom: params.get("createdFrom") ?? "",
    createdTo: params.get("createdTo") ?? "",
    documentFolder: params.get("documentFolder") ?? "",
  };
}

function writeFiltersToSearchParams(params: URLSearchParams, filters: LeadFilters) {
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.source.trim()) params.set("source", filters.source.trim());
  if (filters.status.trim()) params.set("status", filters.status.trim());
  if (filters.lifecycle.trim() && filters.lifecycle !== "active") params.set("lifecycle", filters.lifecycle.trim());
  if (filters.priority.trim()) params.set("priority", filters.priority.trim());
  if (filters.productTags.trim()) params.set("productTags", filters.productTags.trim());
  if (filters.title.trim()) params.set("title", filters.title.trim());
  if (filters.description.trim()) params.set("description", filters.description.trim());
  if (filters.fullName.trim()) params.set("fullName", filters.fullName.trim());
  if (filters.email.trim()) params.set("email", filters.email.trim());
  if (filters.phone.trim()) params.set("phone", filters.phone.trim());
  if (filters.createdFrom.trim()) params.set("createdFrom", filters.createdFrom.trim());
  if (filters.createdTo.trim()) params.set("createdTo", filters.createdTo.trim());
  if (filters.documentFolder.trim()) params.set("documentFolder", filters.documentFolder.trim());
}

function normalizeSortKey(value: string | null): LeadSortKey {
  const allowed: LeadSortKey[] = ["id", "title", "fullName", "email", "phone", "source", "status", "score", "priority", "createdAt", "updatedAt"];
  return allowed.includes(value as LeadSortKey) ? (value as LeadSortKey) : "updatedAt";
}

function buildLeadsCsv(items: Lead[]) {
  return [
    ["id", "title", "full_name", "email", "phone", "source", "status", "score", "priority", "tags", "notes", "created_at", "updated_at"],
    ...items.map((lead) => [
      lead.id,
      lead.title,
      lead.fullName ?? "",
      lead.email ?? "",
      lead.phone ?? "",
      lead.source ?? "",
      lead.status,
      String(lead.score),
      getPriority(lead).label,
      (lead.tags ?? []).join(", "),
      lead.notes ?? "",
      lead.createdAt,
      lead.updatedAt,
    ]),
  ]
    .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
    .join("\n");
}

function buildLeadPayload(form: LeadFormState) {
  return {
    title: form.title.trim(),
    fullName: form.fullName.trim() || undefined,
    associatedCompany: form.associatedCompany.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    source: form.source || undefined,
    status: form.status,
    score: Number(form.score) || 0,
    notes: form.notes.trim() || undefined,
    tags: parseTags(form.tags),
  };
}

function leadToForm(lead: Lead): LeadFormState {
  return {
    title: lead.title,
    fullName: lead.fullName ?? "",
    associatedCompany: lead.associatedCompany ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    source: lead.source ?? "",
    status: lead.status,
    score: String(lead.score ?? 0),
    notes: lead.notes ?? "",
    tags: (lead.tags ?? []).join(", "),
  };
}

export default function LeadsPage() {
  const companyId = getCompanyCookie();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [form, setForm] = useState<LeadFormState>(emptyLeadForm);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importCsv, setImportCsv] = useState(importSample);
  const [importSummary, setImportSummary] = useState<{
    createdCount: number;
    attemptedCount: number;
    errorCount: number;
  } | null>(null);
  const [leadSourceSettings, setLeadSourceSettings] = useState<LeadSourceSettings | null>(null);
  const [partners, setPartners] = useState<PartnerListResponse["items"]>([]);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const {
    columnVisibility: documentColumnVisibility,
    toggleColumn: toggleDocumentColumn,
    resetColumns: resetDocumentColumns,
  } = usePersistedColumnVisibility<RelatedDocumentColumnKey>({
    storageKey: leadDocumentColumnStorageKey,
    defaultVisibility: defaultDocumentColumnVisibility,
  });
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkSource, setBulkSource] = useState("");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const { productTags: crmProductTags, associatedCompanies } = useCrmFormSuggestions();
  const {
    tab,
    setTab,
    filters,
    setFilters,
    filterDraft,
    setFilterDraft,
    page,
    setPage,
    limit,
    setLimit,
    sortBy,
    sortDir,
    columnVisibility,
    applyFilterDraft,
    clearFilterDraft,
    removeAppliedFilter,
    toggleColumn,
    resetColumns,
    requestSort,
  } = useCrmListState<LeadFilters, LeadSortKey, Exclude<LeadColumnKey, "actions">>({
    defaultFilters: emptyFilters,
    defaultSortBy: "updatedAt",
    defaultSortDir: "desc",
    defaultLimit: rowsPerPageOptions[0],
    rowsPerPageOptions,
    parseFilters: readFiltersFromSearchParams,
    writeFilters: writeFiltersToSearchParams,
    normalizeSortBy: normalizeSortKey,
    columnStorageKey: leadColumnStorageKey,
    defaultColumnVisibility: defaultLeadColumnVisibility,
    lockedColumns: lockedLeadColumns,
  });

  const activeFilterChips = useMemo(
    () =>
      getFilterChips(filters).filter((chip) =>
        tab === "documents" ? chip.key === "q" || chip.key === "documentFolder" : chip.key !== "documentFolder",
      ),
    [filters, tab],
  );

  const loadReferenceData = useCallback(async () => {
    try {
      const [sources, partnerData] = await Promise.all([
        apiRequest<LeadSourceSettings>("/settings/lead-sources"),
        apiRequest<PartnerListResponse>("/partners"),
      ]);
      setLeadSourceSettings(sources);
      setPartners(partnerData.items.filter((item) => item.status === "active"));
      setForm((current) => ({
        ...current,
        source: current.source || sources.leadSources[0]?.key || "",
      }));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load lead settings");
    }
  }, []);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.status.trim()) params.set("status", filters.status.trim());
    if (filters.lifecycle.trim()) params.set("lifecycle", filters.lifecycle.trim());
    if (filters.source.trim()) params.set("source", filters.source.trim());
    if (filters.priority.trim()) params.set("priority", filters.priority.trim());
    if (filters.productTags.trim()) params.set("productTags", filters.productTags.trim());
    if (filters.title.trim()) params.set("title", filters.title.trim());
    if (filters.description.trim()) params.set("description", filters.description.trim());
    if (filters.fullName.trim()) params.set("fullName", filters.fullName.trim());
    if (filters.email.trim()) params.set("email", filters.email.trim());
    if (filters.phone.trim()) params.set("phone", filters.phone.trim());
    if (filters.createdFrom.trim()) params.set("createdFrom", filters.createdFrom.trim());
    if (filters.createdTo.trim()) params.set("createdTo", filters.createdTo.trim());
    if (tab === "mine" && myUserId) params.set("assignedToUserId", myUserId);
    params.set("limit", String(limit));
    params.set("offset", String((page - 1) * limit));

    try {
      const response = await apiRequest<ListLeadResponse>(`/leads?${params.toString()}`);
      setLeads(response.items);
      setTotal(response.total);
      setSelectedLeadIds((current) => current.filter((id) => response.items.some((lead) => lead.id === id)));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load leads");
    } finally {
      setLoading(false);
    }
  }, [filters, limit, myUserId, page, tab]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("entityType", "lead");
    params.set("limit", String(limit));
    params.set("offset", String((page - 1) * limit));
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.documentFolder.trim()) params.set("folder", filters.documentFolder.trim());

    try {
      const response = await apiRequest<DocumentListResponse>(`/documents/list?${params.toString()}`);
      setDocuments(response.items);
      setTotal(response.total);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load lead documents");
    } finally {
      setLoading(false);
    }
  }, [filters.documentFolder, filters.q, limit, page]);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    void loadMe()
      .then((me) => setMyUserId(me.user.id))
      .catch(() => setMyUserId(null));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (tab === "documents") {
        void loadDocuments();
        return;
      }

      if (tab === "mine" && !myUserId) {
        return;
      }

      void loadLeads();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [loadDocuments, loadLeads, myUserId, tab]);

  const sortedLeads = useMemo(() => {
    const next = [...leads];
    next.sort((left, right) => compareValues(getLeadSortValue(left, sortBy), getLeadSortValue(right, sortBy), sortDir));
    return next;
  }, [leads, sortBy, sortDir]);

  const paginatedLeads = sortedLeads;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const closeModal = () => {
    setModalMode(null);
    setSelectedLead(null);
  };

  const openEditModal = (lead: Lead) => {
    setSelectedLead(lead);
    setForm(leadToForm(lead));
    setModalMode("edit");
  };

  const openDeleteModal = (lead: Lead) => {
    setSelectedLead(lead);
    setModalMode("delete");
  };

  const openPermanentDeleteModal = (lead: Lead) => {
    setSelectedLead(lead);
    setModalMode("permanentDelete");
  };

  const handleSort = (key: LeadSortKey) => {
    requestSort(key, key === "createdAt" || key === "updatedAt" ? "desc" : "asc");
  };

  const renderSortIcon = (key: LeadSortKey) => {
    return null;
  };

  const applyFilters = () => {
    applyFilterDraft();
    setModalMode(null);
  };

  const clearAllFilters = () => {
    setFilters(emptyFilters);
    setFilterDraft(emptyFilters);
  };

  const toggleLeadSelection = (leadId: string, checked: boolean) => {
    setSelectedLeadIds((current) => (checked ? [...new Set([...current, leadId])] : current.filter((id) => id !== leadId)));
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedLeadIds(checked ? (tab === "documents" ? [] : paginatedLeads.map((lead) => lead.id)) : []);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = buildLeadPayload(form);

      if (modalMode === "edit" && selectedLead) {
        await apiRequest(`/leads/${selectedLead.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Lead updated");
      } else {
        await apiRequest("/leads", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Lead created");
      }

      closeModal();
      await loadLeads();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to save lead";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedLead) return;

    setDeletingId(selectedLead.id);
    setError(null);

    try {
      await apiRequest(`/leads/${selectedLead.id}`, {
        method: "DELETE",
      });
      toast.success("Lead moved to trash");
      closeModal();
      await loadLeads();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to move lead to trash";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleRestore = async (lead: Lead) => {
    setDeletingId(lead.id);
    setError(null);

    try {
      await apiRequest(`/leads/${lead.id}/restore`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast.success("Lead restored");
      await loadLeads();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to restore lead";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!selectedLead) return;

    setDeletingId(selectedLead.id);
    setError(null);

    try {
      await apiRequest(`/leads/${selectedLead.id}/permanent`, {
        method: "DELETE",
      });
      toast.success("Lead deleted permanently");
      closeModal();
      await loadLeads();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to delete lead permanently";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedLeadIds];
    if (ids.length === 0) return;

    setDeletingId("bulk");
    setError(null);
    try {
      await Promise.all(
        ids.map((id) =>
          filters.lifecycle === "deleted"
            ? apiRequest(`/leads/${id}/permanent`, { method: "DELETE" })
            : apiRequest(`/leads/${id}`, { method: "DELETE" }),
        ),
      );
      toast.success(`${ids.length} lead${ids.length === 1 ? "" : "s"} ${filters.lifecycle === "deleted" ? "deleted permanently" : "moved to trash"}`);
      setSelectedLeadIds([]);
      setBulkDeleteOpen(false);
      await loadLeads();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to delete selected leads";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setImporting(true);
    setError(null);

    try {
      const result = await apiRequest<{
        createdCount: number;
        attemptedCount: number;
        errorCount: number;
      }>("/leads/import-csv", {
        method: "POST",
        body: JSON.stringify({ csv: importCsv }),
      });
      setImportSummary(result);
      toast.success("Lead import complete");
      await loadLeads();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to import leads";
      setError(message);
      toast.error(message);
    } finally {
      setImporting(false);
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedLeadIds.length === 0 || (!bulkStatus && !bulkSource)) return;

    setBulkUpdating(true);
    setError(null);
    try {
      await apiRequest("/leads/bulk-update", {
        method: "POST",
        body: JSON.stringify({
          leadIds: selectedLeadIds,
          ...(bulkStatus ? { status: bulkStatus } : {}),
          ...(bulkSource ? { source: bulkSource } : {}),
        }),
      });
      toast.success("Lead bulk update complete");
      setSelectedLeadIds([]);
      setBulkStatus("");
      setBulkSource("");
      await loadLeads();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to bulk update leads";
      setError(message);
      toast.error(message);
    } finally {
      setBulkUpdating(false);
    }
  };

  const leadColumns: Array<ColumnDefinition<Lead, Exclude<LeadColumnKey, "actions">, LeadSortKey>> = [
    {
      key: "id",
      label: leadColumnLabels.id,
      sortable: true,
      sortKey: "id",
      renderCell: (lead) => <span className="text-slate-600">{lead.id.slice(0, 6)}</span>,
    },
    {
      key: "title",
      label: leadColumnLabels.title,
      sortable: true,
      sortKey: "title",
      widthClassName: "min-w-[150px]",
      renderCell: (lead) => (
        <div className="min-w-[150px] max-w-[170px]">
          <Link href={`/dashboard/leads/${lead.id}`} className="block truncate font-medium text-slate-900 hover:text-sky-700 hover:underline">
            {lead.title}
          </Link>
          <div className="mt-1 truncate text-xs text-muted-foreground">{(lead.tags ?? []).slice(0, 2).join(", ") || "No tags"}</div>
        </div>
      ),
    },
    { key: "fullName", label: leadColumnLabels.fullName, sortable: true, sortKey: "fullName", widthClassName: "min-w-[130px]", renderCell: (lead) => <span className="block max-w-[130px] truncate text-slate-600">{lead.fullName ?? "-"}</span> },
    { key: "email", label: leadColumnLabels.email, sortable: true, sortKey: "email", widthClassName: "min-w-[150px]", renderCell: (lead) => <span className="block max-w-[150px] truncate text-slate-600">{lead.email ?? "-"}</span> },
    { key: "phone", label: leadColumnLabels.phone, sortable: true, sortKey: "phone", widthClassName: "min-w-[120px]", renderCell: (lead) => <span className="block max-w-[120px] truncate text-slate-600">{lead.phone ?? "-"}</span> },
    { key: "source", label: leadColumnLabels.source, sortable: true, sortKey: "source", widthClassName: "min-w-[120px]", renderCell: (lead) => <span className="block max-w-[120px] truncate text-slate-600">{lead.source ?? "-"}</span> },
    {
      key: "status",
      label: leadColumnLabels.status,
      sortable: true,
      sortKey: "status",
      renderCell: (lead) => (
        <Badge variant={getStatusTone(lead.status)} className="capitalize">
          {lead.status}
        </Badge>
      ),
    },
    {
      key: "score",
      label: leadColumnLabels.score,
      sortable: true,
      sortKey: "score",
      renderCell: (lead) => <span className="font-medium text-slate-700">{lead.score}</span>,
    },
    {
      key: "priority",
      label: leadColumnLabels.priority,
      sortable: true,
      sortKey: "priority",
      renderCell: (lead) => {
        const priority = getPriority(lead);
        return <Badge variant={getPriorityTone(priority.key)}>{priority.label}</Badge>;
      },
    },
    { key: "createdAt", label: leadColumnLabels.createdAt, sortable: true, sortKey: "createdAt", renderCell: (lead) => <span className="text-slate-600">{formatDate(lead.createdAt)}</span> },
    { key: "updatedAt", label: leadColumnLabels.updatedAt, sortable: true, sortKey: "updatedAt", renderCell: (lead) => <span className="text-slate-600">{formatDateTime(lead.updatedAt)}</span> },
  ];

  const documentColumns = useMemo(() => createRelatedDocumentTableColumns(formatDateTime), []);

  const loadAllLeadsForExport = useCallback(async () => {
    const items: Lead[] = [];
    let nextOffset = 0;
    while (true) {
      const params = new URLSearchParams();
      params.set("limit", "100");
      params.set("offset", String(nextOffset));
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.status.trim()) params.set("status", filters.status.trim());
      if (filters.source.trim()) params.set("source", filters.source.trim());
      if (filters.priority.trim()) params.set("priority", filters.priority.trim());
      if (filters.productTags.trim()) params.set("productTags", filters.productTags.trim());
      if (filters.title.trim()) params.set("title", filters.title.trim());
      if (filters.description.trim()) params.set("description", filters.description.trim());
      if (filters.fullName.trim()) params.set("fullName", filters.fullName.trim());
      if (filters.email.trim()) params.set("email", filters.email.trim());
      if (filters.phone.trim()) params.set("phone", filters.phone.trim());
      if (filters.createdFrom.trim()) params.set("createdFrom", filters.createdFrom.trim());
      if (filters.createdTo.trim()) params.set("createdTo", filters.createdTo.trim());
      if (tab === "mine" && myUserId) params.set("assignedToUserId", myUserId);
      const response = await apiRequest<ListLeadResponse>(`/leads?${params.toString()}`, { skipCache: true });
      items.push(...response.items);
      nextOffset += response.items.length;
      if (response.items.length === 0 || nextOffset >= response.total) break;
    }
    return items;
  }, [filters, myUserId, tab]);

  const loadAllLeadDocumentsForExport = useCallback(async () => {
    const items: DocumentItem[] = [];
    let nextOffset = 0;
    while (true) {
      const params = new URLSearchParams();
      params.set("entityType", "lead");
      params.set("limit", "100");
      params.set("offset", String(nextOffset));
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.documentFolder.trim()) params.set("folder", filters.documentFolder.trim());
      const response = await apiRequest<DocumentListResponse>(`/documents/list?${params.toString()}`, { skipCache: true });
      items.push(...response.items);
      nextOffset += response.items.length;
      if (response.items.length === 0 || nextOffset >= response.total) break;
    }
    return items;
  }, [filters.documentFolder, filters.q]);

  const handleExport = async () => {
    try {
      const csv =
        tab === "documents"
          ? buildDocumentsCsv(await loadAllLeadDocumentsForExport())
          : buildLeadsCsv(await loadAllLeadsForExport());
      downloadCsvFile(csv, tab === "documents" ? "lead-documents.csv" : "leads.csv");
      toast.success(tab === "documents" ? "Documents exported" : "Leads exported");
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to export data";
      setError(message);
      toast.error(message);
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    setDeletingId(documentId);
    setError(null);
    try {
      await apiRequest(`/documents/${documentId}`, { method: "DELETE" });
      toast.success("Document deleted");
      await loadDocuments();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to delete document";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="grid gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {importSummary ? (
        <Alert>
          <AlertTitle>CSV import complete</AlertTitle>
          <AlertDescription>
            Created {importSummary.createdCount} of {importSummary.attemptedCount} rows.{" "}
            {importSummary.errorCount > 0 ? `${importSummary.errorCount} rows need correction.` : "No row errors returned."}
          </AlertDescription>
        </Alert>
      ) : null}

      <CrmListPageHeader
        title="Leads"
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleExport()}>
              <Download className="size-4" /> Export
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setModalMode("import")}>
              <Import className="size-4" /> Import
            </Button>
            <Button type="button" size="sm" asChild>
              <Link href="/dashboard/leads/new">
                <Plus className="size-4" /> Create
              </Link>
            </Button>
          </>
        }
      />

      <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-white shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
        <div className="px-4 pt-3">
          <CrmListViewTabs
            value={tab}
            onValueChange={setTab}
            labels={{ all: "All Leads", mine: "My Leads", documents: "Uploaded Docs" }}
          />
        </div>

        <CrmListToolbar
          searchValue={filters.q}
          searchPlaceholder={tab === "documents" ? "Search uploaded documents" : "Search by title, name, email, or phone"}
          onSearchChange={(value) => {
            setPage(1);
            setFilters((current) => ({ ...current, q: value }));
            setFilterDraft((current) => ({ ...current, q: value }));
          }}
          onOpenFilters={() => setModalMode("filter")}
          filterCount={activeFilterChips.length}
          onOpenColumns={() => setColumnSettingsOpen(true)}
          onRefresh={() => {
            if (tab === "documents") {
              void loadDocuments();
              return;
            }
            void loadLeads();
          }}
          extraContent={
            tab !== "documents" && filters.lifecycle !== "deleted" ? (
              <>
                <NativeSelect value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)} className="h-10 w-44 rounded-xl px-3 text-sm">
                  <option value="">Keep current status</option>
                  {leadStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </NativeSelect>
                <NativeSelect value={bulkSource} onChange={(event) => setBulkSource(event.target.value)} className="h-10 w-44 rounded-xl px-3 text-sm">
                  <option value="">Keep current source</option>
                  {(leadSourceSettings?.leadSources ?? []).map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}
                </NativeSelect>
                <Button type="button" disabled={bulkUpdating || selectedLeadIds.length === 0 || (!bulkStatus && !bulkSource)} onClick={() => void handleBulkUpdate()}>
                  {bulkUpdating ? "Updating..." : "Apply bulk update"}
                </Button>
              </>
            ) : null
          }
          selectionBar={
            tab !== "documents" ? (
              <CrmBulkSelectionBar
                selectedCount={selectedLeadIds.length}
                allVisibleSelected={paginatedLeads.length > 0 && paginatedLeads.every((lead) => selectedLeadIds.includes(lead.id))}
                onToggleAllVisible={toggleSelectAllVisible}
                onClose={() => setSelectedLeadIds([])}
                onDelete={() => setBulkDeleteOpen(true)}
                deleteDisabled={deletingId === "bulk"}
              />
            ) : null
          }
        />

        <CrmAppliedFiltersBar chips={activeFilterChips} onRemove={removeAppliedFilter} onClear={clearAllFilters} />

        {tab === "documents" ? (
          <RelatedDocumentsTable
            columns={documentColumns}
            rows={documents}
            loading={loading}
            columnVisibility={documentColumnVisibility}
            companyId={companyId}
            deletingId={deletingId}
            onDelete={handleDeleteDocument}
          />
        ) : (
          <CrmDataTable
            columns={leadColumns}
            rows={paginatedLeads}
            rowKey={(lead) => lead.id}
            loading={loading}
            emptyLabel="No leads found."
            columnVisibility={columnVisibility}
            selectable
            selectedRowIds={selectedLeadIds}
            onToggleRow={toggleLeadSelection}
            onToggleAllVisible={toggleSelectAllVisible}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
            actionColumn={{
              header: "Actions",
              renderCell: (lead) => (
                <div className="flex items-center gap-2">
                  {filters.lifecycle === "deleted" ? (
                    <>
                      <Button type="button" variant="ghost" size="sm" className="rounded-lg" onClick={() => void handleRestore(lead)} disabled={deletingId === lead.id}>
                        Restore
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="rounded-lg text-rose-600 hover:text-rose-700" onClick={() => openPermanentDeleteModal(lead)} disabled={deletingId === lead.id}>
                        Delete permanently
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" variant="ghost" size="icon" className="size-8 rounded-lg" onClick={() => openEditModal(lead)}>
                        <PencilLine className="size-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8 rounded-lg text-rose-600 hover:text-rose-700" onClick={() => openDeleteModal(lead)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              ),
            }}
          />
        )}

        <CrmPaginationBar
          limit={limit}
          onLimitChange={(value) => {
            setLimit(value);
            setPage(1);
          }}
          rowsPerPageOptions={rowsPerPageOptions}
          total={total}
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
        />
      </section>

      {modalMode === "edit" ? (
        <CrmModalShell
          open
          title="Edit Lead"
          description="Update the selected lead record."
          onClose={closeModal}
          headerActions={
            <Button type="submit" form="lead-form" size="xs" disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          }
        >
          <form id="lead-form" onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-4 rounded-2xl border border-border/60 bg-slate-50/70 p-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Lead basics</div>
                <p className="text-xs text-muted-foreground">The table and modal use the same lead fields shown in the list.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field className="md:col-span-2">
                  <FieldLabel>Title / Designation</FieldLabel>
                  <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="h-10 text-sm" placeholder="eg: Head of Procurement" required />
                </Field>
                <Field>
                  <FieldLabel>Lead Name</FieldLabel>
                  <Input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} className="h-10 text-sm" placeholder="Full name" />
                </Field>
                <SuggestionInputField label="Associated Company" value={form.associatedCompany} suggestions={associatedCompanies} onChange={(value) => setForm((current) => ({ ...current, associatedCompany: value }))} placeholder="Start typing a company" />
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="h-10 text-sm" placeholder="name@example.com" />
                </Field>
                <Field>
                  <FieldLabel>Mobile Phone</FieldLabel>
                  <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="h-10 text-sm" placeholder="+91 9876543210" />
                </Field>
                <Field>
                  <FieldLabel>Source</FieldLabel>
                  <NativeSelect value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
                    <option value="">Select source</option>
                    {(leadSourceSettings?.leadSources ?? []).map((source) => (
                      <option key={source.key} value={source.key}>
                        {source.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Lead Status</FieldLabel>
                  <NativeSelect value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as LeadStatus }))} className="h-10 rounded-xl px-3 text-sm">
                    {leadStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Score</FieldLabel>
                  <Input value={form.score} onChange={(event) => setForm((current) => ({ ...current, score: event.target.value }))} className="h-10 text-sm" type="number" min={0} />
                </Field>
                <Field>
                  <FieldLabel>Partner Pool</FieldLabel>
                  <div className="flex h-10 items-center rounded-xl border border-input bg-slate-50 px-3 text-sm text-muted-foreground">
                    {partners.length} active partners available
                  </div>
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Tags</FieldLabel>
                  <Input value={form.tags} list="lead-product-tags" onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} className="h-10 text-sm" placeholder="enterprise, inbound, high priority" />
                  <datalist id="lead-product-tags">
                    {crmProductTags.map((tag) => (
                      <option key={tag} value={tag} />
                    ))}
                  </datalist>
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Notes</FieldLabel>
                  <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-28 text-sm" placeholder="Add context for the lead" />
                </Field>
              </div>
            </div>
          </form>
        </CrmModalShell>
      ) : null}

      {modalMode === "import" ? (
        <CrmModalShell
          open
          title="Import Leads"
          description="Paste CSV rows to create leads in bulk."
          onClose={closeModal}
          headerActions={
            <Button type="submit" form="lead-import-form" size="xs" disabled={importing}>
              {importing ? "Importing..." : "Import"}
            </Button>
          }
        >
          <form id="lead-import-form" onSubmit={handleImport} className="grid gap-4">
            <Field>
              <FieldLabel>CSV payload</FieldLabel>
              <Textarea value={importCsv} onChange={(event) => setImportCsv(event.target.value)} className="min-h-72 font-mono text-xs" />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setImportCsv(importSample)}>
                Reset sample
              </Button>
            </div>
          </form>
        </CrmModalShell>
      ) : null}

      {modalMode === "delete" && selectedLead ? (
        <CrmModalShell open title="Move Lead To Trash" description={`${selectedLead.title} will be removed from active records.`} onClose={closeModal} maxWidthClassName="max-w-xl">
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">You can restore this lead later from the deleted filter.</p>
            <div className="flex gap-2">
              <Button type="button" variant="destructive" onClick={() => void handleDelete()} disabled={deletingId === selectedLead.id}>
                {deletingId === selectedLead.id ? "Moving..." : "Move to trash"}
              </Button>
              <Button type="button" variant="outline" className="hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700" onClick={closeModal}>
                Cancel
              </Button>
            </div>
          </div>
        </CrmModalShell>
      ) : null}

      {modalMode === "permanentDelete" && selectedLead ? (
        <CrmModalShell open title="Delete Lead Permanently" description={`${selectedLead.title} will be removed permanently.`} onClose={closeModal} maxWidthClassName="max-w-xl">
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            <div className="flex gap-2">
              <Button type="button" variant="destructive" onClick={() => void handlePermanentDelete()} disabled={deletingId === selectedLead.id}>
                {deletingId === selectedLead.id ? "Deleting..." : "Delete permanently"}
              </Button>
              <Button type="button" variant="outline" className="hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700" onClick={closeModal}>
                Cancel
              </Button>
            </div>
          </div>
        </CrmModalShell>
      ) : null}

      <CrmModalShell
        open={bulkDeleteOpen}
        title={filters.lifecycle === "deleted" ? "Delete Selected Leads Permanently" : "Move Selected Leads To Trash"}
        description={`${selectedLeadIds.length} lead${selectedLeadIds.length === 1 ? "" : "s"} selected.`}
        onClose={() => setBulkDeleteOpen(false)}
        maxWidthClassName="max-w-xl"
      >
        <div className="grid gap-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {filters.lifecycle === "deleted" ? "This action cannot be undone." : "Selected leads will move to the deleted view and can be restored later."}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700" onClick={() => setBulkDeleteOpen(false)} disabled={deletingId === "bulk"}>Close</Button>
            <Button type="button" onClick={() => void handleBulkDelete()} disabled={deletingId === "bulk"}>
              {deletingId === "bulk" ? "Working..." : filters.lifecycle === "deleted" ? "Delete permanently" : "Move to trash"}
            </Button>
          </div>
        </div>
      </CrmModalShell>

      <CrmFilterDrawer
        open={modalMode === "filter"}
        title="Filter"
        description={tab === "documents" ? "Shape the uploaded docs table." : "Shape the lead table with focused filters."}
        onClose={closeModal}
        onClear={clearFilterDraft}
        onApply={applyFilters}
      >
        <div className="grid gap-4">
          <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-slate-50/70 p-4">
            <div className="text-sm font-semibold text-slate-900">Search</div>
            <Field>
              <FieldLabel>Search term</FieldLabel>
              <Input value={filterDraft.q} onChange={(event) => setFilterDraft((current) => ({ ...current, q: event.target.value }))} className="h-10 text-sm" placeholder={tab === "documents" ? "Filename" : "Title, name, email, or phone"} />
            </Field>
            {tab === "documents" ? (
              <Field>
                <FieldLabel>Folder</FieldLabel>
                <Input value={filterDraft.documentFolder} onChange={(event) => setFilterDraft((current) => ({ ...current, documentFolder: event.target.value }))} className="h-10 text-sm" placeholder="general" />
              </Field>
            ) : (
              <>
                <Field>
                  <FieldLabel>Full Name</FieldLabel>
                  <Input value={filterDraft.fullName} onChange={(event) => setFilterDraft((current) => ({ ...current, fullName: event.target.value }))} className="h-10 text-sm" placeholder="Filter by full name" />
                </Field>
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input value={filterDraft.email} onChange={(event) => setFilterDraft((current) => ({ ...current, email: event.target.value }))} className="h-10 text-sm" placeholder="Filter by email" />
                </Field>
                <Field>
                  <FieldLabel>Phone</FieldLabel>
                  <Input value={filterDraft.phone} onChange={(event) => setFilterDraft((current) => ({ ...current, phone: event.target.value }))} className="h-10 text-sm" placeholder="Filter by phone" />
                </Field>
              </>
            )}
          </div>

          {tab !== "documents" ? (
            <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Lead details</div>
              <Field>
                <FieldLabel>Job Title</FieldLabel>
                <Input value={filterDraft.title} onChange={(event) => setFilterDraft((current) => ({ ...current, title: event.target.value }))} className="h-10 text-sm" placeholder="Head of Procurement" />
              </Field>
              <Field>
                <FieldLabel>Description / Notes</FieldLabel>
                <Input value={filterDraft.description} onChange={(event) => setFilterDraft((current) => ({ ...current, description: event.target.value }))} className="h-10 text-sm" placeholder="Filter notes content" />
              </Field>
              <Field>
                <FieldLabel>Product Tags</FieldLabel>
                <Input value={filterDraft.productTags} onChange={(event) => setFilterDraft((current) => ({ ...current, productTags: event.target.value }))} className="h-10 text-sm" placeholder="enterprise, inbound" />
              </Field>
              <Field>
                <FieldLabel>Source</FieldLabel>
                <NativeSelect value={filterDraft.source} onChange={(event) => setFilterDraft((current) => ({ ...current, source: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
                  <option value="">All sources</option>
                  {(leadSourceSettings?.leadSources ?? []).map((source) => (
                    <option key={source.key} value={source.key}>
                      {source.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Lead Status</FieldLabel>
                <NativeSelect value={filterDraft.status} onChange={(event) => setFilterDraft((current) => ({ ...current, status: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
                  <option value="">All statuses</option>
                  {leadStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Priority</FieldLabel>
                <NativeSelect value={filterDraft.priority} onChange={(event) => setFilterDraft((current) => ({ ...current, priority: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
                  <option value="">All priorities</option>
                  <option value="hot">Hot</option>
                  <option value="warm">Warm</option>
                  <option value="nurture">Nurture</option>
                  <option value="cold">Cold</option>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Record State</FieldLabel>
                <NativeSelect value={filterDraft.lifecycle} onChange={(event) => setFilterDraft((current) => ({ ...current, lifecycle: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
                  <option value="active">Active</option>
                  <option value="deleted">Deleted</option>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Created From</FieldLabel>
                <Input type="date" value={filterDraft.createdFrom} onChange={(event) => setFilterDraft((current) => ({ ...current, createdFrom: event.target.value }))} className="h-10 text-sm" />
              </Field>
              <Field>
                <FieldLabel>Created To</FieldLabel>
                <Input type="date" value={filterDraft.createdTo} onChange={(event) => setFilterDraft((current) => ({ ...current, createdTo: event.target.value }))} className="h-10 text-sm" />
              </Field>
            </div>
          ) : null}
        </div>
      </CrmFilterDrawer>

      {tab === "documents" ? (
        <CrmColumnSettings
          open={columnSettingsOpen}
          description="Choose which lead document columns stay visible."
          columns={relatedDocumentColumns.map((column) => ({ key: column.key, label: column.label }))}
          columnVisibility={documentColumnVisibility}
          onToggleColumn={toggleDocumentColumn}
          onReset={resetDocumentColumns}
          onClose={() => setColumnSettingsOpen(false)}
        />
      ) : (
        <CrmColumnSettings
          open={columnSettingsOpen}
          description="Choose which lead columns stay visible in the table."
          columns={leadColumns.map((column) => ({ key: column.key, label: column.label }))}
          columnVisibility={columnVisibility}
          lockedColumns={lockedLeadColumns}
          onToggleColumn={toggleColumn}
          onReset={resetColumns}
          onClose={() => setColumnSettingsOpen(false)}
        />
      )}
    </div>
  );
}
