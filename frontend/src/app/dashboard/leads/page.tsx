"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { FormErrorSummary, FormSection } from "@/components/forms/form-primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CrudPanel, EmptyState, FilterBar, LoadingState, PageSection } from "@/components/ui/page-patterns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { buildApiUrl, ApiError, apiRequest } from "@/lib/api";
import { useAsyncForm } from "@/hooks/use-async-form";
import { getCompanyCookie } from "@/lib/cookies";
import { optionalSelectValue, readOptionalSelectValue, SELECT_ALL, SELECT_EMPTY } from "@/lib/select";
import { cn } from "@/lib/utils";

interface Lead {
  id: string;
  title: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  partnerCompanyId?: string | null;
  status: "new" | "qualified" | "proposal" | "won" | "lost";
  score: number;
  createdAt: string;
}

interface LeadActivity {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface DocumentItem {
  id: string;
  folder: string;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number;
  createdAt: string;
}

interface ListLeadResponse {
  items: Lead[];
  total: number;
  limit: number;
  offset: number;
}

interface TimelineResponse {
  items: LeadActivity[];
}

interface DocumentListResponse {
  items: DocumentItem[];
}

interface ConvertLeadResponse {
  leadId: string;
  dealId: string;
  customerId: string | null;
  converted: true;
}

interface LeadBoardResponse {
  columns: Array<{
    key: string;
    label: string;
    items: Lead[];
  }>;
  total: number;
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

interface CsvImportResponse {
  createdCount: number;
  attemptedCount: number;
  errorCount: number;
  leadIds: string[];
  errors: Array<{
    row: number;
    message: string;
  }>;
}

const leadStatuses = ["new", "qualified", "proposal", "won", "lost"] as const;
const statusToneByValue: Record<Lead["status"], "outline" | "secondary" | "default" | "destructive"> = {
  new: "outline",
  qualified: "secondary",
  proposal: "default",
  won: "default",
  lost: "destructive",
};

const importExample = `title,full_name,email,source,status,score,tags
Acme HQ fit-out,Riya Mehta,riya@acme.com,website,new,78,priority|enterprise
North zone referral,Vikram Singh,,referral,qualified,62,partner`;

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newLeadTitle, setNewLeadTitle] = useState("");
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadEmail, setNewLeadEmail] = useState("");
  const [newLeadSource, setNewLeadSource] = useState("");
  const [newLeadPartnerId, setNewLeadPartnerId] = useState("");
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);
  const [leadSourceSettings, setLeadSourceSettings] = useState<LeadSourceSettings | null>(null);
  const [partners, setPartners] = useState<PartnerListResponse["items"]>([]);
  const [board, setBoard] = useState<LeadBoardResponse | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [bulkSource, setBulkSource] = useState<string>("");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [importCsv, setImportCsv] = useState(importExample);
  const [importResult, setImportResult] = useState<CsvImportResponse | null>(null);

  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [timelineByLead, setTimelineByLead] = useState<Record<string, LeadActivity[]>>({});
  const [timelineDraftByLead, setTimelineDraftByLead] = useState<Record<string, string>>({});
  const [timelineLoadingLeadId, setTimelineLoadingLeadId] = useState<string | null>(null);
  const [documentsByLead, setDocumentsByLead] = useState<Record<string, DocumentItem[]>>({});
  const [uploadingLeadId, setUploadingLeadId] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const createLeadForm = useAsyncForm();
  const importLeadForm = useAsyncForm();

  const companyId = getCompanyCookie();

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError(null);

    const searchParams = new URLSearchParams();
    if (query.trim()) {
      searchParams.set("q", query.trim());
    }
    if (statusFilter) {
      searchParams.set("status", statusFilter);
    }

    try {
      const data = await apiRequest<ListLeadResponse>(`/leads?${searchParams.toString()}`);
      setLeads(data.items);
      setSelectedLeadIds((current) => current.filter((id) => data.items.some((lead) => lead.id === id)));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load leads");
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter]);

  const loadTimeline = useCallback(async (leadId: string) => {
    setTimelineLoadingLeadId(leadId);
    try {
      const data = await apiRequest<TimelineResponse>(`/leads/${leadId}/timeline`);
      setTimelineByLead((prev) => ({ ...prev, [leadId]: data.items }));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load lead timeline");
    } finally {
      setTimelineLoadingLeadId(null);
    }
  }, []);

  const loadLeadDocuments = useCallback(async (leadId: string) => {
    try {
      const data = await apiRequest<DocumentListResponse>(`/documents/list?entityType=lead&entityId=${leadId}`);
      setDocumentsByLead((prev) => ({ ...prev, [leadId]: data.items }));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load lead attachments");
    }
  }, []);

  const loadBoard = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (sourceFilter) {
        params.set("source", sourceFilter);
      }
      const data = await apiRequest<LeadBoardResponse>(`/leads/board?${params.toString()}`);
      setBoard(data);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load lead board");
    }
  }, [sourceFilter]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    const loadLeadSources = async () => {
      try {
        const [leadSourceData, partnerData] = await Promise.all([
          apiRequest<LeadSourceSettings>("/settings/lead-sources"),
          apiRequest<PartnerListResponse>("/partners"),
        ]);
        setLeadSourceSettings(leadSourceData);
        setPartners(partnerData.items.filter((item) => item.status === "active"));
        setNewLeadSource(leadSourceData.leadSources[0]?.key ?? "");
      } catch (requestError) {
        setError(requestError instanceof ApiError ? requestError.message : "Unable to load lead sources");
      }
    };

    void loadLeadSources();
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const handleCreateLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      await createLeadForm.runSubmit(
        () =>
          apiRequest<Lead>("/leads", {
            method: "POST",
            body: JSON.stringify({
              title: newLeadTitle,
              fullName: newLeadName || undefined,
              email: newLeadEmail || undefined,
              source: newLeadSource || undefined,
              partnerCompanyId: newLeadPartnerId || undefined,
            }),
          }),
        "Unable to create lead",
      );

      setNewLeadTitle("");
      setNewLeadName("");
      setNewLeadEmail("");
      setNewLeadSource(leadSourceSettings?.leadSources[0]?.key ?? "");
      setNewLeadPartnerId("");
      await loadLeads();
      await loadBoard();
    } catch {}
  };

  const handleImportCsv = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setImportResult(null);

    try {
      const result = await importLeadForm.runSubmit(
        () =>
          apiRequest<CsvImportResponse>("/leads/import-csv", {
            method: "POST",
            body: JSON.stringify({ csv: importCsv }),
          }),
        "Unable to import CSV",
      );

      setImportResult(result);
      await loadLeads();
      await loadBoard();
    } catch {}
  };

  const handleStatusChange = async (leadId: string, status: Lead["status"]) => {
    try {
      await apiRequest<Lead>(`/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadLeads();
      await loadBoard();
      if (expandedLeadId === leadId) {
        await loadTimeline(leadId);
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update lead");
    }
  };

  const handleConvertLead = async (leadId: string) => {
    setConvertingLeadId(leadId);
    setError(null);

    try {
      await apiRequest<ConvertLeadResponse>(`/leads/${leadId}/convert`, {
        method: "POST",
        body: JSON.stringify({
          createCustomer: true,
          value: 0,
        }),
      });
      await loadLeads();
      await loadBoard();
      if (expandedLeadId === leadId) {
        await loadTimeline(leadId);
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to convert lead");
    } finally {
      setConvertingLeadId(null);
    }
  };

  const toggleTimeline = async (leadId: string) => {
    if (expandedLeadId === leadId) {
      setExpandedLeadId(null);
      return;
    }

    setExpandedLeadId(leadId);
    await Promise.all([loadTimeline(leadId), loadLeadDocuments(leadId)]);
  };

  const addTimelineNote = async (leadId: string) => {
    const message = (timelineDraftByLead[leadId] ?? "").trim();
    if (!message) {
      return;
    }

    try {
      await apiRequest(`/leads/${leadId}/timeline`, {
        method: "POST",
        body: JSON.stringify({ type: "note", message }),
      });
      setTimelineDraftByLead((prev) => ({ ...prev, [leadId]: "" }));
      await loadTimeline(leadId);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to add timeline note");
    }
  };

  const uploadLeadDocument = async (leadId: string, file: File | null) => {
    if (!file) {
      return;
    }

    setUploadingLeadId(leadId);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("entityType", "lead");
      formData.set("entityId", leadId);
      formData.set("folder", "leads");

      await apiRequest("/documents/upload", {
        method: "POST",
        body: formData,
      });

      await loadLeadDocuments(leadId);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to upload lead attachment");
    } finally {
      setUploadingLeadId(null);
    }
  };

  const deleteLeadDocument = async (leadId: string, documentId: string) => {
    setDeletingDocumentId(documentId);
    setError(null);

    try {
      await apiRequest(`/documents/${documentId}`, {
        method: "DELETE",
      });
      await loadLeadDocuments(leadId);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to delete lead attachment");
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const toggleLeadSelection = (leadId: string, checked: boolean) => {
    setSelectedLeadIds((current) =>
      checked ? [...new Set([...current, leadId])] : current.filter((id) => id !== leadId),
    );
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedLeadIds(checked ? leads.map((lead) => lead.id) : []);
  };

  const handleBulkUpdate = async () => {
    if (selectedLeadIds.length === 0) {
      return;
    }

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

      setSelectedLeadIds([]);
      setBulkStatus("");
      setBulkSource("");
      await loadLeads();
      await loadBoard();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to bulk update leads");
    } finally {
      setBulkUpdating(false);
    }
  };

  return (
    <AppShell
      title="Leads"
      description="Import, triage, and convert tenant-scoped leads from one workspace."
    >
      <div className="grid gap-6">
        <FormErrorSummary title="Request failed" error={error ?? createLeadForm.formError ?? importLeadForm.formError} />

        {importResult ? (
          <Alert>
            <AlertTitle>CSV import complete</AlertTitle>
            <AlertDescription>
              Created {importResult.createdCount} of {importResult.attemptedCount} rows.{" "}
              {importResult.errorCount > 0 ? `${importResult.errorCount} rows need correction.` : "No row errors returned."}
            </AlertDescription>
          </Alert>
        ) : null}

        <PageSection>
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <CrudPanel title="Create lead" description="Add one lead manually with the configured source list.">
              <form className="grid gap-4" onSubmit={handleCreateLead}>
                <FormSection title="Lead details" description="Capture the minimum lead profile used by the tenant-scoped CRM APIs.">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="lead-title">Lead title</FieldLabel>
                      <Input
                        id="lead-title"
                        value={newLeadTitle}
                        onChange={(event) => {
                          createLeadForm.clearFieldError("title");
                          setNewLeadTitle(event.target.value);
                        }}
                        placeholder="Acme office expansion"
                        required
                      />
                      <FieldError errors={createLeadForm.fieldErrors.title?.map((message) => ({ message }))} />
                    </Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="lead-name">Contact name</FieldLabel>
                        <Input
                          id="lead-name"
                          value={newLeadName}
                          onChange={(event) => setNewLeadName(event.target.value)}
                          placeholder="Riya Mehta"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="lead-email">Contact email</FieldLabel>
                        <Input
                          id="lead-email"
                          type="email"
                          value={newLeadEmail}
                          onChange={(event) => {
                            createLeadForm.clearFieldError("email");
                            setNewLeadEmail(event.target.value);
                          }}
                          placeholder="riya@acme.com"
                        />
                        <FieldError errors={createLeadForm.fieldErrors.email?.map((message) => ({ message }))} />
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel>Lead source</FieldLabel>
                      <Select value={optionalSelectValue(newLeadSource)} onValueChange={(value) => setNewLeadSource(readOptionalSelectValue(value))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_EMPTY}>No source</SelectItem>
                        {(leadSourceSettings?.leadSources ?? []).map((source) => (
                          <SelectItem key={source.key} value={source.key}>
                            {source.label}
                          </SelectItem>
                        ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel>Partner assignment</FieldLabel>
                      <Select value={optionalSelectValue(newLeadPartnerId)} onValueChange={(value) => setNewLeadPartnerId(readOptionalSelectValue(value))}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select partner" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SELECT_EMPTY}>No partner</SelectItem>
                          {partners.map((partner) => (
                            <SelectItem key={partner.id} value={partner.id}>
                              {partner.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </FieldGroup>
                </FormSection>
                <Button disabled={createLeadForm.submitting} type="submit" className="w-fit">
                  {createLeadForm.submitting ? "Creating..." : "Create lead"}
                </Button>
              </form>
          </CrudPanel>

          <CrudPanel title="Import CSV" description="Paste up to 200 rows. Supported headers include `title`, `full_name`, `email`, `source`, `status`, `score`, `notes`, and `tags`.">
              <form className="grid gap-4" onSubmit={handleImportCsv}>
                <Field>
                  <FieldLabel htmlFor="lead-import">CSV payload</FieldLabel>
                  <FieldContent>
                    <Textarea
                      id="lead-import"
                      value={importCsv}
                      onChange={(event) => setImportCsv(event.target.value)}
                      className="min-h-52 font-mono text-xs"
                    />
                    <FieldDescription>
                      `tags` can be separated by `|`, `,`, or `;`. Invalid rows are returned with line numbers and do not block valid inserts.
                    </FieldDescription>
                  </FieldContent>
                </Field>
                <div className="flex flex-wrap gap-3">
                  <Button disabled={importLeadForm.submitting} type="submit">
                    {importLeadForm.submitting ? "Importing..." : "Import leads"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setImportCsv(importExample)}>
                    Reset sample
                  </Button>
                </div>
                {importResult?.errors.length ? (
                  <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                    <div className="font-medium">Rows that need correction</div>
                    {importResult.errors.slice(0, 8).map((item) => (
                      <div key={`${item.row}-${item.message}`} className="text-muted-foreground">
                        Row {item.row}: {item.message}
                      </div>
                    ))}
                    {importResult.errors.length > 8 ? (
                      <div className="text-muted-foreground">
                        {importResult.errors.length - 8} more row errors returned by the API.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </form>
          </CrudPanel>
        </div>
        </PageSection>

        <CrudPanel title="Lead workspace" description="Use list mode for bulk actions and board mode for status distribution.">
            <Tabs defaultValue="list" className="grid gap-4">
              <TabsList className="w-fit">
                <TabsTrigger value="list">List</TabsTrigger>
                <TabsTrigger value="board">Board</TabsTrigger>
              </TabsList>

              <TabsContent value="list" className="grid gap-4">
                <FilterBar className="lg:grid-cols-[minmax(0,1fr)_220px_auto]">
                  <Field>
                    <FieldLabel htmlFor="lead-search">Search</FieldLabel>
                    <Input
                      id="lead-search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search lead titles"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Status</FieldLabel>
                    <Select value={optionalSelectValue(statusFilter, SELECT_ALL)} onValueChange={(value) => setStatusFilter(readOptionalSelectValue(value))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_ALL}>All statuses</SelectItem>
                        {leadStatuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="flex items-end">
                    <Button type="button" variant="outline" onClick={() => void loadLeads()}>
                      Apply filters
                    </Button>
                  </div>
                </FilterBar>

                <div className="grid gap-4 rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                      <Checkbox
                        checked={leads.length > 0 && selectedLeadIds.length === leads.length}
                        onCheckedChange={(checked) => toggleSelectAllVisible(checked === true)}
                        aria-label="Select all visible leads"
                      />
                      <span className="text-sm text-muted-foreground">{selectedLeadIds.length} selected</span>
                    </div>
                    <Select value={bulkStatus || "__keep"} onValueChange={(value) => setBulkStatus(!value || value === "__keep" ? "" : value)}>
                      <SelectTrigger className="w-full md:w-52">
                        <SelectValue placeholder="Keep current status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__keep">Keep current status</SelectItem>
                        {leadStatuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={bulkSource || "__keep"} onValueChange={(value) => setBulkSource(!value || value === "__keep" ? "" : value)}>
                      <SelectTrigger className="w-full md:w-52">
                        <SelectValue placeholder="Keep current source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__keep">Keep current source</SelectItem>
                        {(leadSourceSettings?.leadSources ?? []).map((source) => (
                          <SelectItem key={source.key} value={source.key}>
                            {source.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      disabled={bulkUpdating || selectedLeadIds.length === 0 || (!bulkStatus && !bulkSource)}
                      onClick={() => void handleBulkUpdate()}
                    >
                      {bulkUpdating ? "Updating..." : "Apply bulk update"}
                    </Button>
                  </div>

                  {loading ? <LoadingState label="Loading leads..." /> : null}

                  {!loading ? (
                    <div className="grid gap-3">
                      {leads.map((lead) => (
                        <article
                          key={lead.id}
                          className="grid gap-4 rounded-xl border bg-background p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={selectedLeadIds.includes(lead.id)}
                                onCheckedChange={(checked) => toggleLeadSelection(lead.id, checked === true)}
                                aria-label={`Select lead ${lead.title}`}
                              />
                              <div className="grid gap-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="font-medium">{lead.title}</h3>
                                  <Badge variant={statusToneByValue[lead.status]}>{lead.status}</Badge>
                                  {lead.source ? <Badge variant="outline">{lead.source}</Badge> : null}
                                  {lead.partnerCompanyId ? <Badge variant="secondary">Partner assigned</Badge> : null}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {lead.fullName ?? "No contact name"}{lead.email ? ` • ${lead.email}` : ""}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Score {lead.score}{lead.phone ? ` • ${lead.phone}` : ""}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Select value={lead.status} onValueChange={(value) => value ? void handleStatusChange(lead.id, value as Lead["status"]) : undefined}>
                                <SelectTrigger className="w-40">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {leadStatuses.map((status) => (
                                    <SelectItem key={status} value={status}>
                                      {status}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={convertingLeadId === lead.id}
                                onClick={() => void handleConvertLead(lead.id)}
                              >
                                {convertingLeadId === lead.id ? "Converting..." : "Convert to deal"}
                              </Button>
                              <Button type="button" variant="ghost" onClick={() => void toggleTimeline(lead.id)}>
                                {expandedLeadId === lead.id ? "Hide timeline" : "Show timeline"}
                              </Button>
                            </div>
                          </div>

                          {expandedLeadId === lead.id ? (
                            <div className="grid gap-3 rounded-xl border bg-muted/30 p-4">
                              {timelineLoadingLeadId === lead.id ? (
                                <div className="text-sm text-muted-foreground">Loading timeline...</div>
                              ) : null}
                              {(timelineByLead[lead.id] ?? []).length ? (
                                <div className="grid gap-2">
                                  {(timelineByLead[lead.id] ?? []).map((activity) => (
                                    <div key={activity.id} className="rounded-lg border bg-background p-3 text-sm">
                                      <div className="font-medium">{activity.type}</div>
                                      <div className="text-muted-foreground">
                                        {String(activity.payload?.message ?? "") || JSON.stringify(activity.payload)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : timelineLoadingLeadId !== lead.id ? (
                                <div className="text-sm text-muted-foreground">No timeline activity yet.</div>
                              ) : null}
                              <div className="flex flex-col gap-3 sm:flex-row">
                                <Input
                                  value={timelineDraftByLead[lead.id] ?? ""}
                                  onChange={(event) =>
                                    setTimelineDraftByLead((prev) => ({ ...prev, [lead.id]: event.target.value }))
                                  }
                                  placeholder="Add timeline note"
                                />
                                <Button type="button" onClick={() => void addTimelineNote(lead.id)}>
                                  Add note
                                </Button>
                              </div>
                              <div className="grid gap-3 rounded-lg border bg-background p-3">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <div className="font-medium">Attachments</div>
                                  <label className="text-sm text-muted-foreground">
                                    <input
                                      type="file"
                                      className="hidden"
                                      onChange={(event) => {
                                        const nextFile = event.target.files?.[0] ?? null;
                                        void uploadLeadDocument(lead.id, nextFile);
                                        event.currentTarget.value = "";
                                      }}
                                    />
                                    <span className="cursor-pointer underline underline-offset-4">
                                      {uploadingLeadId === lead.id ? "Uploading..." : "Upload file"}
                                    </span>
                                  </label>
                                </div>
                                {(documentsByLead[lead.id] ?? []).map((document) => (
                                  <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                                    <div>
                                      <div className="font-medium">{document.originalName}</div>
                                      <div className="text-muted-foreground">
                                        {document.folder} • {document.mimeType ?? "unknown"} • {Math.max(1, Math.round(document.sizeBytes / 1024))} KB
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <a
                                        href={buildApiUrl(`/documents/${document.id}/download`, { companyId })}
                                        className="font-medium underline underline-offset-4"
                                      >
                                        Download
                                      </a>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        disabled={deletingDocumentId === document.id}
                                        onClick={() => void deleteLeadDocument(lead.id, document.id)}
                                      >
                                        {deletingDocumentId === document.id ? "Deleting..." : "Delete"}
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                                {(documentsByLead[lead.id] ?? []).length === 0 ? (
                                  <div className="text-sm text-muted-foreground">No attachments uploaded for this lead yet.</div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </article>
                      ))}
                      {leads.length === 0 ? (
                        <EmptyState title="No leads found" description="Adjust the filters or create/import a lead." />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="board" className="grid gap-4">
                <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/30 p-4">
                  <Field className="min-w-52 flex-1">
                    <FieldLabel>Source filter</FieldLabel>
                    <Select value={optionalSelectValue(sourceFilter, SELECT_ALL)} onValueChange={(value) => setSourceFilter(readOptionalSelectValue(value))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="All sources" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SELECT_ALL}>All sources</SelectItem>
                        {(leadSourceSettings?.leadSources ?? []).map((source) => (
                          <SelectItem key={source.key} value={source.key}>
                            {source.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Button type="button" variant="outline" onClick={() => void loadBoard()}>
                    Refresh board
                  </Button>
                </div>

                <div className="grid gap-4 xl:grid-cols-5">
                  {(board?.columns ?? []).map((column) => (
                    <Card key={column.key} className="bg-muted/20">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between gap-2 text-sm">
                          <span className="capitalize">{column.label}</span>
                          <Badge variant="outline">{column.items.length}</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid gap-3">
                        {column.items.map((lead) => (
                          <div key={lead.id} className={cn("grid gap-1 rounded-xl border bg-background p-3")}>
                            <div className="font-medium">{lead.title}</div>
                            <div className="text-sm text-muted-foreground">{lead.fullName ?? "No contact name"}</div>
                            <div className="text-xs text-muted-foreground">{lead.source ?? "Unspecified source"}</div>
                          </div>
                        ))}
                        {column.items.length === 0 ? (
                          <EmptyState title="No leads in this status" description="Move or create leads to populate this board column." className="bg-background" />
                        ) : null}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
        </CrudPanel>
      </div>
    </AppShell>
  );
}
