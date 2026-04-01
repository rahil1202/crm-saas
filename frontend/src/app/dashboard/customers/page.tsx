"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ApiError, apiRequest } from "@/lib/api";

interface Customer {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

interface ListResponse {
  items: Customer[];
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }

    try {
      const data = await apiRequest<ListResponse>(`/customers?${params.toString()}`);
      setCustomers(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load customers");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await apiRequest("/customers", {
        method: "POST",
        body: JSON.stringify({ fullName: name, email: email || undefined }),
      });
      setName("");
      setEmail("");
      await loadCustomers();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to create customer");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Customers"
      description="Tenant-scoped customer directory with create/list operations wired to the backend."
    >
      <section style={{ background: "#fff", border: "1px solid #dbe1e8", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Create customer</h2>
        <form onSubmit={handleCreate} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" required style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" type="email" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
          <button type="submit" disabled={submitting} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#102031", color: "white" }}>
            {submitting ? "Creating..." : "Create"}
          </button>
        </form>
      </section>

      <section style={{ background: "#fff", border: "1px solid #dbe1e8", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Customer list</h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
          <button type="button" onClick={() => void loadCustomers()} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}>
            Filter
          </button>
        </div>
        {error ? <p style={{ color: "#b02020" }}>{error}</p> : null}
        {loading ? <p>Loading customers...</p> : null}
        {!loading ? (
          <div style={{ display: "grid", gap: 10 }}>
            {customers.map((customer) => (
              <article key={customer.id} style={{ border: "1px solid #e1e6ec", borderRadius: 10, padding: 12 }}>
                <strong>{customer.fullName}</strong>
                <div style={{ color: "#556371" }}>{customer.email ?? "No email"}</div>
              </article>
            ))}
            {customers.length === 0 ? <p>No customers found.</p> : null}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
