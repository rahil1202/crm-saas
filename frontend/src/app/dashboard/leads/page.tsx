"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { apiRequest, ApiError } from "@/lib/api";

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

interface ListLeadResponse {
  items: Lead[];
  total: number;
  limit: number;
  offset: number;
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
      if (requestError instanceof ApiError) {
        setError(requestError.message);
      } else {
        setError("Unable to load leads");
      }
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter]);

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
      if (requestError instanceof ApiError) {
        setError(requestError.message);
      } else {
        setError("Unable to create lead");
      }
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
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setError(requestError.message);
      } else {
        setError("Unable to update lead");
      }
    }
  };

  return (
    <AppShell
      title="Leads"
      description="Lead workspace with tenant-scoped CRUD, filters, and assignment-ready records."
    >
      <section
        style={{
          background: "#fff",
          border: "1px solid #dbe1e8",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Create lead</h2>
        <form onSubmit={handleCreateLead} style={{ display: "grid", gap: 10 }}>
          <input
            value={newLeadTitle}
            onChange={(event) => setNewLeadTitle(event.target.value)}
            placeholder="Lead title"
            required
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}
          />
          <input
            value={newLeadName}
            onChange={(event) => setNewLeadName(event.target.value)}
            placeholder="Contact name"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}
          />
          <input
            value={newLeadEmail}
            onChange={(event) => setNewLeadEmail(event.target.value)}
            placeholder="Contact email"
            type="email"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}
          />
          <button
            type="submit"
            disabled={creating}
            style={{
              width: "fit-content",
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#102031",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {creating ? "Creating..." : "Create lead"}
          </button>
        </form>
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #dbe1e8",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Lead list</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title"
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}
          >
            <option value="">All statuses</option>
            {leadStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadLeads()}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0", cursor: "pointer" }}
          >
            Apply filters
          </button>
        </div>

        {error ? <p style={{ color: "#b02020" }}>{error}</p> : null}
        {loading ? <p>Loading leads...</p> : null}

        {!loading ? (
          <div style={{ display: "grid", gap: 10 }}>
            {leads.map((lead) => (
              <article
                key={lead.id}
                style={{
                  border: "1px solid #e1e6ec",
                  borderRadius: 10,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <strong>{lead.title}</strong>
                <span style={{ color: "#556371" }}>{lead.fullName ?? "No contact name"}</span>
                <span style={{ color: "#556371" }}>{lead.email ?? "No email"}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>Status</span>
                  <select
                    value={lead.status}
                    onChange={(event) => void handleStatusChange(lead.id, event.target.value as Lead["status"])}
                    style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d2d9e0" }}
                  >
                    {leadStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))}
            {leads.length === 0 ? <p>No leads found for this workspace.</p> : null}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
