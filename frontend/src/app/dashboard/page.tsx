"use client";

import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { ModuleCard } from "@/components/module-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Leads (30d)", value: report?.dashboard.leadsInPeriod ?? 0 },
            { label: "Open deals", value: report?.dashboard.openDeals ?? 0 },
            { label: "Forecast", value: formatCurrency(report?.dashboard.forecastValue ?? 0) },
            { label: "Overdue tasks", value: report?.dashboard.overdueTasks ?? 0 },
            { label: "Active campaigns", value: report?.dashboard.activeCampaigns ?? 0 },
          ].map((item) => (
            <Card key={item.label} size="sm">
              <CardHeader>
                <CardDescription>{item.label}</CardDescription>
                <CardTitle className="text-2xl">{item.value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        {loading ? <div className="text-sm text-muted-foreground">Loading dashboard metrics...</div> : null}

        {!loading && report ? (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle>Forecast snapshot</CardTitle>
                <CardDescription>Upcoming close-date buckets over the next four months.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                {report.revenueForecast.months.map((bucket) => (
                  <div key={bucket.month} className="rounded-xl border bg-muted/10 p-4">
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
                  <CardTitle>Attention now</CardTitle>
                  <CardDescription>Work that needs immediate follow-up in the active company.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                    <span className="text-sm text-muted-foreground">Due today</span>
                    <Badge variant={(report.dashboard.dueTodayTasks ?? 0) > 0 ? "secondary" : "outline"}>
                      {report.dashboard.dueTodayTasks}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                    <span className="text-sm text-muted-foreground">Overdue tasks</span>
                    <Badge variant={(report.dashboard.overdueTasks ?? 0) > 0 ? "destructive" : "outline"}>
                      {report.dashboard.overdueTasks}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                    <span className="text-sm text-muted-foreground">Won revenue</span>
                    <Badge variant="default">{formatCurrency(report.dashboard.wonValue)}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top performers</CardTitle>
                  <CardDescription>Current leaders across partners and campaigns.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {report.partnerPerformance[0] ? (
                    <div className="rounded-xl border px-4 py-3">
                      <div className="text-sm text-muted-foreground">Top partner</div>
                      <div className="mt-1 font-medium">{report.partnerPerformance[0].name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {report.partnerPerformance[0].leadCount} leads • {formatCurrency(report.partnerPerformance[0].wonRevenue)}
                      </div>
                    </div>
                  ) : null}
                  {report.campaignPerformance[0] ? (
                    <div className="rounded-xl border px-4 py-3">
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

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {crmModules.map((module) => (
            <ModuleCard key={module.slug} title={module.title} summary={module.summary}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {module.capabilities.map((capability) => (
                  <li key={capability}>{capability}</li>
                ))}
              </ul>
            </ModuleCard>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
