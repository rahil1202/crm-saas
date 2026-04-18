"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Import, PencilLine, Plus, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

import {
  CrmAppliedFiltersBar,
  CrmColumnSettings,
  CrmDataTable,
  CrmFilterDrawer,
  CrmListPageHeader,
  CrmListToolbar,
  CrmListViewTabs,
  CrmModalShell,
  CrmPaginationBar,
} from "@/components/crm/crm-list-primitives";
import { downloadCsvFile, toCsvCell } from "@/components/crm/csv-export";
import type { ColumnDefinition } from "@/components/crm/types";
import { useCrmListState, usePersistedColumnVisibility } from "@/components/crm/use-crm-list-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest, buildApiUrl } from "@/lib/api";
import { getCompanyCookie } from "@/lib/cookies";
import { loadMe } from "@/lib/me-cache";

type DealStatus = "open" | "won" | "lost";
type SortDirection = "asc" | "desc";
type ModalMode = "create" | "edit" | "delete" | "filter" | null;
type DealSortKey =
  | "title"
  | "amount"
  | "priority"
  | "stage"
  | "closedDate"
  | "type"
  | "owner"
  | "referralSource"
  | "pipeline"
  | "status";
type DealColumnKey = DealSortKey | "actions";
type DealColumnVisibility = Record<DealColumnKey, boolean>;
type DocumentColumnKey = "name" | "folder" | "type" | "size" | "createdAt";
type DocumentColumnVisibility = Record<DocumentColumnKey, boolean>;

interface Deal {
  id: string;
  title: string;
  status: DealStatus;
  pipeline: string;
  stage: string;
  value: number;
  dealType: string | null;
  priority: string | null;
  referralSource: string | null;
  ownerLabel: string | null;
  productTags: string[];
  expectedCloseDate: string | null;
  partnerCompanyId: string | null;
  assignedToUserId: string | null;
  customerId: string | null;
  leadId: string | null;
  notes: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  items: Deal[];
  total: number;
  limit: number;
  offset: number;
}

interface DocumentItem {
  id: string;
  entityType: "general" | "lead" | "deal" | "customer";
  entityId: string | null;
  folder: string;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
}

interface DocumentListResponse {
  items: DocumentItem[];
  total: number;
}

interface PipelineSettings {
  defaultDealPipeline: string;
  dealPipelines: Array<{
    key: string;
    label: string;
    stages: Array<{
      key: string;
      label: string;
    }>;
  }>;
}

interface PartnerListResponse {
  items: Array<{
    id: string;
    name: string;
    status: "active" | "inactive";
  }>;
}

interface ContactListResponse {
  items: Array<{
    id: string;
    fullName: string;
  }>;
}

interface LeadListResponse {
  items: Array<{
    id: string;
    title: string;
  }>;
}

type DealFormState = {
  title: string;
  pipeline: string;
  stage: string;
  status: DealStatus;
  value: string;
  expectedCloseDate: string;
  partnerCompanyId: string;
  customerId: string;
  leadId: string;
  dealType: string;
  priority: string;
  referralSource: string;
  productTags: string;
  ownerLabel: string;
  notes: string;
};

type DealFilters = {
  q: string;
  status: string;
  pipeline: string;
  stage: string;
  documentFolder: string;
};

type DealFilterKey = keyof DealFilters;

type DealFilterChip = {
  key: DealFilterKey;
  label: string;
  value: string;
};

const rowsPerPageOptions = [10, 20, 50, 100] as const;
const dealColumnStorageKey = "crm-saas-deals-columns";
const dealDocumentColumnStorageKey = "crm-saas-deal-documents-columns";
const dealStatuses: DealStatus[] = ["open", "won", "lost"];

const emptyFilters: DealFilters = {
  q: "",
  status: "",
  pipeline: "",
  stage: "",
  documentFolder: "",
};

const emptyDealForm: DealFormState = {
  title: "",
  pipeline: "",
  stage: "",
  status: "open",
  value: "0",
  expectedCloseDate: "",
  partnerCompanyId: "",
  customerId: "",
  leadId: "",
  dealType: "",
  priority: "",
  referralSource: "",
  productTags: "",
  ownerLabel: "",
  notes: "",
};

const dealColumnLabels: Record<DealSortKey, string> = {
  title: "Deal Name",
  amount: "Deal Amount",
  priority: "Priority",
  stage: "Deal Stage",
  closedDate: "Closed Date",
  type: "Type",
  owner: "Deal Owner",
  referralSource: "Referral Source",
  pipeline: "Pipeline",
  status: "Status",
};

const defaultDealColumnVisibility: DealColumnVisibility = {
  title: true,
  amount: true,
  priority: true,
  stage: true,
  closedDate: true,
  type: true,
  owner: true,
  referralSource: true,
  pipeline: true,
  status: true,
  actions: true,
};

const defaultDocumentColumnVisibility: DocumentColumnVisibility = {
  name: true,
  folder: true,
  type: true,
  size: true,
  createdAt: true,
};

const dealColumnOrder: DealColumnKey[] = [
  "title",
  "amount",
  "priority",
  "stage",
  "closedDate",
  "type",
  "owner",
  "referralSource",
  "pipeline",
  "status",
  "actions",
];

const lockedDealColumns: Exclude<DealColumnKey, "actions">[] = ["title"];

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatFileSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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

function parseNoteField(notes: string | null | undefined, label: string) {
  const raw = notes ?? "";
  const match = raw.match(new RegExp(`^${label}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() ?? "";
}

function buildNotes(form: DealFormState) {
  const lines = [
    ["Deal Type", form.dealType],
    ["Priority", form.priority],
    ["Referral Source", form.referralSource],
    ["Product Tags", form.productTags],
    ["Deal Owner", form.ownerLabel],
  ]
    .filter(([, value]) => value.trim())
    .map(([label, value]) => `${label}: ${value}`);

  return [form.notes.trim(), lines.length ? lines.join("\n") : null].filter(Boolean).join("\n\n");
}

function parseTags(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function dealToForm(deal: Deal): DealFormState {
  return {
    title: deal.title,
    pipeline: deal.pipeline,
    stage: deal.stage,
    status: deal.status,
    value: String(deal.value),
    expectedCloseDate: deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toISOString().slice(0, 10) : "",
    partnerCompanyId: deal.partnerCompanyId ?? "",
    customerId: deal.customerId ?? "",
    leadId: deal.leadId ?? "",
    dealType: deal.dealType ?? parseNoteField(deal.notes, "Deal Type"),
    priority: deal.priority ?? parseNoteField(deal.notes, "Priority"),
    referralSource: deal.referralSource ?? parseNoteField(deal.notes, "Referral Source"),
    productTags: (deal.productTags ?? []).join(", ") || parseNoteField(deal.notes, "Product Tags"),
    ownerLabel: deal.ownerLabel ?? parseNoteField(deal.notes, "Deal Owner"),
    notes: deal.notes ?? "",
  };
}

function getFilterChips(filters: DealFilters) {
  const chips: DealFilterChip[] = [];

  if (filters.q.trim()) chips.push({ key: "q", label: "Search", value: filters.q.trim() });
  if (filters.status.trim()) chips.push({ key: "status", label: "Status", value: filters.status.trim() });
  if (filters.pipeline.trim()) chips.push({ key: "pipeline", label: "Pipeline", value: filters.pipeline.trim() });
  if (filters.stage.trim()) chips.push({ key: "stage", label: "Stage", value: filters.stage.trim() });
  if (filters.documentFolder.trim()) chips.push({ key: "documentFolder", label: "Folder", value: filters.documentFolder.trim() });

  return chips;
}

function readFiltersFromSearchParams(params: Pick<URLSearchParams, "get">): DealFilters {
  return {
    q: params.get("q") ?? "",
    status: params.get("status") ?? "",
    pipeline: params.get("pipeline") ?? "",
    stage: params.get("stage") ?? "",
    documentFolder: params.get("documentFolder") ?? "",
  };
}

function writeFiltersToSearchParams(params: URLSearchParams, filters: DealFilters) {
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.status.trim()) params.set("status", filters.status.trim());
  if (filters.pipeline.trim()) params.set("pipeline", filters.pipeline.trim());
  if (filters.stage.trim()) params.set("stage", filters.stage.trim());
  if (filters.documentFolder.trim()) params.set("documentFolder", filters.documentFolder.trim());
}

function normalizeSortKey(value: string | null): DealSortKey {
  const allowed: DealSortKey[] = ["title", "amount", "priority", "stage", "closedDate", "type", "owner", "referralSource", "pipeline", "status"];
  return allowed.includes(value as DealSortKey) ? (value as DealSortKey) : "closedDate";
}

function buildDealsCsv(items: Deal[]) {
  return [
    ["id", "title", "status", "pipeline", "stage", "value", "deal_type", "priority", "referral_source", "owner_label", "expected_close_date", "notes", "created_at", "updated_at"],
    ...items.map((deal) => [
      deal.id,
      deal.title,
      deal.status,
      deal.pipeline,
      deal.stage,
      String(deal.value),
      deal.dealType ?? "",
      deal.priority ?? "",
      deal.referralSource ?? "",
      deal.ownerLabel ?? "",
      deal.expectedCloseDate ?? "",
      deal.notes ?? "",
      deal.createdAt,
      deal.updatedAt,
    ]),
  ]
    .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
    .join("\n");
}

function buildDocumentsCsv(items: DocumentItem[]) {
  return [
    ["file_name", "folder", "entity_type", "entity_id", "mime_type", "size_bytes", "created_at"],
    ...items.map((document) => [
      document.originalName,
      document.folder,
      document.entityType,
      document.entityId ?? "",
      document.mimeType ?? "",
      String(document.sizeBytes),
      document.createdAt,
    ]),
  ]
    .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
    .join("\n");
}

export default function DealsPage() {
  const companyId = getCompanyCookie();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [form, setForm] = useState<DealFormState>(emptyDealForm);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pipelineSettings, setPipelineSettings] = useState<PipelineSettings | null>(null);
  const [partners, setPartners] = useState<PartnerListResponse["items"]>([]);
  const [contacts, setContacts] = useState<ContactListResponse["items"]>([]);
  const [leadOptions, setLeadOptions] = useState<LeadListResponse["items"]>([]);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const {
    columnVisibility: documentColumnVisibility,
    toggleColumn: toggleDocumentColumn,
    resetColumns: resetDocumentColumns,
  } = usePersistedColumnVisibility<DocumentColumnKey>({
    storageKey: dealDocumentColumnStorageKey,
    defaultVisibility: defaultDocumentColumnVisibility,
  });
  const [selectedDealIds, setSelectedDealIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkPipeline, setBulkPipeline] = useState("");
  const [bulkStage, setBulkStage] = useState("");
  const [bulkUpdating, setBulkUpdating] = useState(false);
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
    removeAppliedFilter,
    toggleColumn,
    resetColumns,
    requestSort,
  } = useCrmListState<DealFilters, DealSortKey, Exclude<DealColumnKey, "actions">>({
    defaultFilters: emptyFilters,
    defaultSortBy: "closedDate",
    defaultSortDir: "desc",
    defaultLimit: rowsPerPageOptions[0],
    rowsPerPageOptions,
    parseFilters: readFiltersFromSearchParams,
    writeFilters: writeFiltersToSearchParams,
    normalizeSortBy: normalizeSortKey,
    columnStorageKey: dealColumnStorageKey,
    defaultColumnVisibility: defaultDealColumnVisibility,
    lockedColumns: lockedDealColumns,
  });

  const activePipeline =
    pipelineSettings?.dealPipelines.find((pipeline) => pipeline.key === (form.pipeline || pipelineSettings.defaultDealPipeline)) ?? null;
  const activeFilterChips = useMemo(
    () =>
      getFilterChips(filters).filter((chip) =>
        tab === "documents" ? chip.key === "q" || chip.key === "documentFolder" : chip.key !== "documentFolder",
      ),
    [filters, tab],
  );

  const loadReferenceData = useCallback(async () => {
    try {
      const [pipelineData, partnerData, contactData, leadData] = await Promise.all([
        apiRequest<PipelineSettings>("/settings/pipelines"),
        apiRequest<PartnerListResponse>("/partners"),
        apiRequest<ContactListResponse>("/customers?limit=100&offset=0"),
        apiRequest<LeadListResponse>("/leads?limit=100&offset=0"),
      ]);

      setPipelineSettings(pipelineData);
      setPartners(partnerData.items.filter((item) => item.status === "active"));
      setContacts(contactData.items);
      setLeadOptions(leadData.items);

      const defaultPipeline =
        pipelineData.dealPipelines.find((pipeline) => pipeline.key === pipelineData.defaultDealPipeline) ??
        pipelineData.dealPipelines[0];

      setForm((current) => ({
        ...current,
        pipeline: current.pipeline || defaultPipeline?.key || "",
        stage: current.stage || defaultPipeline?.stages[0]?.key || "",
      }));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load deal settings");
    }
  }, []);

  const loadDeals = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.status.trim()) params.set("status", filters.status.trim());
    if (filters.pipeline.trim()) params.set("pipeline", filters.pipeline.trim());
    if (tab === "mine" && myUserId) params.set("assignedToUserId", myUserId);
    params.set("limit", String(limit));
    params.set("offset", String((page - 1) * limit));

    try {
      const response = await apiRequest<ListResponse>(`/deals?${params.toString()}`);
      let items = response.items;

      if (filters.stage.trim()) {
        const stageNeedle = filters.stage.trim().toLowerCase();
        items = items.filter((deal) => deal.stage.toLowerCase().includes(stageNeedle));
      }

      setDeals(items);
      setTotal(response.total);
      setSelectedDealIds((current) => current.filter((id) => items.some((deal) => deal.id === id)));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load deals");
    } finally {
      setLoading(false);
    }
  }, [filters, limit, myUserId, page, tab]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("entityType", "deal");
    params.set("limit", String(limit));
    params.set("offset", String((page - 1) * limit));
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.documentFolder.trim()) params.set("folder", filters.documentFolder.trim());

    try {
      const response = await apiRequest<DocumentListResponse>(`/documents/list?${params.toString()}`);
      setDocuments(response.items);
      setTotal(response.total);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load deal documents");
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

      void loadDeals();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [loadDeals, loadDocuments, myUserId, tab]);

  const sortedDeals = useMemo(() => {
    const getSortValue = (deal: Deal) => {
      switch (sortBy) {
        case "title":
          return deal.title;
        case "amount":
          return deal.value;
        case "priority":
          return deal.priority ?? parseNoteField(deal.notes, "Priority");
        case "stage":
          return deal.stage;
        case "closedDate":
          return deal.expectedCloseDate ? new Date(deal.expectedCloseDate).getTime() : 0;
        case "type":
          return deal.dealType ?? parseNoteField(deal.notes, "Deal Type");
        case "owner":
          return deal.ownerLabel ?? parseNoteField(deal.notes, "Deal Owner") ?? deal.assignedToUserId ?? "";
        case "referralSource":
          return deal.referralSource ?? parseNoteField(deal.notes, "Referral Source");
        case "pipeline":
          return deal.pipeline;
        case "status":
          return deal.status;
        default:
          return "";
      }
    };

    const next = [...deals];
    next.sort((left, right) => compareValues(getSortValue(left), getSortValue(right), sortDir));
    return next;
  }, [deals, sortBy, sortDir]);

  const paginatedDeals = sortedDeals;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const closeModal = () => {
    setModalMode(null);
    setSelectedDeal(null);
  };

  const openCreateModal = () => {
    const defaultPipeline =
      pipelineSettings?.dealPipelines.find((pipeline) => pipeline.key === pipelineSettings.defaultDealPipeline) ??
      pipelineSettings?.dealPipelines[0];

    setForm({
      ...emptyDealForm,
      pipeline: defaultPipeline?.key ?? "",
      stage: defaultPipeline?.stages[0]?.key ?? "",
    });
    setSelectedDeal(null);
    setModalMode("create");
  };

  const openEditModal = (deal: Deal) => {
    setSelectedDeal(deal);
    setForm(dealToForm(deal));
    setModalMode("edit");
  };

  const openDeleteModal = (deal: Deal) => {
    setSelectedDeal(deal);
    setModalMode("delete");
  };

  const handleSort = (key: DealSortKey) => {
    requestSort(key, key === "amount" || key === "closedDate" ? "desc" : "asc");
  };

  const applyFilters = () => {
    applyFilterDraft();
    setModalMode(null);
  };

  const clearDealFilterDraft = () => {
    setFilterDraft(emptyFilters);
  };

  const clearAllFilters = () => {
    setFilters(emptyFilters);
    setFilterDraft(emptyFilters);
  };

  const toggleDealSelection = (dealId: string, checked: boolean) => {
    setSelectedDealIds((current) => (checked ? [...new Set([...current, dealId])] : current.filter((id) => id !== dealId)));
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedDealIds(checked ? paginatedDeals.map((deal) => deal.id) : []);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      title: form.title.trim(),
      pipeline: form.pipeline,
      stage: form.stage,
      status: form.status,
      value: Number(form.value) || 0,
      dealType: form.dealType.trim() || undefined,
      priority: form.priority.trim() || undefined,
      referralSource: form.referralSource.trim() || undefined,
      ownerLabel: form.ownerLabel.trim() || undefined,
      productTags: parseTags(form.productTags),
      expectedCloseDate: form.expectedCloseDate ? new Date(`${form.expectedCloseDate}T00:00:00.000Z`).toISOString() : undefined,
      partnerCompanyId: form.partnerCompanyId || undefined,
      customerId: form.customerId || undefined,
      leadId: form.leadId || undefined,
      notes: form.notes.trim() || undefined,
    };

    try {
      if (modalMode === "edit" && selectedDeal) {
        await apiRequest(`/deals/${selectedDeal.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Deal updated");
      } else {
        await apiRequest("/deals", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Deal created");
      }

      closeModal();
      await loadDeals();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to save deal";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDeal) return;

    setDeletingId(selectedDeal.id);
    setError(null);

    try {
      await apiRequest(`/deals/${selectedDeal.id}`, {
        method: "DELETE",
      });
      toast.success("Deal deleted");
      closeModal();
      await loadDeals();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to delete deal";
      setError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedDealIds.length === 0 || (!bulkStatus && !bulkPipeline && !bulkStage)) return;

    setBulkUpdating(true);
    setError(null);
    try {
      await apiRequest("/deals/bulk-update", {
        method: "POST",
        body: JSON.stringify({
          dealIds: selectedDealIds,
          ...(bulkStatus ? { status: bulkStatus } : {}),
          ...(bulkPipeline ? { pipeline: bulkPipeline } : {}),
          ...(bulkStage ? { stage: bulkStage } : {}),
        }),
      });
      toast.success("Deal bulk update complete");
      setSelectedDealIds([]);
      setBulkStatus("");
      setBulkPipeline("");
      setBulkStage("");
      await loadDeals();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to bulk update deals";
      setError(message);
      toast.error(message);
    } finally {
      setBulkUpdating(false);
    }
  };

  const dealColumns: Array<ColumnDefinition<Deal, Exclude<DealColumnKey, "actions">, DealSortKey>> = [
    {
      key: "title",
      label: dealColumnLabels.title,
      sortable: true,
      sortKey: "title",
      widthClassName: "min-w-[220px]",
      renderCell: (deal) => (
        <Link href={`/dashboard/deals/${deal.id}`} className="font-medium text-slate-900 hover:text-sky-700 hover:underline">
          {deal.title}
        </Link>
      ),
    },
    { key: "amount", label: dealColumnLabels.amount, sortable: true, sortKey: "amount", renderCell: (deal) => <span className="text-slate-600">{deal.value}</span> },
    {
      key: "priority",
      label: dealColumnLabels.priority,
      sortable: true,
      sortKey: "priority",
      renderCell: (deal) => <span className="text-slate-600">{deal.priority || parseNoteField(deal.notes, "Priority") || "-"}</span>,
    },
    { key: "stage", label: dealColumnLabels.stage, sortable: true, sortKey: "stage", renderCell: (deal) => <span className="text-slate-600">{deal.stage}</span> },
    {
      key: "closedDate",
      label: dealColumnLabels.closedDate,
      sortable: true,
      sortKey: "closedDate",
      renderCell: (deal) => <span className="text-slate-600">{formatDate(deal.expectedCloseDate)}</span>,
    },
    {
      key: "type",
      label: dealColumnLabels.type,
      sortable: true,
      sortKey: "type",
      renderCell: (deal) => <span className="text-slate-600">{deal.dealType || parseNoteField(deal.notes, "Deal Type") || "-"}</span>,
    },
    {
      key: "owner",
      label: dealColumnLabels.owner,
      sortable: true,
      sortKey: "owner",
      renderCell: (deal) => <span className="text-slate-600">{deal.ownerLabel || parseNoteField(deal.notes, "Deal Owner") || "-"}</span>,
    },
    {
      key: "referralSource",
      label: dealColumnLabels.referralSource,
      sortable: true,
      sortKey: "referralSource",
      renderCell: (deal) => <span className="text-slate-600">{deal.referralSource || parseNoteField(deal.notes, "Referral Source") || "-"}</span>,
    },
    { key: "pipeline", label: dealColumnLabels.pipeline, sortable: true, sortKey: "pipeline", renderCell: (deal) => <span className="text-slate-600">{deal.pipeline}</span> },
    {
      key: "status",
      label: dealColumnLabels.status,
      sortable: true,
      sortKey: "status",
      renderCell: (deal) => (
        <Badge variant={deal.status === "lost" ? "destructive" : deal.status === "won" ? "default" : "outline"} className="capitalize">
          {deal.status}
        </Badge>
      ),
    },
  ];

  const documentColumns: Array<ColumnDefinition<DocumentItem, DocumentColumnKey>> = [
    {
      key: "name",
      label: "File Name",
      widthClassName: "min-w-[280px]",
      renderCell: (document) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-900">{document.originalName}</div>
          <div className="mt-1 text-xs text-muted-foreground">{document.entityId ? document.entityId.slice(0, 8) : "Unlinked"}</div>
        </div>
      ),
    },
    { key: "folder", label: "Folder", renderCell: (document) => <span className="text-slate-600">{document.folder}</span> },
    {
      key: "type",
      label: "Type",
      renderCell: (document) => (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{document.entityType}</Badge>
          {document.mimeType ? <Badge variant="secondary">{document.mimeType}</Badge> : null}
        </div>
      ),
    },
    { key: "size", label: "Size", renderCell: (document) => <span className="text-slate-600">{formatFileSize(document.sizeBytes)}</span> },
    { key: "createdAt", label: "Uploaded", renderCell: (document) => <span className="text-slate-600">{formatDateTime(document.createdAt)}</span> },
  ];

  const loadAllDealsForExport = useCallback(async () => {
    const items: Deal[] = [];
    let nextOffset = 0;

    while (true) {
      const params = new URLSearchParams();
      params.set("limit", "100");
      params.set("offset", String(nextOffset));
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.status.trim()) params.set("status", filters.status.trim());
      if (filters.pipeline.trim()) params.set("pipeline", filters.pipeline.trim());
      if (tab === "mine" && myUserId) params.set("assignedToUserId", myUserId);

      const response = await apiRequest<ListResponse>(`/deals?${params.toString()}`, { skipCache: true });
      let pageItems = response.items;
      if (filters.stage.trim()) {
        const stageNeedle = filters.stage.trim().toLowerCase();
        pageItems = pageItems.filter((deal) => deal.stage.toLowerCase().includes(stageNeedle));
      }

      items.push(...pageItems);
      nextOffset += response.items.length;
      if (response.items.length === 0 || nextOffset >= response.total) break;
    }

    return items;
  }, [filters, myUserId, tab]);

  const loadAllDealDocumentsForExport = useCallback(async () => {
    const items: DocumentItem[] = [];
    let nextOffset = 0;

    while (true) {
      const params = new URLSearchParams();
      params.set("entityType", "deal");
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
          ? buildDocumentsCsv(await loadAllDealDocumentsForExport())
          : buildDealsCsv(await loadAllDealsForExport());
      downloadCsvFile(csv, tab === "documents" ? "deal-documents.csv" : "deals.csv");
      toast.success(tab === "documents" ? "Documents exported" : "Deals exported");
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

      <CrmListPageHeader
        title="Deals"
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleExport()}>
              <Download className="size-4" /> Export
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled title="Deal import is not available yet">
              <Import className="size-4" /> Import
            </Button>
            <Button type="button" size="sm" onClick={openCreateModal}>
              <Plus className="size-4" /> Create
            </Button>
          </>
        }
      />

      <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-white shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
        <div className="px-4 pt-3">
          <CrmListViewTabs
            value={tab}
            onValueChange={setTab}
            labels={{ all: "All Deals", mine: "My Deals", documents: "Uploaded Docs" }}
          />
        </div>

        <CrmListToolbar
          searchValue={filters.q}
          searchPlaceholder={tab === "documents" ? "Search uploaded documents" : "Search by deal name"}
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
            void loadDeals();
          }}
          extraContent={
            tab !== "documents" ? (
              <>
                <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
                  <Checkbox
                    checked={paginatedDeals.length > 0 && selectedDealIds.length === paginatedDeals.length}
                    onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                    aria-label="Select all visible deals"
                  />
                  <span className="text-sm text-muted-foreground">{selectedDealIds.length} selected</span>
                </div>
                <NativeSelect value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)} className="h-10 w-40 rounded-xl px-3 text-sm">
                  <option value="">Keep status</option>
                  {dealStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </NativeSelect>
                <NativeSelect
                  value={bulkPipeline}
                  onChange={(event) => {
                    setBulkPipeline(event.target.value);
                    setBulkStage("");
                  }}
                  className="h-10 w-44 rounded-xl px-3 text-sm"
                >
                  <option value="">Keep pipeline</option>
                  {(pipelineSettings?.dealPipelines ?? []).map((pipeline) => <option key={pipeline.key} value={pipeline.key}>{pipeline.label}</option>)}
                </NativeSelect>
                <NativeSelect value={bulkStage} onChange={(event) => setBulkStage(event.target.value)} className="h-10 w-44 rounded-xl px-3 text-sm">
                  <option value="">Keep stage</option>
                  {((pipelineSettings?.dealPipelines.find((item) => item.key === bulkPipeline)?.stages) ?? pipelineSettings?.dealPipelines[0]?.stages ?? []).map((stage) => (
                    <option key={stage.key} value={stage.key}>{stage.label}</option>
                  ))}
                </NativeSelect>
                <Button type="button" disabled={bulkUpdating || selectedDealIds.length === 0 || (!bulkStatus && !bulkPipeline && !bulkStage)} onClick={() => void handleBulkUpdate()}>
                  {bulkUpdating ? "Updating..." : "Apply bulk update"}
                </Button>
              </>
            ) : null
          }
        />

        <CrmAppliedFiltersBar chips={activeFilterChips} onRemove={removeAppliedFilter} onClear={clearAllFilters} />

        {tab === "documents" ? (
          <CrmDataTable
            columns={documentColumns}
            rows={documents}
            rowKey={(document) => document.id}
            loading={loading}
            emptyLabel="No uploaded docs found."
            columnVisibility={documentColumnVisibility}
            actionColumn={{
              header: "Actions",
              renderCell: (document) => (
                <div className="flex justify-end gap-1.5">
                  <a href={buildApiUrl(`/documents/${document.id}/download`, { companyId })} className="inline-flex items-center rounded-xl border border-border/60 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
                    Download
                  </a>
                  <Button type="button" size="xs" variant="ghost" disabled={deletingId === document.id} onClick={() => void handleDeleteDocument(document.id)}>
                    <Trash2 className="size-3.5" /> Delete
                  </Button>
                </div>
              ),
            }}
          />
        ) : (
          <CrmDataTable
            columns={dealColumns}
            rows={paginatedDeals}
            rowKey={(deal) => deal.id}
            loading={loading}
            emptyLabel="No deals found."
            columnVisibility={columnVisibility}
            selectable
            selectedRowIds={selectedDealIds}
            onToggleRow={toggleDealSelection}
            onToggleAllVisible={toggleSelectAllVisible}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
            actionColumn={{
              header: "Actions",
              renderCell: (deal) => (
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="icon" className="size-8 rounded-lg" onClick={() => openEditModal(deal)}>
                    <PencilLine className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8 rounded-lg text-rose-600 hover:text-rose-700" onClick={() => openDeleteModal(deal)}>
                    <Trash2 className="size-4" />
                  </Button>
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

      {(modalMode === "create" || modalMode === "edit") ? (
        <CrmModalShell
          open
          title={modalMode === "edit" ? "Edit Deal" : "Create New Deal"}
          description={modalMode === "edit" ? "Update any deal detail and save it back to the database." : "Create a new deal with the same structured layout as the reference UI."}
          onClose={closeModal}
          headerActions={
            <>
              <Button type="button" variant="destructive" size="xs" onClick={closeModal}>
                Close
              </Button>
              <Button type="submit" form="deal-form" size="xs" disabled={submitting}>
                {submitting ? "Saving..." : "Save"}
              </Button>
            </>
          }
        >
          <form id="deal-form" onSubmit={handleSubmit} className="grid gap-5">
            <div className="grid gap-4 rounded-2xl border border-border/60 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Basic Information</div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>Deal Name</FieldLabel>
                  <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="h-10 text-sm" placeholder="eg: lifetime opportunity deal" required />
                </Field>
                <Field>
                  <FieldLabel>Select Pipeline</FieldLabel>
                  <NativeSelect
                    value={form.pipeline}
                    onChange={(event) => {
                      const nextPipeline = event.target.value;
                      const next = pipelineSettings?.dealPipelines.find((pipeline) => pipeline.key === nextPipeline);
                      setForm((current) => ({
                        ...current,
                        pipeline: nextPipeline,
                        stage: next?.stages[0]?.key ?? "",
                      }));
                    }}
                    className="h-10 rounded-xl px-3 text-sm"
                  >
                    <option value="">Select pipeline</option>
                    {(pipelineSettings?.dealPipelines ?? []).map((pipeline) => (
                      <option key={pipeline.key} value={pipeline.key}>
                        {pipeline.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
            </div>

            <div className="grid gap-4 rounded-2xl border border-border/60 bg-slate-50/70 p-4">
              <div className="text-sm font-semibold text-slate-900">Dependent Properties</div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>Deal Owner</FieldLabel>
                  <NativeSelect value={form.partnerCompanyId} onChange={(event) => setForm((current) => ({ ...current, partnerCompanyId: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
                    <option value="">Search for partners</option>
                    {partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>
                        {partner.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Deal Type</FieldLabel>
                  <Input value={form.dealType} onChange={(event) => setForm((current) => ({ ...current, dealType: event.target.value }))} className="h-10 text-sm" placeholder="Select deal type" />
                </Field>
                <Field>
                  <FieldLabel>Amount</FieldLabel>
                  <Input value={form.value} onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))} className="h-10 text-sm" type="number" min={0} placeholder="eg: 2000" />
                </Field>
                <Field>
                  <FieldLabel>Closed Date</FieldLabel>
                  <Input value={form.expectedCloseDate} onChange={(event) => setForm((current) => ({ ...current, expectedCloseDate: event.target.value }))} className="h-10 text-sm" type="date" />
                </Field>
                <Field>
                  <FieldLabel>Referral Source</FieldLabel>
                  <Input value={form.referralSource} onChange={(event) => setForm((current) => ({ ...current, referralSource: event.target.value }))} className="h-10 text-sm" placeholder="Select referral source" />
                </Field>
                <Field>
                  <FieldLabel>Deal Stage</FieldLabel>
                  <NativeSelect value={form.stage} onChange={(event) => setForm((current) => ({ ...current, stage: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
                    <option value="">Select deal stage</option>
                    {(activePipeline?.stages ?? []).map((stage) => (
                      <option key={stage.key} value={stage.key}>
                        {stage.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Priority</FieldLabel>
                  <Input value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))} className="h-10 text-sm" placeholder="Select priority" />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Product Tags</FieldLabel>
                  <Input value={form.productTags} onChange={(event) => setForm((current) => ({ ...current, productTags: event.target.value }))} className="h-10 text-sm" placeholder="Select or type to create tags..." />
                </Field>
              </div>
            </div>

            <div className="grid gap-4 rounded-2xl border border-border/60 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Associate deal with</div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel>Contact</FieldLabel>
                  <NativeSelect value={form.customerId} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
                    <option value="">Search and select contact</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.fullName}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Lead</FieldLabel>
                  <NativeSelect value={form.leadId} onChange={(event) => setForm((current) => ({ ...current, leadId: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
                    <option value="">Select lead</option>
                    {leadOptions.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.title}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <NativeSelect value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as DealStatus }))} className="h-10 rounded-xl px-3 text-sm">
                    {dealStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Owner Label</FieldLabel>
                  <Input value={form.ownerLabel} onChange={(event) => setForm((current) => ({ ...current, ownerLabel: event.target.value }))} className="h-10 text-sm" placeholder="Name shown in the table" />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>Notes</FieldLabel>
                  <Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-28 text-sm" placeholder="Add supporting notes for this deal" />
                </Field>
              </div>
            </div>
          </form>
        </CrmModalShell>
      ) : null}

      {modalMode === "delete" && selectedDeal ? (
        <CrmModalShell open title="Delete Deal" description={`Remove ${selectedDeal.title} from the workspace.`} onClose={closeModal} maxWidthClassName="max-w-xl">
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
            <div className="flex gap-2">
              <Button type="button" variant="destructive" onClick={() => void handleDelete()} disabled={deletingId === selectedDeal.id}>
                {deletingId === selectedDeal.id ? "Deleting..." : "Delete"}
              </Button>
              <Button type="button" variant="destructive" onClick={closeModal}>
                Cancel
              </Button>
            </div>
          </div>
        </CrmModalShell>
      ) : null}

      <CrmFilterDrawer
        open={modalMode === "filter"}
        title="Filter"
        description={tab === "documents" ? "Shape the uploaded docs table." : "Shape the deal table with focused filters."}
        onClose={closeModal}
        onClear={clearDealFilterDraft}
        onApply={applyFilters}
      >
        <div className="grid gap-4">
          <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-slate-50/70 p-4">
            <div className="text-sm font-semibold text-slate-900">Search</div>
            <Field>
              <FieldLabel>Search term</FieldLabel>
              <Input value={filterDraft.q} onChange={(event) => setFilterDraft((current) => ({ ...current, q: event.target.value }))} className="h-10 text-sm" placeholder={tab === "documents" ? "Filename" : "Deal name"} />
            </Field>
            {tab === "documents" ? (
              <Field>
                <FieldLabel>Folder</FieldLabel>
                <Input value={filterDraft.documentFolder} onChange={(event) => setFilterDraft((current) => ({ ...current, documentFolder: event.target.value }))} className="h-10 text-sm" placeholder="general" />
              </Field>
            ) : null}
          </div>

          {tab !== "documents" ? (
            <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Deal details</div>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <NativeSelect value={filterDraft.status} onChange={(event) => setFilterDraft((current) => ({ ...current, status: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
                  <option value="">All statuses</option>
                  {dealStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Pipeline</FieldLabel>
                <NativeSelect value={filterDraft.pipeline} onChange={(event) => setFilterDraft((current) => ({ ...current, pipeline: event.target.value }))} className="h-10 rounded-xl px-3 text-sm">
                  <option value="">All pipelines</option>
                  {(pipelineSettings?.dealPipelines ?? []).map((pipeline) => (
                    <option key={pipeline.key} value={pipeline.key}>
                      {pipeline.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Deal Stage</FieldLabel>
                <Input value={filterDraft.stage} onChange={(event) => setFilterDraft((current) => ({ ...current, stage: event.target.value }))} className="h-10 text-sm" placeholder="Filter by stage" />
              </Field>
            </div>
          ) : null}
        </div>
      </CrmFilterDrawer>

      {tab === "documents" ? (
        <CrmColumnSettings
          open={columnSettingsOpen}
          description="Choose which document columns stay visible in the table."
          columns={[
            { key: "name", label: "File Name" },
            { key: "folder", label: "Folder" },
            { key: "type", label: "Type" },
            { key: "size", label: "Size" },
            { key: "createdAt", label: "Uploaded" },
          ]}
          columnVisibility={documentColumnVisibility}
          onToggleColumn={toggleDocumentColumn}
          onReset={resetDocumentColumns}
          onClose={() => setColumnSettingsOpen(false)}
        />
      ) : (
        <CrmColumnSettings
          open={columnSettingsOpen}
          description="Choose which deal columns stay visible in the table."
          columns={dealColumnOrder
            .filter((key) => key !== "actions")
            .map((key) => ({ key: key as Exclude<DealColumnKey, "actions">, label: dealColumnLabels[key as DealSortKey] }))}
          columnVisibility={columnVisibility}
          lockedColumns={lockedDealColumns}
          onToggleColumn={toggleColumn}
          onReset={resetColumns}
          onClose={() => setColumnSettingsOpen(false)}
        />
      )}
    </div>
  );
}
