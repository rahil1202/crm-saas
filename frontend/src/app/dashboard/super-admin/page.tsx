"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, apiRequest } from "@/lib/api";

interface AdminSummary {
  companies: number;
  activePlans: number;
  superAdmins: number;
}

interface AdminCompany {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  createdAt: string;
  planCode: string | null;
  planName: string | null;
  planStatus: "trial" | "active" | "past_due" | "canceled" | null;
  billingInterval: "monthly" | "yearly" | "custom" | null;
  seatLimit: number | null;
  monthlyPrice: number | null;
  activeMembers: number;
}

interface AdminCompanyListResponse {
  items: AdminCompany[];
}

export default function SuperAdminPage() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [query, setQuery] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [planCode, setPlanCode] = useState("starter");
  const [planName, setPlanName] = useState("Starter");
  const [status, setStatus] = useState<"trial" | "active" | "past_due" | "canceled">("trial");
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly" | "custom">("monthly");
  const [seatLimit, setSeatLimit] = useState("5");
  const [monthlyPrice, setMonthlyPrice] = useState("0");
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  const load = async (search = "") => {
    setLoading(true);
    setError(null);

    try {
      const searchQuery = search ? `?q=${encodeURIComponent(search)}` : "";
      const [summaryPayload, companiesPayload] = await Promise.all([
        apiRequest<AdminSummary>("/admin/summary"),
        apiRequest<AdminCompanyListResponse>(`/admin/companies${searchQuery}`),
      ]);

      setSummary(summaryPayload);
      setCompanies(companiesPayload.items);
      const nextCompany = companiesPayload.items[0] ?? null;
      const effectiveSelection =
        companiesPayload.items.find((item) => item.id === selectedCompanyId) ?? nextCompany;

      if (effectiveSelection) {
        setSelectedCompanyId(effectiveSelection.id);
        setPlanCode(effectiveSelection.planCode ?? "starter");
        setPlanName(effectiveSelection.planName ?? "Starter");
        setStatus(effectiveSelection.planStatus ?? "trial");
        setBillingInterval(effectiveSelection.billingInterval ?? "monthly");
        setSeatLimit(String(effectiveSelection.seatLimit ?? 5));
        setMonthlyPrice(String(effectiveSelection.monthlyPrice ?? 0));
        setCurrency(effectiveSelection.currency ?? "USD");
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load super-admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCompany) {
      return;
    }

    setPlanCode(selectedCompany.planCode ?? "starter");
    setPlanName(selectedCompany.planName ?? "Starter");
    setStatus(selectedCompany.planStatus ?? "trial");
    setBillingInterval(selectedCompany.billingInterval ?? "monthly");
    setSeatLimit(String(selectedCompany.seatLimit ?? 5));
    setMonthlyPrice(String(selectedCompany.monthlyPrice ?? 0));
    setCurrency(selectedCompany.currency ?? "USD");
  }, [selectedCompany]);

  const savePlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedCompanyId) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiRequest(`/companies/${selectedCompanyId}/plan`, {
        method: "PATCH",
        body: JSON.stringify({
          planCode,
          planName,
          status,
          billingInterval,
          seatLimit: Number(seatLimit),
          monthlyPrice: Number(monthlyPrice),
          currency,
          trialEndsAt: status === "trial" ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() : null,
          renewalDate: status === "active" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
          notes: null,
        }),
      });

      await load(query);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update company plan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell
      title="Super Admin"
      description="Cross-tenant workspace oversight for company inventory, subscription plans, and platform administration."
    >
      <div className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Super-admin request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <CardDescription>Companies</CardDescription>
              <CardTitle className="text-2xl">{summary?.companies ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Active plans</CardDescription>
              <CardTitle className="text-2xl">{summary?.activePlans ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Super admins</CardDescription>
              <CardTitle className="text-2xl">{summary?.superAdmins ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Card>
            <CardHeader>
              <CardTitle>Company inventory</CardTitle>
              <CardDescription>Search all companies and inspect their current subscription posture.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex gap-3">
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search companies" />
                <Button type="button" variant="outline" onClick={() => void load(query)} disabled={loading}>
                  Search
                </Button>
              </div>

              {loading ? <div className="text-sm text-muted-foreground">Loading companies...</div> : null}

              <div className="grid gap-3">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => setSelectedCompanyId(company.id)}
                    className="grid gap-2 rounded-xl border bg-background px-4 py-3 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{company.name}</span>
                      {company.planStatus ? <Badge variant="outline">{company.planStatus}</Badge> : null}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {company.activeMembers} active members • {company.planName ?? "No plan"} • ${company.monthlyPrice ?? 0}/mo
                    </div>
                  </button>
                ))}
                {companies.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    No companies found.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plan editor</CardTitle>
              <CardDescription>Set or correct the commercial plan attached to the selected company.</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedCompany ? (
                <form className="grid gap-4" onSubmit={savePlan}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel>Selected company</FieldLabel>
                      <Input value={selectedCompany.name} readOnly />
                    </Field>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="plan-code">Plan code</FieldLabel>
                        <Input id="plan-code" value={planCode} onChange={(event) => setPlanCode(event.target.value)} required />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="plan-name">Plan name</FieldLabel>
                        <Input id="plan-name" value={planName} onChange={(event) => setPlanName(event.target.value)} required />
                      </Field>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="plan-status">Status</FieldLabel>
                        <Input id="plan-status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} required />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="billing-interval">Billing interval</FieldLabel>
                        <Input id="billing-interval" value={billingInterval} onChange={(event) => setBillingInterval(event.target.value as typeof billingInterval)} required />
                      </Field>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field>
                        <FieldLabel htmlFor="seat-limit">Seat limit</FieldLabel>
                        <Input id="seat-limit" type="number" value={seatLimit} onChange={(event) => setSeatLimit(event.target.value)} required />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="monthly-price">Monthly price</FieldLabel>
                        <Input id="monthly-price" type="number" value={monthlyPrice} onChange={(event) => setMonthlyPrice(event.target.value)} required />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="plan-currency">Currency</FieldLabel>
                        <Input id="plan-currency" value={currency} onChange={(event) => setCurrency(event.target.value)} required />
                      </Field>
                    </div>
                  </FieldGroup>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save company plan"}
                  </Button>
                </form>
              ) : (
                <div className="text-sm text-muted-foreground">Select a company to edit its plan.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
