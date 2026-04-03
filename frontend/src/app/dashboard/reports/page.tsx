"use client";

import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, apiRequest } from "@/lib/api";

interface ReportSummaryResponse {
  generatedAt: string;
  periodDays: number;
  forecastMonths: number;
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
  leadReport: {
    total: number;
    byStatus: Array<{ key: string; count: number }>;
    bySource: Array<{ key: string; count: number }>;
  };
  dealReport: {
    total: number;
    byStatus: Array<{ key: string; count: number }>;
    byPipeline: Array<{ key: string; count: number }>;
    openValue: number;
    wonValue: number;
    lostValue: number;
    averageDealValue: number;
    forecastValue: number;
  };
  revenueForecast: {
    totalValue: number;
    months: Array<{
      month: string;
      label: string;
      totalValue: number;
      dealCount: number;
    }>;
  };
  emailAnalytics: {
    totals: {
      sentCount: number;
      deliveredCount: number;
      openedCount: number;
      clickedCount: number;
      repliedCount: number;
      bouncedCount: number;
    };
    rates: {
      openRate: number;
      clickRate: number;
      replyRate: number;
      bounceRate: number;
    };
    engagementScore: number;
    trend: Array<{
      day: string;
      opened: number;
      clicked: number;
      replied: number;
      bounced: number;
    }>;
    ranking: Array<{
      campaignId: string;
      name: string;
      engagementScore: number;
      openRate: number;
      clickRate: number;
      replyRate: number;
      bounceRate: number;
    }>;
  };
  partnerPerformance: Array<{
    partnerId: string;
    name: string;
    status: string;
    leadCount: number;
    openDealCount: number;
    wonDealCount: number;
    wonRevenue: number;
  }>;
  campaignPerformance: Array<{
    campaignId: string;
    name: string;
    channel: string;
    status: string;
    audienceCount: number;
    sentCount: number;
    deliveredCount: number;
    openedCount: number;
    clickedCount: number;
    replyCount: number;
    bounceCount: number;
    engagementScore: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
    replyRate: number;
    bounceRate: number;
    scheduledAt: string | null;
    launchedAt: string | null;
    createdAt: string;
  }>;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function MetricBar({ items, emptyLabel }: { items: Array<{ key: string; count: number }>; emptyLabel: string }) {
  const maxValue = Math.max(...items.map((item) => item.count), 1);

  if (items.length === 0) {
    return <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{emptyLabel}</div>;
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div key={item.key} className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium capitalize">{item.key.replaceAll("_", " ")}</span>
            <span className="text-muted-foreground">{item.count}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${Math.max((item.count / maxValue) * 100, 8)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
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
      setReport(data);
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
    <AppShell
      title="Reports"
      description="Lead, deal, forecast, partner, and campaign reporting for the active company workspace."
    >
      <div className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Reports request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Report window</CardTitle>
            <CardDescription>Adjust the historical window and forecast horizon for this workspace summary.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[180px_180px_auto]">
            <Field>
              <FieldLabel htmlFor="report-period-days">Period days</FieldLabel>
              <Input id="report-period-days" type="number" min={7} max={365} value={periodDays} onChange={(event) => setPeriodDays(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="report-forecast-months">Forecast months</FieldLabel>
              <Input id="report-forecast-months" type="number" min={1} max={12} value={forecastMonths} onChange={(event) => setForecastMonths(event.target.value)} />
            </Field>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={() => void loadReport()} disabled={loading}>
                {loading ? "Loading..." : "Refresh report"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Leads in period", value: report?.dashboard.leadsInPeriod ?? 0, tone: "outline" as const },
            { label: "Open deals", value: report?.dashboard.openDeals ?? 0, tone: "secondary" as const },
            { label: "Forecast value", value: formatCurrency(report?.dashboard.forecastValue ?? 0), tone: "default" as const },
            { label: "Won revenue", value: formatCurrency(report?.dashboard.wonValue ?? 0), tone: "default" as const },
            { label: "Overdue tasks", value: report?.dashboard.overdueTasks ?? 0, tone: "destructive" as const },
          ].map((item) => (
            <Card key={item.label} size="sm">
              <CardHeader>
                <CardDescription>{item.label}</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <span>{item.value}</span>
                  <Badge variant={item.tone}>{item.label.split(" ")[0]}</Badge>
                </CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="leads" className="grid gap-4">
          <TabsList className="w-fit">
            <TabsTrigger value="leads">Leads</TabsTrigger>
            <TabsTrigger value="deals">Deals</TabsTrigger>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
            <TabsTrigger value="email-analytics">Email Analytics</TabsTrigger>
            <TabsTrigger value="partners">Partners</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          </TabsList>

          <TabsContent value="leads" className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Lead status mix</CardTitle>
                <CardDescription>{report?.leadReport.total ?? 0} leads created in the selected period.</CardDescription>
              </CardHeader>
              <CardContent>
                <MetricBar items={report?.leadReport.byStatus ?? []} emptyLabel="No lead activity in the selected period." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Lead source mix</CardTitle>
                <CardDescription>Track where current lead creation volume is coming from.</CardDescription>
              </CardHeader>
              <CardContent>
                <MetricBar items={report?.leadReport.bySource ?? []} emptyLabel="No source distribution available yet." />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deals" className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle>Deal pipeline report</CardTitle>
                <CardDescription>Pipeline volume and deal status mix for the active workspace.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <MetricBar items={report?.dealReport.byPipeline ?? []} emptyLabel="No pipeline volume available yet." />
                <MetricBar items={report?.dealReport.byStatus ?? []} emptyLabel="No deal status data available yet." />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Deal value summary</CardTitle>
                <CardDescription>Current value exposure across open, won, and lost deals.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                  <span className="text-sm text-muted-foreground">Open pipeline</span>
                  <span className="font-medium">{formatCurrency(report?.dealReport.openValue ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                  <span className="text-sm text-muted-foreground">Won revenue</span>
                  <span className="font-medium">{formatCurrency(report?.dealReport.wonValue ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                  <span className="text-sm text-muted-foreground">Lost value</span>
                  <span className="font-medium">{formatCurrency(report?.dealReport.lostValue ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                  <span className="text-sm text-muted-foreground">Average deal value</span>
                  <span className="font-medium">{formatCurrency(report?.dealReport.averageDealValue ?? 0)}</span>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="forecast" className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Revenue forecast</CardTitle>
                <CardDescription>Expected close-date buckets for open deals over the next forecast window.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(report?.revenueForecast.months ?? []).map((bucket) => (
                  <div key={bucket.month} className="rounded-xl border bg-muted/10 p-4">
                    <div className="text-sm text-muted-foreground">{bucket.label}</div>
                    <div className="mt-2 text-xl font-semibold">{formatCurrency(bucket.totalValue)}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{bucket.dealCount} forecast deals</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="email-analytics" className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Email performance</CardTitle>
                <CardDescription>Open, click, reply, bounce, and engagement summary for the selected period.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border p-3 text-sm">
                    <div className="text-muted-foreground">Open rate</div>
                    <div className="text-xl font-semibold">{report?.emailAnalytics.rates.openRate ?? 0}%</div>
                  </div>
                  <div className="rounded-xl border p-3 text-sm">
                    <div className="text-muted-foreground">Click rate</div>
                    <div className="text-xl font-semibold">{report?.emailAnalytics.rates.clickRate ?? 0}%</div>
                  </div>
                  <div className="rounded-xl border p-3 text-sm">
                    <div className="text-muted-foreground">Reply rate</div>
                    <div className="text-xl font-semibold">{report?.emailAnalytics.rates.replyRate ?? 0}%</div>
                  </div>
                  <div className="rounded-xl border p-3 text-sm">
                    <div className="text-muted-foreground">Bounce rate</div>
                    <div className="text-xl font-semibold">{report?.emailAnalytics.rates.bounceRate ?? 0}%</div>
                  </div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-sm text-muted-foreground">Engagement score</div>
                  <div className="text-2xl font-semibold">{report?.emailAnalytics.engagementScore ?? 0}</div>
                </div>
                <div className="grid gap-2">
                  {(report?.emailAnalytics.trend ?? []).slice(-10).map((item) => (
                    <div key={item.day} className="grid grid-cols-[120px_repeat(4,minmax(0,1fr))] gap-2 rounded-lg border px-3 py-2 text-xs">
                      <span className="font-medium">{item.day}</span>
                      <span>Open {item.opened}</span>
                      <span>Click {item.clicked}</span>
                      <span>Reply {item.replied}</span>
                      <span>Bounce {item.bounced}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Campaign ranking</CardTitle>
                <CardDescription>Top campaigns ranked by engagement score.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {(report?.emailAnalytics.ranking ?? []).map((item) => (
                  <div key={item.campaignId} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{item.name}</span>
                      <Badge variant="secondary">{item.engagementScore}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Open {item.openRate}% • Click {item.clickRate}% • Reply {item.replyRate}% • Bounce {item.bounceRate}%
                    </div>
                  </div>
                ))}
                {(report?.emailAnalytics.ranking.length ?? 0) === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No campaign ranking data yet.</div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="partners" className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Partner performance</CardTitle>
                <CardDescription>Lead volume, open pipeline, and closed revenue by partner company.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {(report?.partnerPerformance ?? []).map((partner) => (
                  <div key={partner.partnerId} className="grid gap-2 rounded-xl border p-4 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center">
                    <div>
                      <div className="font-medium">{partner.name}</div>
                      <div className="text-sm text-muted-foreground">{partner.leadCount} assigned leads</div>
                    </div>
                    <Badge variant="outline">{partner.openDealCount} open deals</Badge>
                    <Badge variant="secondary">{partner.wonDealCount} won deals</Badge>
                    <div className="text-sm font-medium">{formatCurrency(partner.wonRevenue)}</div>
                  </div>
                ))}
                {(report?.partnerPerformance.length ?? 0) === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    No partner performance data yet.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="campaigns" className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Campaign performance</CardTitle>
                <CardDescription>Delivery, open, and click rates for the most recent campaigns.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {(report?.campaignPerformance ?? []).map((campaign) => (
                  <div key={campaign.campaignId} className="grid gap-3 rounded-xl border p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{campaign.name}</span>
                        <Badge variant="outline">{campaign.channel}</Badge>
                        <Badge variant="secondary">{campaign.status}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {campaign.audienceCount} linked customers • {campaign.sentCount} sent • {campaign.deliveredCount} delivered
                      </div>
                    </div>
                    <div className="text-sm">
                      <div className="text-muted-foreground">Delivery</div>
                      <div className="font-medium">{campaign.deliveryRate}%</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-muted-foreground">Open</div>
                      <div className="font-medium">{campaign.openRate}%</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-muted-foreground">Click</div>
                      <div className="font-medium">{campaign.clickRate}%</div>
                    </div>
                  </div>
                ))}
                {(report?.campaignPerformance.length ?? 0) === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    No campaign performance data yet.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
