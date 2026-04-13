"use client";

import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ModuleCard } from "@/components/module-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, PageSection, StatCard } from "@/components/ui/page-patterns";
import { crmModules } from "@/features/crm/modules";
import { ApiError, apiRequest } from "@/lib/api";

interface DashboardReportResponse {
  dashboard: {
    totalLeads: number;
    leadsInPeriod: number;
    openDeals: number;
    customersWithDeals: number;
    overdueTasks: number;
    dueTodayTasks: number;
    activeCampaigns: number;
    activePartners: number;
    forecastValue: number;
    wonValue: number;
  };
  revenueForecast: {
    months: Array<{
      month: string;
      label: string;
      totalValue: number;
      dealCount: number;
    }>;
  };
  partnerPerformance: Array<{
    partnerId: string;
    name: string;
    wonRevenue: number;
    leadCount: number;
  }>;
  campaignPerformance: Array<{
    campaignId: string;
    name: string;
    status: string;
    deliveryRate: number;
    openRate: number;
  }>;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function DashboardPage() {
  const [report, setReport] = useState<DashboardReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiRequest<DashboardReportResponse>("/reports/summary?periodDays=30&forecastMonths=4");
      setReport(data);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load dashboard metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return (
    <AppShell
      title="CRM Dashboard"
      description="Operational overview for pipeline, follow-ups, campaigns, and partner-driven revenue."
    >
      <div className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Dashboard request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <Card className="overflow-hidden bg-linear-to-br from-primary via-sky-500 to-cyan-400 text-white">
            <CardHeader className="gap-4">
              <Badge className="w-fit border-white/20 bg-white/14 text-white">Pipeline command</Badge>
              <CardTitle className="max-w-6xl text-3xl leading-tight text-white">
                Clean daily visibility for revenue, follow-ups, and campaign momentum.
              </CardTitle>
              <CardDescription className="max-w-6xl text-white/80">
                Use this workspace as the operating surface for pipeline health, task pressure, and the modules that need attention next.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {[
                { label: "Total leads", value: report?.dashboard.totalLeads ?? 0 },
                { label: "Customers with deals", value: report?.dashboard.customersWithDeals ?? 0 },
                { label: "Won revenue", value: formatCurrency(report?.dashboard.wonValue ?? 0) },
              ].map((item) => (
                <div key={item.label} className="rounded-[1.4rem] border border-white/16 bg-white/12 p-4 backdrop-blur-sm">
                  <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-white/68">{item.label}</div>
                  <div className="mt-3 text-3xl font-semibold">{item.value}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-white/82">
            <CardHeader>
              <CardTitle>Attention now</CardTitle>
              <CardDescription>Work that needs immediate follow-up in the active company.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex items-center justify-between rounded-[1.4rem] border border-border/70 bg-secondary/45 px-4 py-4">
                <span className="text-sm text-muted-foreground">Due today</span>
                <Badge variant={(report?.dashboard.dueTodayTasks ?? 0) > 0 ? "secondary" : "outline"}>
                  {report?.dashboard.dueTodayTasks ?? 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-[1.4rem] border border-border/70 bg-secondary/45 px-4 py-4">
                <span className="text-sm text-muted-foreground">Overdue tasks</span>
                <Badge variant={(report?.dashboard.overdueTasks ?? 0) > 0 ? "destructive" : "outline"}>
                  {report?.dashboard.overdueTasks ?? 0}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-[1.4rem] border border-border/70 bg-secondary/45 px-4 py-4">
                <span className="text-sm text-muted-foreground">Active campaigns</span>
                <Badge variant="default">{report?.dashboard.activeCampaigns ?? 0}</Badge>
              </div>
            </CardContent>
          </Card>
        </section>

        <PageSection>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Leads (30d)", value: report?.dashboard.leadsInPeriod ?? 0 },
            { label: "Open deals", value: report?.dashboard.openDeals ?? 0 },
            { label: "Forecast", value: formatCurrency(report?.dashboard.forecastValue ?? 0) },
            { label: "Overdue tasks", value: report?.dashboard.overdueTasks ?? 0 },
            { label: "Active campaigns", value: report?.dashboard.activeCampaigns ?? 0 },
          ].map((item) => (
            <StatCard key={item.label} label={item.label} value={item.value} />
          ))}
          </div>
        </PageSection>

        {loading ? <LoadingState label="Loading dashboard metrics..." /> : null}

        {!loading && report ? (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle>Forecast snapshot</CardTitle>
                <CardDescription>Upcoming close-date buckets over the next four months.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {report.revenueForecast.months.map((bucket) => (
                  <div key={bucket.month} className="rounded-[1.4rem] border border-border/70 bg-secondary/45 p-4">
                    <div className="text-sm text-muted-foreground">{bucket.label}</div>
                    <div className="mt-2 text-xl font-semibold">{formatCurrency(bucket.totalValue)}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{bucket.dealCount} forecast deals</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Top performers</CardTitle>
                  <CardDescription>Current leaders across partners and campaigns.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {report.partnerPerformance[0] ? (
                    <div className="rounded-[1.4rem] border border-border/70 bg-secondary/45 px-4 py-4">
                      <div className="text-sm text-muted-foreground">Top partner</div>
                      <div className="mt-1 font-medium">{report.partnerPerformance[0].name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {report.partnerPerformance[0].leadCount} leads • {formatCurrency(report.partnerPerformance[0].wonRevenue)}
                      </div>
                    </div>
                  ) : null}
                  {report.campaignPerformance[0] ? (
                    <div className="rounded-[1.4rem] border border-border/70 bg-secondary/45 px-4 py-4">
                      <div className="text-sm text-muted-foreground">Top campaign</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="font-medium">{report.campaignPerformance[0].name}</span>
                        <Badge variant="outline">{report.campaignPerformance[0].status}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {report.campaignPerformance[0].deliveryRate}% delivery • {report.campaignPerformance[0].openRate}% open
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
