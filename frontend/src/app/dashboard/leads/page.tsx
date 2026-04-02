"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ApiError, apiRequest } from "@/lib/api";

interface Lead {
  id: string;
  title: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
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

interface ListLeadResponse {
  items: Lead[];
  total: number;
  limit: number;
  offset: number;
}

interface TimelineResponse {
  items: LeadActivity[];
}

interface ConvertLeadResponse {
  leadId: string;
  dealId: string;
  customerId: string | null;
  converted: true;
}

const leadStatuses = ["new", "qualified", "proposal", "won", "lost"] as const;

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newLeadTitle, setNewLeadTitle] = useState("");
  const [newLeadName, setNewLeadName] = useState("");
  const [newLeadEmail, setNewLeadEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);

  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [timelineByLead, setTimelineByLead] = useState<Record<string, LeadActivity[]>>({});
  const [timelineDraftByLead, setTimelineDraftByLead] = useState<Record<string, string>>({});
  const [timelineLoadingLeadId, setTimelineLoadingLeadId] = useState<string | null>(null);

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

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  const handleCreateLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError(null);

    try {
      await apiRequest<Lead>("/leads", {
        method: "POST",
        body: JSON.stringify({
          title: newLeadTitle,
          fullName: newLeadName || undefined,
          email: newLeadEmail || undefined,
        }),
      });

      setNewLeadTitle("");
      setNewLeadName("");
      setNewLeadEmail("");
      await loadLeads();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to create lead");
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (leadId: string, status: Lead["status"]) => {
    try {
      await apiRequest<Lead>(`/leads/${leadId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadLeads();
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
    await loadTimeline(leadId);
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

  return (
    <AppShell
      title="Leads"
      description="Lead workspace with tenant-scoped CRUD, conversion, filters, and timeline activities."
    >
      <section style={{ background: "#fff", border: "1px solid #dbe1e8", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Create lead</h2>
        <form onSubmit={handleCreateLead} style={{ display: "grid", gap: 10 }}>
          <input value={newLeadTitle} onChange={(event) => setNewLeadTitle(event.target.value)} placeholder="Lead title" required style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
          <input value={newLeadName} onChange={(event) => setNewLeadName(event.target.value)} placeholder="Contact name" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
          <input value={newLeadEmail} onChange={(event) => setNewLeadEmail(event.target.value)} placeholder="Contact email" type="email" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
          <button type="submit" disabled={creating} style={{ width: "fit-content", padding: "10px 14px", borderRadius: 10, border: "none", background: "#102031", color: "#fff", cursor: "pointer" }}>
            {creating ? "Creating..." : "Create lead"}
          </button>
        </form>
      </section>

      <section style={{ background: "#fff", border: "1px solid #dbe1e8", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Lead list</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}>
            <option value="">All statuses</option>
            {leadStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void loadLeads()} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0", cursor: "pointer" }}>
            Apply filters
          </button>
        </div>

        {error ? <p style={{ color: "#b02020" }}>{error}</p> : null}
        {loading ? <p>Loading leads...</p> : null}

        {!loading ? (
          <div style={{ display: "grid", gap: 10 }}>
            {leads.map((lead) => (
              <article key={lead.id} style={{ border: "1px solid #e1e6ec", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
                <strong>{lead.title}</strong>
                <span style={{ color: "#556371" }}>{lead.fullName ?? "No contact name"}</span>
                <span style={{ color: "#556371" }}>{lead.email ?? "No email"}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>Status</span>
                  <select value={lead.status} onChange={(event) => void handleStatusChange(lead.id, event.target.value as Lead["status"])} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d2d9e0" }}>
                    {leadStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={convertingLeadId === lead.id} onClick={() => void handleConvertLead(lead.id)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d2d9e0", background: "#f8fbff", cursor: "pointer" }}>
                    {convertingLeadId === lead.id ? "Converting..." : "Convert to deal"}
                  </button>
                  <button type="button" onClick={() => void toggleTimeline(lead.id)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d2d9e0", background: "#fff", cursor: "pointer" }}>
                    {expandedLeadId === lead.id ? "Hide timeline" : "Show timeline"}
                  </button>
                </div>

                {expandedLeadId === lead.id ? (
                  <div style={{ marginTop: 8, borderTop: "1px solid #e8edf3", paddingTop: 10, display: "grid", gap: 8 }}>
                    {timelineLoadingLeadId === lead.id ? <p>Loading timeline...</p> : null}
                    {(timelineByLead[lead.id] ?? []).map((activity) => (
                      <div key={activity.id} style={{ fontSize: 13, color: "#35414d" }}>
                        <strong>{activity.type}</strong> - {String(activity.payload?.message ?? "") || JSON.stringify(activity.payload)}
                      </div>
                    ))}
                    {(timelineByLead[lead.id] ?? []).length === 0 && timelineLoadingLeadId !== lead.id ? <p>No timeline activity yet.</p> : null}
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={timelineDraftByLead[lead.id] ?? ""} onChange={(event) => setTimelineDraftByLead((prev) => ({ ...prev, [lead.id]: event.target.value }))} placeholder="Add timeline note" style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #d2d9e0" }} />
                      <button type="button" onClick={() => void addTimelineNote(lead.id)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d2d9e0", background: "#fff" }}>
                        Add
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
            {leads.length === 0 ? <p>No leads found for this workspace.</p> : null}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
