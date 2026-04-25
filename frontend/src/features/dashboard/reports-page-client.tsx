"use client";

import dynamic from "next/dynamic";
import { startTransition, useCallback, useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/page-patterns";
import { ApiError, apiRequest } from "@/lib/api";
import { DashboardMetricCard, formatCurrency } from "@/features/dashboard/dashboard-ui";
import type { ReportSummaryResponse } from "@/features/dashboard/types";

const ReportsVisuals = dynamic(
  () => import("@/features/dashboard/reports-visuals").then((mod) => mod.ReportsVisuals),
  {
    loading: () => <LoadingState label="Loading report visuals..." />,
  },
);

export default function ReportsPageClient() {
  const [periodDays, setPeriodDays] = useState("90");
  const [forecastMonths, setForecastMonths] = useState("6");
  const [report, setReport] = useState<ReportSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      periodDays,
      forecastMonths,
    });

    try {
      const data = await apiRequest<ReportSummaryResponse>(`/reports/summary?${params.toString()}`);
      startTransition(() => {
        setReport(data);
      });
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load reports");
    } finally {
      setLoading(false);
    }
  }, [forecastMonths, periodDays]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Reports request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="overflow-hidden rounded-[2rem] border border-sky-300/35 bg-linear-to-br from-white/92 via-sky-50 to-cyan-100/80 p-6 shadow-[0_28px_70px_-46px_rgba(14,116,255,0.42)]">
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="grid gap-3">
            <div className="inline-flex w-fit rounded-full border border-sky-200 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Stats workspace
            </div>
            <h2 className="max-w-4xl text-3xl font-semibold tracking-tight text-slate-950">
              Detailed CRM graphs for lead mix, pipeline movement, campaign outcomes, and partner performance.
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-slate-600">
              Use the filters to change the reporting window. Heavy visual sections are lazy-loaded so the route stays responsive.
            </p>
          </div>

          <div className="rounded-[1.6rem] border border-white/70 bg-white/82 p-4">
            <div className="grid gap-4 md:grid-cols-[180px_180px_auto]">
              <Field>
                <FieldLabel htmlFor="report-period-days">Period days</FieldLabel>
                <Input
                  id="report-period-days"
                  type="number"
                  min={7}
                  max={365}
                  value={periodDays}
                  onChange={(event) => setPeriodDays(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="report-forecast-months">Forecast months</FieldLabel>
                <Input
                  id="report-forecast-months"
                  type="number"
                  min={1}
                  max={12}
                  value={forecastMonths}
                  onChange={(event) => setForecastMonths(event.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={() => void loadReport()} disabled={loading}>
                  {loading ? "Loading..." : "Refresh stats"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <DashboardMetricCard
          label="Leads in period"
          value={report?.dashboard.leadsInPeriod ?? 0}
          hint="New leads inside the selected reporting window"
        />
        <DashboardMetricCard
          label="Open deals"
          value={report?.dashboard.openDeals ?? 0}
          hint={`${report?.dashboard.customersWithDeals ?? 0} customers with deals`}
        />
        <DashboardMetricCard
          label="Forecast value"
          value={formatCurrency(report?.dashboard.forecastValue ?? 0, true)}
          hint={`${forecastMonths} month forecast horizon`}
        />
        <DashboardMetricCard
          label="Won revenue"
          value={formatCurrency(report?.dashboard.wonValue ?? 0, true)}
          hint={`${report?.dashboard.activePartners ?? 0} active partners contributing`}
        />
        <DashboardMetricCard
          label="Overdue tasks"
          value={report?.dashboard.overdueTasks ?? 0}
          hint={`${report?.dashboard.dueTodayTasks ?? 0} due today • ${report?.dashboard.activeCampaigns ?? 0} active campaigns`}
        />
      </section>

      {loading && !report ? <LoadingState label="Loading reports..." /> : null}
      <ReportsVisuals report={report} />
    </div>
  );
}
