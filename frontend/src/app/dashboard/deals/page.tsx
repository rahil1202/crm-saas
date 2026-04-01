"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ApiError, apiRequest } from "@/lib/api";

type DealStatus = "open" | "won" | "lost";

interface Deal {
  id: string;
  title: string;
  status: DealStatus;
  pipeline: string;
  stage: string;
  value: number;
}

interface ListResponse {
  items: Deal[];
}

const statuses: DealStatus[] = ["open", "won", "lost"];

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("0");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await apiRequest("/deals", {
        method: "POST",
        body: JSON.stringify({ title, value: Number(value) || 0 }),
      });
      setTitle("");
      setValue("0");
      await loadDeals();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to create deal");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (dealId: string, status: DealStatus) => {
    try {
      await apiRequest(`/deals/${dealId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadDeals();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update deal");
    }
  };

  return (
    <AppShell
      title="Deals"
      description="Tenant-scoped deals workspace with create/list/update operations wired to backend APIs."
    >
      <section style={{ background: "#fff", border: "1px solid #dbe1e8", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Create deal</h2>
        <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Deal title" required style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
          <input value={value} onChange={(event) => setValue(event.target.value)} type="number" min={0} placeholder="Value" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
          <button type="submit" disabled={submitting} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#102031", color: "white" }}>
            {submitting ? "Creating..." : "Create"}
          </button>
        </form>
      </section>

      <section style={{ background: "#fff", border: "1px solid #dbe1e8", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Deal list</h2>
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
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span>Status</span>
                  <select value={deal.status} onChange={(event) => void updateStatus(deal.id, event.target.value as DealStatus)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #d2d9e0" }}>
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            ))}
            {deals.length === 0 ? <p>No deals found.</p> : null}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
