"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Import, Play, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  CrmAppliedFiltersBar,
  CrmColumnSettings,
  CrmDataTable,
  CrmFilterDrawer,
  CrmListPageHeader,
  CrmModalShell,
  CrmListToolbar,
  CrmListViewTabs,
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
import { ApiError, apiRequest } from "@/lib/api";
import { loadMe } from "@/lib/me-cache";

type CampaignStatus = "draft" | "scheduled" | "active" | "completed" | "paused";
type CampaignSortKey =
  | "name"
  | "type"
  | "status"
  | "sourceType"
  | "timeSpan"
  | "startDate"
  | "lastRun"
  | "listName"
  | "totalRecipients"
  | "partner"
  | "template";
type CampaignColumnKey = CampaignSortKey;
type TemplateSortKey = "name" | "type" | "subject" | "updatedAt";
type TemplateColumnKey = TemplateSortKey;

interface Campaign {
  id: string;
  name: string;
  channel: string;
  channelMetadata: Record<string, unknown>;
  status: CampaignStatus;
  audienceDescription: string | null;
  scheduledAt: string | null;
  launchedAt: string | null;
  completedAt: string | null;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  notes: string | null;
  audienceCount: number;
  linkedCustomers: Array<{ customerId: string; fullName: string; email: string | null }>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

interface CampaignListResponse {
  items: Campaign[];
  total: number;
  limit: number;
  offset: number;
}

interface Template {
  id: string;
  name: string;
  type: "email" | "whatsapp" | "sms" | "task" | "pipeline";
  subject: string | null;
  content: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

interface TemplateListResponse {
  items: Template[];
  total: number;
  limit: number;
  offset: number;
}

type CampaignFilters = {
  q: string;
  status: string;
  templateType: string;
  lifecycle: string;
};

type CampaignFilterKey = keyof CampaignFilters;

type CampaignFilterChip = {
  key: CampaignFilterKey;
  label: string;
  value: string;
};

const rowsPerPageOptions = [10, 20, 50, 100] as const;
const campaignColumnStorageKey = "crm-saas-campaign-columns";
const templateColumnStorageKey = "crm-saas-campaign-template-columns";
const statuses: CampaignStatus[] = ["draft", "scheduled", "active", "completed", "paused"];

const emptyFilters: CampaignFilters = {
  q: "",
  status: "",
  templateType: "",
  lifecycle: "active",
};

const defaultCampaignColumnVisibility: Record<CampaignColumnKey, boolean> = {
  name: true,
  type: true,
  status: true,
  sourceType: true,
  timeSpan: true,
  startDate: true,
  lastRun: true,
  listName: true,
  totalRecipients: true,
  partner: true,
  template: true,
};

const defaultTemplateColumnVisibility: Record<TemplateColumnKey, boolean> = {
  name: true,
  type: true,
  subject: true,
  updatedAt: true,
};

const lockedCampaignColumns: CampaignColumnKey[] = ["name"];

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function parseNoteField(notes: string | null | undefined, label: string) {
  const raw = notes ?? "";
  const match = raw.match(new RegExp(`^${label}:\\s*(.+)$`, "im"));
  return match?.[1]?.trim() ?? "";
}

function campaignMeta(campaign: Campaign) {
  const metadata = campaign.channelMetadata ?? {};
  return {
    sourceType: typeof metadata.sourceType === "string" ? metadata.sourceType : parseNoteField(campaign.notes, "Source Type") || "-",
    timeSpan: typeof metadata.timeSpan === "string" ? metadata.timeSpan : parseNoteField(campaign.notes, "Time Span") || "One-time",
    listName:
      typeof metadata.listName === "string"
        ? metadata.listName
        : parseNoteField(campaign.notes, "List Name") || campaign.audienceDescription || "-",
    partner: typeof metadata.partner === "string" ? metadata.partner : parseNoteField(campaign.notes, "Partner") || "-",
    template:
      typeof metadata.templateName === "string"
        ? metadata.templateName
        : parseNoteField(campaign.notes, "Template") || "-",
  };
}

function compareValues(left: string | number, right: string | number, direction: "asc" | "desc") {
  if (typeof left === "number" && typeof right === "number") {
    return direction === "asc" ? left - right : right - left;
  }

  const comparison = String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return direction === "asc" ? comparison : -comparison;
}

function readFiltersFromSearchParams(params: Pick<URLSearchParams, "get">): CampaignFilters {
  return {
    q: params.get("q") ?? "",
    status: params.get("status") ?? "",
    templateType: params.get("templateType") ?? "",
    lifecycle: params.get("lifecycle") ?? "active",
  };
}

function writeFiltersToSearchParams(params: URLSearchParams, filters: CampaignFilters) {
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.status.trim()) params.set("status", filters.status.trim());
  if (filters.templateType.trim()) params.set("templateType", filters.templateType.trim());
  if (filters.lifecycle.trim() && filters.lifecycle !== "active") params.set("lifecycle", filters.lifecycle.trim());
}

function normalizeCampaignSortKey(value: string | null): CampaignSortKey {
  const allowed: CampaignSortKey[] = [
    "name",
    "type",
    "status",
    "sourceType",
    "timeSpan",
    "startDate",
    "lastRun",
    "listName",
    "totalRecipients",
    "partner",
    "template",
  ];
  return allowed.includes(value as CampaignSortKey) ? (value as CampaignSortKey) : "startDate";
}

function getFilterChips(filters: CampaignFilters) {
  const chips: CampaignFilterChip[] = [];
  if (filters.q.trim()) chips.push({ key: "q", label: "Search", value: filters.q.trim() });
  if (filters.status.trim()) chips.push({ key: "status", label: "Status", value: filters.status.trim() });
  if (filters.templateType.trim()) chips.push({ key: "templateType", label: "Template Type", value: filters.templateType.trim() });
  if (filters.lifecycle.trim() && filters.lifecycle !== "active") chips.push({ key: "lifecycle", label: "Record State", value: filters.lifecycle.trim() });
  return chips;
}

function buildCampaignsCsv(items: Campaign[]) {
  return [
    ["campaign_name", "type", "status", "source_type", "time_span", "start_date", "last_run", "list_name", "total_recipients", "partner", "template"],
    ...items.map((campaign) => {
      const meta = campaignMeta(campaign);
      return [
        campaign.name,
        campaign.channel,
        campaign.status,
        meta.sourceType,
        meta.timeSpan,
        campaign.scheduledAt ?? campaign.createdAt,
        campaign.launchedAt ?? campaign.updatedAt,
        meta.listName,
        String(campaign.audienceCount),
        meta.partner,
        meta.template,
      ];
    }),
  ]
    .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
    .join("\n");
}

function buildTemplatesCsv(items: Template[]) {
  return [
    ["name", "type", "subject", "updated_at"],
    ...items.map((template) => [template.name, template.type, template.subject ?? "", template.updatedAt]),
  ]
    .map((row) => row.map((cell) => toCsvCell(cell)).join(","))
    .join("\n");
}

const statusTone: Record<CampaignStatus, "outline" | "secondary" | "default" | "destructive"> = {
  draft: "outline",
  scheduled: "secondary",
  active: "default",
  completed: "default",
  paused: "destructive",
};

export function CampaignsListPage() {
  return <CampaignsListPageContent mode="campaigns" />;
}

export function CampaignTemplatesPage() {
  return <CampaignsListPageContent mode="templates" />;
}

function CampaignsListPageContent({ mode }: { mode: "campaigns" | "templates" }) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: "softDeleteCampaign" | "permanentDeleteCampaign" | "softDeleteTemplate" | "permanentDeleteTemplate"; id: string; label: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const {
    columnVisibility: templateColumnVisibility,
    toggleColumn: toggleTemplateColumn,
    resetColumns: resetTemplateColumns,
  } = usePersistedColumnVisibility<TemplateColumnKey>({
    storageKey: templateColumnStorageKey,
    defaultVisibility: defaultTemplateColumnVisibility,
  });

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
    clearAllFilters,
    removeAppliedFilter,
    toggleColumn,
    resetColumns,
    requestSort,
  } = useCrmListState<CampaignFilters, CampaignSortKey, CampaignColumnKey>({
    defaultTab: mode === "templates" ? "documents" : "all",
    defaultFilters: emptyFilters,
    defaultSortBy: "startDate",
    defaultSortDir: "desc",
    defaultLimit: rowsPerPageOptions[0],
    rowsPerPageOptions,
    parseFilters: readFiltersFromSearchParams,
    writeFilters: writeFiltersToSearchParams,
    normalizeSortBy: normalizeCampaignSortKey,
    columnStorageKey: campaignColumnStorageKey,
    defaultColumnVisibility: defaultCampaignColumnVisibility,
    lockedColumns: lockedCampaignColumns,
  });

  const effectiveTab = mode === "templates" ? "documents" : tab;

  const activeFilterChips = useMemo(
    () =>
      getFilterChips(filters).filter((chip) =>
        effectiveTab === "documents" ? chip.key === "q" || chip.key === "templateType" || chip.key === "lifecycle" : chip.key !== "templateType",
      ),
    [effectiveTab, filters],
  );

  useEffect(() => {
    void loadMe()
      .then((me) => setMyUserId(me.user.id))
      .catch(() => setMyUserId(null));
  }, []);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String((page - 1) * limit));
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.status.trim()) params.set("status", filters.status.trim());
    if (filters.lifecycle.trim()) params.set("lifecycle", filters.lifecycle.trim());
    if (effectiveTab === "mine" && myUserId) params.set("createdBy", myUserId);

    try {
      const response = await apiRequest<CampaignListResponse>(`/campaigns/list?${params.toString()}`);
      setCampaigns(response.items);
      setTotal(response.total);
      setSelectedCampaignIds((current) => current.filter((id) => response.items.some((item) => item.id === id)));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [effectiveTab, filters.lifecycle, filters.q, filters.status, limit, myUserId, page]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String((page - 1) * limit));
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.templateType.trim()) params.set("type", filters.templateType.trim());
    if (filters.lifecycle.trim()) params.set("lifecycle", filters.lifecycle.trim());

    try {
      const response = await apiRequest<TemplateListResponse>(`/templates/list?${params.toString()}`);
      setTemplates(response.items);
      setTotal(response.total);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load templates");
    } finally {
      setLoading(false);
    }
  }, [filters.lifecycle, filters.q, filters.templateType, limit, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (effectiveTab === "documents") {
        void loadTemplates();
        return;
      }
      if (effectiveTab === "mine" && !myUserId) {
        return;
      }
      void loadCampaigns();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [effectiveTab, loadCampaigns, loadTemplates, myUserId]);

  const sortedCampaigns = useMemo(() => {
    const next = [...campaigns];
    next.sort((left, right) => {
      const leftMeta = campaignMeta(left);
      const rightMeta = campaignMeta(right);
      const getValue = (campaign: Campaign, meta: ReturnType<typeof campaignMeta>) => {
        switch (sortBy) {
          case "name":
            return campaign.name;
          case "type":
            return campaign.channel;
          case "status":
            return campaign.status;
          case "sourceType":
            return meta.sourceType;
          case "timeSpan":
            return meta.timeSpan;
          case "startDate":
            return campaign.scheduledAt ? new Date(campaign.scheduledAt).getTime() : new Date(campaign.createdAt).getTime();
          case "lastRun":
            return campaign.launchedAt ? new Date(campaign.launchedAt).getTime() : new Date(campaign.updatedAt).getTime();
          case "listName":
            return meta.listName;
          case "totalRecipients":
            return campaign.audienceCount;
          case "partner":
            return meta.partner;
          case "template":
            return meta.template;
          default:
            return campaign.name;
        }
      };
      return compareValues(getValue(left, leftMeta), getValue(right, rightMeta), sortDir);
    });
    return next;
  }, [campaigns, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const toggleCampaignSelection = (campaignId: string, checked: boolean) => {
    setSelectedCampaignIds((current) => (checked ? [...new Set([...current, campaignId])] : current.filter((id) => id !== campaignId)));
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedCampaignIds(checked ? sortedCampaigns.map((campaign) => campaign.id) : []);
  };

  const campaignColumns: Array<ColumnDefinition<Campaign, CampaignColumnKey, CampaignSortKey>> = [
    { key: "name", label: "Campaign Name", sortable: true, sortKey: "name", widthClassName: "min-w-[220px]", renderCell: (campaign) => <div className="font-medium text-slate-900">{campaign.name}</div> },
    { key: "type", label: "Type", sortable: true, sortKey: "type", renderCell: (campaign) => <Badge variant="outline" className="capitalize">{campaign.channel}</Badge> },
    { key: "status", label: "Status", sortable: true, sortKey: "status", renderCell: (campaign) => <Badge variant={statusTone[campaign.status]} className="capitalize">{campaign.status}</Badge> },
    { key: "sourceType", label: "Source Type", sortable: true, sortKey: "sourceType", renderCell: (campaign) => <span>{campaignMeta(campaign).sourceType}</span> },
    { key: "timeSpan", label: "Time Span", sortable: true, sortKey: "timeSpan", renderCell: (campaign) => <span>{campaignMeta(campaign).timeSpan}</span> },
    { key: "startDate", label: "Start Date", sortable: true, sortKey: "startDate", renderCell: (campaign) => <span>{formatDate(campaign.scheduledAt ?? campaign.createdAt)}</span> },
    { key: "lastRun", label: "Last Run", sortable: true, sortKey: "lastRun", renderCell: (campaign) => <span>{formatDateTime(campaign.launchedAt ?? campaign.updatedAt)}</span> },
    { key: "listName", label: "List Name", sortable: true, sortKey: "listName", renderCell: (campaign) => <span>{campaignMeta(campaign).listName}</span> },
    { key: "totalRecipients", label: "Total Recipients", sortable: true, sortKey: "totalRecipients", renderCell: (campaign) => <span>{campaign.audienceCount}</span> },
    { key: "partner", label: "Partner", sortable: true, sortKey: "partner", renderCell: (campaign) => <span>{campaignMeta(campaign).partner}</span> },
    { key: "template", label: "Template", sortable: true, sortKey: "template", renderCell: (campaign) => <span>{campaignMeta(campaign).template}</span> },
  ];

  const templateColumns: Array<ColumnDefinition<Template, TemplateColumnKey>> = [
    { key: "name", label: "Template Name", widthClassName: "min-w-[220px]", renderCell: (template) => <div className="font-medium text-slate-900">{template.name}</div> },
    { key: "type", label: "Type", renderCell: (template) => <Badge variant="outline" className="capitalize">{template.type}</Badge> },
    { key: "subject", label: "Subject", renderCell: (template) => <span className="text-slate-600">{template.subject || "-"}</span> },
    { key: "updatedAt", label: "Updated", renderCell: (template) => <span className="text-slate-600">{formatDateTime(template.updatedAt)}</span> },
  ];

  const updateCampaignStatus = async (campaignId: string, nextStatus: CampaignStatus) => {
    setError(null);
    try {
      await apiRequest(`/campaigns/${campaignId}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      toast.success("Campaign updated");
      await loadCampaigns();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to update campaign";
      setError(message);
      toast.error(message);
    }
  };

  const launchCampaign = async (campaignId: string) => {
    setError(null);
    try {
      await apiRequest(`/campaigns/${campaignId}/launch`, { method: "POST", body: JSON.stringify({}) });
      toast.success("Campaign launched");
      await loadCampaigns();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to launch campaign";
      setError(message);
      toast.error(message);
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    setError(null);
    try {
      await apiRequest(`/campaigns/${campaignId}`, { method: "DELETE", body: JSON.stringify({}) });
      toast.success("Campaign moved to trash");
      await loadCampaigns();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to move campaign to trash";
      setError(message);
      toast.error(message);
    }
  };

  const deleteTemplate = async (templateId: string) => {
    setError(null);
    try {
      await apiRequest(`/templates/${templateId}`, { method: "DELETE", body: JSON.stringify({}) });
      toast.success("Template moved to trash");
      await loadTemplates();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to move template to trash";
      setError(message);
      toast.error(message);
    }
  };

  const restoreCampaign = async (campaignId: string) => {
    setError(null);
    try {
      await apiRequest(`/campaigns/${campaignId}/restore`, { method: "POST", body: JSON.stringify({}) });
      toast.success("Campaign restored");
      await loadCampaigns();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to restore campaign";
      setError(message);
      toast.error(message);
    }
  };

  const restoreTemplate = async (templateId: string) => {
    setError(null);
    try {
      await apiRequest(`/templates/${templateId}/restore`, { method: "POST", body: JSON.stringify({}) });
      toast.success("Template restored");
      await loadTemplates();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to restore template";
      setError(message);
      toast.error(message);
    }
  };

  const permanentlyDeleteCampaign = async (campaignId: string) => {
    setError(null);
    try {
      await apiRequest(`/campaigns/${campaignId}/permanent`, { method: "DELETE" });
      toast.success("Campaign deleted permanently");
      await loadCampaigns();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to delete campaign permanently";
      setError(message);
      toast.error(message);
    }
  };

  const permanentlyDeleteTemplate = async (templateId: string) => {
    setError(null);
    try {
      await apiRequest(`/templates/${templateId}/permanent`, { method: "DELETE" });
      toast.success("Template deleted permanently");
      await loadTemplates();
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to delete template permanently";
      setError(message);
      toast.error(message);
    }
  };

  const loadAllCampaignsForExport = useCallback(async () => {
    const items: Campaign[] = [];
    let nextOffset = 0;
    while (true) {
      const params = new URLSearchParams();
      params.set("limit", "100");
      params.set("offset", String(nextOffset));
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.status.trim()) params.set("status", filters.status.trim());
      if (filters.lifecycle.trim()) params.set("lifecycle", filters.lifecycle.trim());
      if (effectiveTab === "mine" && myUserId) params.set("createdBy", myUserId);
      const response = await apiRequest<CampaignListResponse>(`/campaigns/list?${params.toString()}`, { skipCache: true });
      items.push(...response.items);
      nextOffset += response.items.length;
      if (response.items.length === 0 || nextOffset >= response.total) break;
    }
    return items;
  }, [effectiveTab, filters.lifecycle, filters.q, filters.status, myUserId]);

  const loadAllTemplatesForExport = useCallback(async () => {
    const items: Template[] = [];
    let nextOffset = 0;
    while (true) {
      const params = new URLSearchParams();
      params.set("limit", "100");
      params.set("offset", String(nextOffset));
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.templateType.trim()) params.set("type", filters.templateType.trim());
      if (filters.lifecycle.trim()) params.set("lifecycle", filters.lifecycle.trim());
      const response = await apiRequest<TemplateListResponse>(`/templates/list?${params.toString()}`, { skipCache: true });
      items.push(...response.items);
      nextOffset += response.items.length;
      if (response.items.length === 0 || nextOffset >= response.total) break;
    }
    return items;
  }, [filters.lifecycle, filters.q, filters.templateType]);

  const handleExport = async () => {
    try {
      const csv =
        effectiveTab === "documents"
          ? buildTemplatesCsv(await loadAllTemplatesForExport())
          : buildCampaignsCsv(await loadAllCampaignsForExport());
      downloadCsvFile(csv, effectiveTab === "documents" ? "campaign-templates.csv" : "campaigns.csv");
      toast.success(effectiveTab === "documents" ? "Templates exported" : "Campaigns exported");
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to export data";
      setError(message);
      toast.error(message);
    }
  };

  return (
    <div className="grid gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>{mode === "templates" ? "Template request failed" : "Campaign request failed"}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <CrmListPageHeader
        title={mode === "templates" ? "Templates" : "Campaigns"}
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleExport()}>
              <Download className="size-4" /> Export
            </Button>
            {mode === "campaigns" ? (
              <>
                <Button type="button" variant="secondary" size="sm" disabled title="Campaign import is not available yet">
                  <Import className="size-4" /> Import
                </Button>
                <Button type="button" size="sm" onClick={() => router.push("/dashboard/campaigns/add")}>
                  <Plus className="size-4" /> Create
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" onClick={() => router.push("/dashboard/templates/new")}>
                <Plus className="size-4" /> New Template
              </Button>
            )}
          </>
        }
      />

      <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-white shadow-[0_24px_60px_-40px_rgba(15,23,42,0.35)]">
        {mode === "campaigns" ? (
          <div className="px-4 pt-3">
            <CrmListViewTabs
              value={tab}
              onValueChange={setTab}
              labels={{ all: "All Campaigns", mine: "My Campaigns", documents: "Templates" }}
            />
          </div>
        ) : null}

        <CrmListToolbar
          searchValue={filters.q}
          searchPlaceholder={effectiveTab === "documents" ? "Search templates" : "Search campaigns"}
          onSearchChange={(value) => {
            setPage(1);
            setFilters((current) => ({ ...current, q: value }));
            setFilterDraft((current) => ({ ...current, q: value }));
          }}
          onOpenFilters={() => setFilterOpen(true)}
          filterCount={activeFilterChips.length}
          onOpenColumns={() => setColumnSettingsOpen(true)}
          onRefresh={() => {
            if (effectiveTab === "documents") {
              void loadTemplates();
              return;
            }
            void loadCampaigns();
          }}
          extraContent={
            effectiveTab !== "documents" ? (
              <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-white px-3 py-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={sortedCampaigns.length > 0 && selectedCampaignIds.length === sortedCampaigns.length}
                  onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                  aria-label="Select all visible campaigns"
                />
                <span>{selectedCampaignIds.length} selected</span>
              </div>
            ) : null
          }
        />

        <CrmAppliedFiltersBar chips={activeFilterChips} onRemove={removeAppliedFilter} onClear={clearAllFilters} />

        {effectiveTab === "documents" ? (
          <CrmDataTable
            columns={templateColumns}
            rows={templates}
            rowKey={(template) => template.id}
            loading={loading}
            emptyLabel="No templates found."
            columnVisibility={templateColumnVisibility}
            actionColumn={{
              header: "Actions",
              renderCell: (template) => (
                <div className="flex justify-end gap-2">
                  {filters.lifecycle === "deleted" ? (
                    <>
                      <Button type="button" variant="outline" size="xs" onClick={() => void restoreTemplate(template.id)}>
                        Restore
                      </Button>
                      <Button type="button" variant="ghost" size="xs" className="text-rose-600 hover:text-rose-700" onClick={() => setPendingAction({ type: "permanentDeleteTemplate", id: template.id, label: template.name })}>
                        Delete permanently
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="ghost" size="xs" className="text-rose-600 hover:text-rose-700" onClick={() => setPendingAction({ type: "softDeleteTemplate", id: template.id, label: template.name })}>
                      <Trash2 className="size-3.5" /> Delete
                    </Button>
                  )}
                </div>
              ),
            }}
          />
        ) : (
          <CrmDataTable
            columns={campaignColumns}
            rows={sortedCampaigns}
            rowKey={(campaign) => campaign.id}
            loading={loading}
            emptyLabel="No campaigns found."
            columnVisibility={columnVisibility}
            selectable
            selectedRowIds={selectedCampaignIds}
            onToggleRow={toggleCampaignSelection}
            onToggleAllVisible={toggleSelectAllVisible}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={(key) => requestSort(key, key === "startDate" || key === "lastRun" || key === "totalRecipients" ? "desc" : "asc")}
            actionColumn={{
              header: "Actions",
              renderCell: (campaign) => (
                <div className="flex flex-wrap justify-end gap-2">
                  {filters.lifecycle === "deleted" ? (
                    <>
                      <Button type="button" variant="outline" size="xs" onClick={() => void restoreCampaign(campaign.id)}>
                        Restore
                      </Button>
                      <Button type="button" variant="ghost" size="xs" className="text-rose-600 hover:text-rose-700" onClick={() => setPendingAction({ type: "permanentDeleteCampaign", id: campaign.id, label: campaign.name })}>
                        Delete permanently
                      </Button>
                    </>
                  ) : (
                    <>
                      {campaign.status === "active" ? (
                        <Button type="button" variant="outline" size="xs" onClick={() => void updateCampaignStatus(campaign.id, "paused")}>
                          Pause
                        </Button>
                      ) : campaign.status !== "completed" ? (
                        <Button type="button" variant="outline" size="xs" onClick={() => void launchCampaign(campaign.id)}>
                          <Play className="size-3.5" /> Launch
                        </Button>
                      ) : null}
                      <Button type="button" variant="ghost" size="xs" className="text-rose-600 hover:text-rose-700" onClick={() => setPendingAction({ type: "softDeleteCampaign", id: campaign.id, label: campaign.name })}>
                        <Trash2 className="size-3.5" /> Delete
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

      <CrmFilterDrawer
        open={filterOpen}
        title="Filter"
        description={effectiveTab === "documents" ? "Filter templates by search and type." : "Filter campaigns by search and status."}
        onClose={() => setFilterOpen(false)}
        onClear={clearFilterDraft}
        onApply={() => {
          applyFilterDraft();
          setFilterOpen(false);
        }}
      >
        <div className="grid gap-4">
          <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-slate-50/70 p-4">
            <div className="text-sm font-semibold text-slate-900">Search</div>
            <Field>
              <FieldLabel>Search term</FieldLabel>
              <Input
                value={filterDraft.q}
                onChange={(event) => setFilterDraft((current) => ({ ...current, q: event.target.value }))}
                className="h-10 text-sm"
                placeholder={effectiveTab === "documents" ? "Template name" : "Campaign name"}
              />
            </Field>
          </div>

          {effectiveTab === "documents" ? (
            <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Template details</div>
              <Field>
                <FieldLabel>Type</FieldLabel>
                <NativeSelect
                  value={filterDraft.templateType}
                  onChange={(event) => setFilterDraft((current) => ({ ...current, templateType: event.target.value }))}
                  className="h-10 rounded-xl px-3 text-sm"
                >
                  <option value="">All types</option>
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                  <option value="task">Task</option>
                  <option value="pipeline">Pipeline</option>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Record State</FieldLabel>
                <NativeSelect
                  value={filterDraft.lifecycle}
                  onChange={(event) => setFilterDraft((current) => ({ ...current, lifecycle: event.target.value }))}
                  className="h-10 rounded-xl px-3 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="deleted">Deleted</option>
                </NativeSelect>
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Campaign details</div>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <NativeSelect
                  value={filterDraft.status}
                  onChange={(event) => setFilterDraft((current) => ({ ...current, status: event.target.value }))}
                  className="h-10 rounded-xl px-3 text-sm"
                >
                  <option value="">All statuses</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Record State</FieldLabel>
                <NativeSelect
                  value={filterDraft.lifecycle}
                  onChange={(event) => setFilterDraft((current) => ({ ...current, lifecycle: event.target.value }))}
                  className="h-10 rounded-xl px-3 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="deleted">Deleted</option>
                </NativeSelect>
              </Field>
            </div>
          )}
        </div>
      </CrmFilterDrawer>

      {pendingAction ? (
        <CrmModalShell
          open
          title={pendingAction.type.startsWith("permanent") ? "Delete Permanently" : "Move To Trash"}
          description={pendingAction.type.startsWith("permanent") ? `${pendingAction.label} will be deleted permanently.` : `${pendingAction.label} will be removed from active records.`}
          onClose={() => !actionLoading && setPendingAction(null)}
          maxWidthClassName="max-w-xl"
        >
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">
              {pendingAction.type.startsWith("permanent")
                ? "This action cannot be undone."
                : "You can restore this record later from the deleted filter."}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={actionLoading}
                onClick={async () => {
                  setActionLoading(true);
                  try {
                    if (pendingAction.type === "softDeleteCampaign") await deleteCampaign(pendingAction.id);
                    if (pendingAction.type === "permanentDeleteCampaign") await permanentlyDeleteCampaign(pendingAction.id);
                    if (pendingAction.type === "softDeleteTemplate") await deleteTemplate(pendingAction.id);
                    if (pendingAction.type === "permanentDeleteTemplate") await permanentlyDeleteTemplate(pendingAction.id);
                    setPendingAction(null);
                  } finally {
                    setActionLoading(false);
                  }
                }}
              >
                {actionLoading ? "Working..." : pendingAction.type.startsWith("permanent") ? "Delete permanently" : "Move to trash"}
              </Button>
              <Button type="button" variant="destructive" onClick={() => setPendingAction(null)} disabled={actionLoading}>
                Cancel
              </Button>
            </div>
          </div>
        </CrmModalShell>
      ) : null}

      <CrmColumnSettings
        open={columnSettingsOpen && effectiveTab !== "documents"}
        description="Choose which campaign columns stay visible in the table."
        columns={campaignColumns.map((column) => ({ key: column.key, label: column.label }))}
        columnVisibility={columnVisibility}
        lockedColumns={lockedCampaignColumns}
        onToggleColumn={toggleColumn}
        onReset={resetColumns}
        onClose={() => setColumnSettingsOpen(false)}
      />

      <CrmColumnSettings
        open={columnSettingsOpen && effectiveTab === "documents"}
        description="Choose which template columns stay visible in the table."
        columns={templateColumns.map((column) => ({ key: column.key, label: column.label }))}
        columnVisibility={templateColumnVisibility}
        onToggleColumn={toggleTemplateColumn}
        onReset={resetTemplateColumns}
        onClose={() => setColumnSettingsOpen(false)}
      />
    </div>
  );
}
