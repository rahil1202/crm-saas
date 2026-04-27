"use client";

import Link from "next/link";
import { ArrowRight, ChartColumnBig } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/page-patterns";
import {
  DashboardMetricCard,
  DashboardPanel,
  DualTrendBars,
  ForecastArea,
  ProgressList,
  formatCurrency,
} from "@/features/dashboard/dashboard-ui";
import { useDashboardWorkspace } from "@/features/dashboard/use-dashboard-workspace";

export default function AnalyticsPageClient() {
  const { mode, companyDashboard, loading, error } = useDashboardWorkspace();

  if (loading) {
    return <LoadingState label="Loading analytics workspace..." />;
  }

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Analytics request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {mode === "partner" || !companyDashboard ? (
        <Alert>
          <AlertTitle>Analytics is available in company workspace</AlertTitle>
          <AlertDescription>
            This page uses company-wide CRM metrics. Switch to a company membership and open dashboard analytics again.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <section className="overflow-hidden rounded-[2rem] border border-sky-300/35 bg-linear-to-br from-white/92 via-sky-50 to-cyan-100/80 p-6 shadow-[0_28px_70px_-46px_rgba(14,116,255,0.42)]">
            <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
              <div className="grid gap-2">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-200 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  <ChartColumnBig className="size-3.5" />
                  Analytics
                </div>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Deeper trend and pipeline analysis</h2>
                <p className="max-w-3xl text-sm leading-7 text-slate-600">
                  Lead velocity, source mix, and forecast movement are grouped here so the main dashboard remains lightweight.
                </p>
              </div>
              <Link href="/dashboard">
                <Button variant="outline" className="border-sky-200 bg-white">
                  Back to dashboard
                </Button>
              </Link>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DashboardMetricCard
              label="Leads in 30d"
              value={companyDashboard.overview.newLeads}
              hint={`${companyDashboard.overview.totalLeads} total leads`}
            />
            <DashboardMetricCard
              label="Open deals"
              value={companyDashboard.overview.openDeals}
              hint={`${companyDashboard.pipeline.byStage.length} active stages`}
            />
            <DashboardMetricCard
              label="Forecast value"
              value={formatCurrency(companyDashboard.overview.forecastValue, true)}
              hint={`${companyDashboard.forecastMonths} month horizon`}
            />
            <DashboardMetricCard
              label="Average deal size"
              value={formatCurrency(companyDashboard.overview.averageDealValue, true)}
              hint="Current open and won blend"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
            <DashboardPanel title="Lead and customer flow" description="Six-week comparison between new leads and converted customers.">
              <DualTrendBars items={companyDashboard.leadVelocity.byWeek} firstLabel="Leads" secondLabel="Customers" />
            </DashboardPanel>

            <DashboardPanel title="Lead source mix" description="Current acquisition channels feeding the CRM.">
              <ProgressList items={companyDashboard.leadVelocity.bySource} emptyLabel="No lead sources in this period." />
            </DashboardPanel>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
            <DashboardPanel title="Revenue forecast" description="Open-pipeline value distributed across the current forecast horizon.">
              <ForecastArea items={companyDashboard.pipeline.forecast} />
            </DashboardPanel>

            <DashboardPanel title="Pipeline stage concentration" description="Where value is currently sitting inside the active pipeline.">
              <div className="grid gap-3">
                {companyDashboard.pipeline.byStage.slice(0, 8).map((item) => (
                  <div key={item.key} className="rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium capitalize text-slate-900">{item.key}</div>
                        <div className="text-sm text-slate-500">{item.count} deals</div>
                      </div>
                      <div className="text-right font-semibold text-slate-950">{formatCurrency(item.value, true)}</div>
                    </div>
                  </div>
                ))}
                {companyDashboard.pipeline.byStage.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">
                    No pipeline stages are populated yet.
                  </div>
                ) : null}
              </div>
            </DashboardPanel>
          </section>

          <div className="flex">
            <Link href="/dashboard/health" className="inline-flex">
              <Button variant="outline" className="border-sky-200 bg-white">
                Open health workspace
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
