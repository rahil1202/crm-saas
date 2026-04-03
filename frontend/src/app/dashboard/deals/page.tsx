"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AppShell } from "@/components/app-shell";
import { buildApiUrl, ApiError, apiRequest } from "@/lib/api";
import { getCompanyCookie } from "@/lib/cookies";

type DealStatus = "open" | "won" | "lost";

interface Deal {
  id: string;
  title: string;
  status: DealStatus;
  pipeline: string;
  stage: string;
  value: number;
  expectedCloseDate?: string | null;
  partnerCompanyId?: string | null;
}

interface DealActivity {
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

interface ListResponse {
  items: Deal[];
}

interface TimelineResponse {
  items: DealActivity[];
}

interface DocumentListResponse {
  items: DocumentItem[];
}

interface DealBoardResponse {
  pipeline: {
    key: string;
    label: string;
  };
  availablePipelines: Array<{
    key: string;
    label: string;
  }>;
  columns: Array<{
    key: string;
    label: string;
    totalValue: number;
    items: Deal[];
  }>;
  wonCount: number;
  lostCount: number;
}

interface DealForecastResponse {
  summary: {
    openValue: number;
    forecastValue: number;
    overdueValue: number;
    unassignedForecastValue: number;
    currentMonthValue: number;
    nextMonthValue: number;
  };
  buckets: Array<{
    key: string;
    label: string;
    value: number;
    count: number;
  }>;
  upcomingDeals: Deal[];
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

const statuses: DealStatus[] = ["open", "won", "lost"];

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("0");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [partnerCompanyId, setPartnerCompanyId] = useState("");
  const [pipelineSettings, setPipelineSettings] = useState<PipelineSettings | null>(null);
  const [partners, setPartners] = useState<PartnerListResponse["items"]>([]);
  const [pipeline, setPipeline] = useState("default");
  const [stage, setStage] = useState("new");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [board, setBoard] = useState<DealBoardResponse | null>(null);
  const [forecast, setForecast] = useState<DealForecastResponse | null>(null);
  const [boardPipeline, setBoardPipeline] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);
  const [timelineByDeal, setTimelineByDeal] = useState<Record<string, DealActivity[]>>({});
  const [timelineDraftByDeal, setTimelineDraftByDeal] = useState<Record<string, string>>({});
  const [timelineLoadingDealId, setTimelineLoadingDealId] = useState<string | null>(null);
  const [documentsByDeal, setDocumentsByDeal] = useState<Record<string, DocumentItem[]>>({});
  const [uploadingDealId, setUploadingDealId] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);

  const companyId = getCompanyCookie();

  const loadDeals = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusFilter) {
      params.set("status", statusFilter);
    }

    try {
      const data = await apiRequest<ListResponse>(`/deals?${params.toString()}`);
      setDeals(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load deals");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadPipelineSettings = useCallback(async () => {
    try {
      const [pipelineData, partnerData] = await Promise.all([
        apiRequest<PipelineSettings>("/settings/pipelines"),
        apiRequest<PartnerListResponse>("/partners"),
      ]);
      setPipelineSettings(pipelineData);
      setPartners(partnerData.items.filter((item) => item.status === "active"));
      setPipeline(pipelineData.defaultDealPipeline);
      setBoardPipeline(pipelineData.defaultDealPipeline);
      const defaultPipeline =
        pipelineData.dealPipelines.find((item) => item.key === pipelineData.defaultDealPipeline) ?? pipelineData.dealPipelines[0];
      setStage(defaultPipeline?.stages[0]?.key ?? "new");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load pipeline settings");
    }
  }, []);

  const activePipeline = pipelineSettings?.dealPipelines.find((item) => item.key === pipeline) ?? null;

  const loadForecast = useCallback(async () => {
    try {
      const data = await apiRequest<DealForecastResponse>("/deals/forecast?horizonMonths=6");
      setForecast(data);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load deal forecast");
    }
  }, []);

  const loadBoard = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (boardPipeline) {
        params.set("pipeline", boardPipeline);
      }
      const data = await apiRequest<DealBoardResponse>(`/deals/board?${params.toString()}`);
      setBoard(data);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load deal board");
    }
  }, [boardPipeline]);

  const loadTimeline = useCallback(async (dealId: string) => {
    setTimelineLoadingDealId(dealId);
    try {
      const data = await apiRequest<TimelineResponse>(`/deals/${dealId}/timeline`);
      setTimelineByDeal((prev) => ({ ...prev, [dealId]: data.items }));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load deal timeline");
    } finally {
      setTimelineLoadingDealId(null);
    }
  }, []);

  const loadDealDocuments = useCallback(async (dealId: string) => {
    try {
      const data = await apiRequest<DocumentListResponse>(`/documents/list?entityType=deal&entityId=${dealId}`);
      setDocumentsByDeal((prev) => ({ ...prev, [dealId]: data.items }));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load deal attachments");
    }
  }, []);

  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

  useEffect(() => {
    void loadPipelineSettings();
  }, [loadPipelineSettings]);

  useEffect(() => {
    if (boardPipeline) {
      void loadBoard();
    }
  }, [boardPipeline, loadBoard]);

  useEffect(() => {
    void loadForecast();
  }, [loadForecast]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await apiRequest("/deals", {
        method: "POST",
        body: JSON.stringify({
          title,
          value: Number(value) || 0,
          pipeline,
          stage,
          expectedCloseDate: expectedCloseDate ? new Date(`${expectedCloseDate}T00:00:00.000Z`).toISOString() : undefined,
          partnerCompanyId: partnerCompanyId || undefined,
        }),
      });
      setTitle("");
      setValue("0");
      setExpectedCloseDate("");
      setPartnerCompanyId("");
      await loadDeals();
      await loadBoard();
      await loadForecast();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to create deal");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePipelineChange = (nextPipeline: string) => {
    setPipeline(nextPipeline);
    const next = pipelineSettings?.dealPipelines.find((item) => item.key === nextPipeline);
    setStage(next?.stages[0]?.key ?? "new");
  };

  const updateStatus = async (dealId: string, status: DealStatus) => {
    try {
      await apiRequest(`/deals/${dealId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadDeals();
      await loadBoard();
      await loadForecast();
      if (expandedDealId === dealId) {
        await loadTimeline(dealId);
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update deal");
    }
  };

  const updateExpectedCloseDate = async (dealId: string, nextDate: string) => {
    try {
      await apiRequest(`/deals/${dealId}`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedCloseDate: nextDate ? new Date(`${nextDate}T00:00:00.000Z`).toISOString() : null,
        }),
      });
      await loadDeals();
      await loadBoard();
      await loadForecast();
      if (expandedDealId === dealId) {
        await loadTimeline(dealId);
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update close date");
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) {
      return "No close date";
    }

    return new Date(value).toLocaleDateString();
  };

  const toggleTimeline = async (dealId: string) => {
    if (expandedDealId === dealId) {
      setExpandedDealId(null);
      return;
    }

    setExpandedDealId(dealId);
    await Promise.all([loadTimeline(dealId), loadDealDocuments(dealId)]);
  };

  const addTimelineNote = async (dealId: string) => {
    const message = (timelineDraftByDeal[dealId] ?? "").trim();
    if (!message) {
      return;
    }

    try {
      await apiRequest(`/deals/${dealId}/timeline`, {
        method: "POST",
        body: JSON.stringify({ type: "note", message }),
      });
      setTimelineDraftByDeal((prev) => ({ ...prev, [dealId]: "" }));
      await loadTimeline(dealId);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to add deal timeline note");
    }
  };

  const uploadDealDocument = async (dealId: string, file: File | null) => {
    if (!file) {
      return;
    }

    setUploadingDealId(dealId);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("entityType", "deal");
      formData.set("entityId", dealId);
      formData.set("folder", "deals");

      await apiRequest("/documents/upload", {
        method: "POST",
        body: formData,
      });

      await loadDealDocuments(dealId);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to upload deal attachment");
    } finally {
      setUploadingDealId(null);
    }
  };

  const deleteDealDocument = async (dealId: string, documentId: string) => {
    setDeletingDocumentId(documentId);
    setError(null);

    try {
      await apiRequest(`/documents/${documentId}`, {
        method: "DELETE",
      });
      await loadDealDocuments(dealId);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to delete deal attachment");
    } finally {
      setDeletingDocumentId(null);
    }
  };

  return (
    <AppShell
      title="Deals"
      description="Tenant-scoped deals workspace with timeline tracking for lifecycle changes."
    >
      <section style={{ background: "#fff", border: "1px solid #dbe1e8", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Create deal</h2>
        <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Deal title" required style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
          <input value={value} onChange={(event) => setValue(event.target.value)} type="number" min={0} placeholder="Value" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
          <input value={expectedCloseDate} onChange={(event) => setExpectedCloseDate(event.target.value)} type="date" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
          <select value={partnerCompanyId} onChange={(event) => setPartnerCompanyId(event.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}>
            <option value="">No partner</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </select>
          <select value={pipeline} onChange={(event) => handlePipelineChange(event.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}>
            {(pipelineSettings?.dealPipelines ?? [{ key: "default", label: "Default Pipeline", stages: [{ key: "new", label: "New" }] }]).map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <select value={stage} onChange={(event) => setStage(event.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}>
            {(activePipeline?.stages ?? [{ key: "new", label: "New" }]).map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={submitting} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#102031", color: "white" }}>
            {submitting ? "Creating..." : "Create"}
          </button>
        </form>
      </section>

      <section style={{ background: "#fff", border: "1px solid #dbe1e8", borderRadius: 12, padding: 16, marginBottom: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Forecast</h2>
          <span style={{ color: "#556371" }}>6-month revenue projection from open deals with close dates</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {[
            { label: "Open pipeline", value: forecast?.summary.openValue ?? 0 },
            { label: "Forecast window", value: forecast?.summary.forecastValue ?? 0 },
            { label: "This month", value: forecast?.summary.currentMonthValue ?? 0 },
            { label: "Next month", value: forecast?.summary.nextMonthValue ?? 0 },
            { label: "Overdue close dates", value: forecast?.summary.overdueValue ?? 0 },
            { label: "Missing close dates", value: forecast?.summary.unassignedForecastValue ?? 0 },
          ].map((item) => (
            <div key={item.label} style={{ border: "1px solid #e1e6ec", borderRadius: 10, padding: 12, background: "#f8fbff" }}>
              <div style={{ color: "#556371", fontSize: 13 }}>{item.label}</div>
              <strong style={{ fontSize: 20 }}>{item.value}</strong>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)", gap: 12 }}>
          <div style={{ border: "1px solid #e1e6ec", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
            <strong>Monthly buckets</strong>
            {(forecast?.buckets ?? []).map((bucket) => (
              <div key={bucket.key} style={{ display: "grid", gridTemplateColumns: "140px 1fr auto", gap: 10, alignItems: "center" }}>
                <span style={{ color: "#35414d", fontSize: 14 }}>{bucket.label}</span>
                <div style={{ height: 10, borderRadius: 999, background: "#e8edf3", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${bucket.value > 0
                        ? Math.max(
                            8,
                            forecast?.summary.forecastValue
                              ? Math.round((bucket.value / forecast.summary.forecastValue) * 100)
                              : 0,
                          )
                        : 0}%`,
                      background: "#102031",
                    }}
                  />
                </div>
                <span style={{ color: "#556371", fontSize: 13 }}>
                  {bucket.count} deals · {bucket.value}
                </span>
              </div>
            ))}
            {(forecast?.buckets.length ?? 0) === 0 ? <p style={{ margin: 0, color: "#556371" }}>No forecast data available yet.</p> : null}
          </div>

          <div style={{ border: "1px solid #e1e6ec", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
            <strong>Upcoming deals</strong>
            {(forecast?.upcomingDeals ?? []).map((deal) => (
              <div key={deal.id} style={{ border: "1px solid #e8edf3", borderRadius: 10, padding: 10, background: "#fff" }}>
                <div style={{ fontWeight: 600 }}>{deal.title}</div>
                <div style={{ color: "#556371", fontSize: 13 }}>{formatDate(deal.expectedCloseDate)}</div>
                <div style={{ color: "#556371", fontSize: 13 }}>
                  {deal.pipeline} / {deal.stage} · {deal.value}
                </div>
              </div>
            ))}
            {(forecast?.upcomingDeals.length ?? 0) === 0 ? <p style={{ margin: 0, color: "#556371" }}>No upcoming forecasted deals.</p> : null}
          </div>
        </div>
      </section>

      <section style={{ background: "#fff", border: "1px solid #dbe1e8", borderRadius: 12, padding: 16 }}>
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="board">Board</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <h2 style={{ marginTop: 16 }}>Deal list</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}>
                <option value="">All statuses</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => void loadDeals()} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}>
                Filter
              </button>
            </div>

            {error ? <p style={{ color: "#b02020" }}>{error}</p> : null}
            {loading ? <p>Loading deals...</p> : null}

            {!loading ? (
              <div style={{ display: "grid", gap: 10 }}>
                {deals.map((deal) => (
                  <article key={deal.id} style={{ border: "1px solid #e1e6ec", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
                    <strong>{deal.title}</strong>
                    <span style={{ color: "#556371" }}>Value: {deal.value}</span>
                    <span style={{ color: "#556371" }}>Pipeline: {deal.pipeline} / {deal.stage}</span>
                    <span style={{ color: "#556371" }}>Expected close: {formatDate(deal.expectedCloseDate)}</span>
                    <span style={{ color: "#556371" }}>Partner: {deal.partnerCompanyId ? "Assigned" : "Unassigned"}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span>Status</span>
                      <select value={deal.status} onChange={(event) => void updateStatus(deal.id, event.target.value as DealStatus)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d2d9e0" }}>
                        {statuses.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toISOString().slice(0, 10) : ""}
                        onChange={(event) => void updateExpectedCloseDate(deal.id, event.target.value)}
                        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d2d9e0" }}
                      />
                      <button type="button" onClick={() => void toggleTimeline(deal.id)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d2d9e0", background: "#fff" }}>
                        {expandedDealId === deal.id ? "Hide timeline" : "Show timeline"}
                      </button>
                    </div>

                    {expandedDealId === deal.id ? (
                      <div style={{ marginTop: 8, borderTop: "1px solid #e8edf3", paddingTop: 10, display: "grid", gap: 8 }}>
                        {timelineLoadingDealId === deal.id ? <p>Loading timeline...</p> : null}
                        {(timelineByDeal[deal.id] ?? []).map((activity) => (
                          <div key={activity.id} style={{ fontSize: 13, color: "#35414d" }}>
                            <strong>{activity.type}</strong> - {String(activity.payload?.message ?? "") || JSON.stringify(activity.payload)}
                          </div>
                        ))}
                        {(timelineByDeal[deal.id] ?? []).length === 0 && timelineLoadingDealId !== deal.id ? <p>No timeline activity yet.</p> : null}
                        <div style={{ display: "flex", gap: 8 }}>
                          <input value={timelineDraftByDeal[deal.id] ?? ""} onChange={(event) => setTimelineDraftByDeal((prev) => ({ ...prev, [deal.id]: event.target.value }))} placeholder="Add timeline note" style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #d2d9e0" }} />
                          <button type="button" onClick={() => void addTimelineNote(deal.id)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d2d9e0", background: "#fff" }}>
                            Add
                          </button>
                        </div>
                        <div style={{ display: "grid", gap: 8, border: "1px solid #e8edf3", borderRadius: 10, padding: 10, background: "#fff" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                            <strong>Attachments</strong>
                            <label style={{ color: "#556371", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
                              <input
                                type="file"
                                style={{ display: "none" }}
                                onChange={(event) => {
                                  const nextFile = event.target.files?.[0] ?? null;
                                  void uploadDealDocument(deal.id, nextFile);
                                  event.currentTarget.value = "";
                                }}
                              />
                              {uploadingDealId === deal.id ? "Uploading..." : "Upload file"}
                            </label>
                          </div>
                          {(documentsByDeal[deal.id] ?? []).map((document) => (
                            <div key={document.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", border: "1px solid #e8edf3", borderRadius: 10, padding: 10 }}>
                              <div>
                                <div style={{ fontWeight: 600 }}>{document.originalName}</div>
                                <div style={{ color: "#556371", fontSize: 13 }}>
                                  {document.folder} • {document.mimeType ?? "unknown"} • {Math.max(1, Math.round(document.sizeBytes / 1024))} KB
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                                <a href={buildApiUrl(`/documents/${document.id}/download`, { companyId })} style={{ color: "#102031", fontWeight: 600 }}>
                                  Download
                                </a>
                                <button
                                  type="button"
                                  disabled={deletingDocumentId === document.id}
                                  onClick={() => void deleteDealDocument(deal.id, document.id)}
                                  style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d2d9e0", background: "#fff" }}
                                >
                                  {deletingDocumentId === document.id ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </div>
                          ))}
                          {(documentsByDeal[deal.id] ?? []).length === 0 ? <p style={{ margin: 0, color: "#556371", fontSize: 13 }}>No attachments uploaded for this deal yet.</p> : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
                {deals.length === 0 ? <p>No deals found.</p> : null}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="board">
            <div style={{ display: "flex", gap: 8, marginTop: 16, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Pipeline board</h2>
              <select value={boardPipeline} onChange={(event) => setBoardPipeline(event.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}>
                {(board?.availablePipelines ?? pipelineSettings?.dealPipelines ?? []).map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span style={{ color: "#556371" }}>Won: {board?.wonCount ?? 0}</span>
              <span style={{ color: "#556371" }}>Lost: {board?.lostCount ?? 0}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, alignItems: "start" }}>
              {(board?.columns ?? []).map((column) => (
                <div key={column.key} style={{ border: "1px solid #e1e6ec", borderRadius: 12, padding: 12, background: "#f8fbff", display: "grid", gap: 10 }}>
                  <div>
                    <strong>{column.label}</strong>
                    <div style={{ color: "#556371", fontSize: 13 }}>{column.items.length} deals · value {column.totalValue}</div>
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {column.items.map((deal) => (
                      <article key={deal.id} style={{ border: "1px solid #dbe1e8", borderRadius: 10, padding: 10, background: "#fff", display: "grid", gap: 4 }}>
                        <strong>{deal.title}</strong>
                        <span style={{ color: "#556371", fontSize: 13 }}>Value: {deal.value}</span>
                        <span style={{ color: "#556371", fontSize: 13 }}>Status: {deal.status}</span>
                        <span style={{ color: "#556371", fontSize: 13 }}>{deal.partnerCompanyId ? "Partner assigned" : "No partner"}</span>
                      </article>
                    ))}
                    {column.items.length === 0 ? <p style={{ margin: 0, color: "#556371", fontSize: 13 }}>No deals in this stage.</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </AppShell>
  );
}
