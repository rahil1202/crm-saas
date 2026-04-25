"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardPanel, DualTrendBars, ForecastArea, ProgressList, formatCurrency } from "@/features/dashboard/dashboard-ui";
import { ReportSummaryResponse } from "@/features/dashboard/types";

function EmailTrendChart({
  items,
}: {
  items: ReportSummaryResponse["emailAnalytics"]["trend"];
}) {
  const points = items.slice(-8).map((item) => ({
    label: item.day.slice(5),
    leads: item.opened,
    customers: item.clicked + item.replied,
  }));

  return <DualTrendBars items={points} firstLabel="Opened" secondLabel="Clicked + replied" />;
}

export function ReportsVisuals({ report }: { report: ReportSummaryResponse | null }) {
  return (
    <Tabs defaultValue="leads" queryKey="tab" className="grid gap-4">
      <TabsList className="w-fit flex-wrap">
        <TabsTrigger value="leads">Leads</TabsTrigger>
        <TabsTrigger value="deals">Deals</TabsTrigger>
        <TabsTrigger value="forecast">Forecast</TabsTrigger>
        <TabsTrigger value="email-analytics">Email</TabsTrigger>
        <TabsTrigger value="partners">Partners</TabsTrigger>
        <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
      </TabsList>

      <TabsContent value="leads" className="grid gap-4 xl:grid-cols-2">
        <DashboardPanel
          title="Lead status mix"
          description={`${report?.leadReport.total ?? 0} leads created in the selected period.`}
        >
          <ProgressList items={report?.leadReport.byStatus ?? []} emptyLabel="No lead activity in the selected period." />
        </DashboardPanel>
        <DashboardPanel title="Lead source mix" description="Track where current lead creation volume is coming from.">
          <ProgressList items={report?.leadReport.bySource ?? []} emptyLabel="No source distribution available yet." />
        </DashboardPanel>
      </TabsContent>

      <TabsContent value="deals" className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <DashboardPanel
          title="Deal pipeline report"
          description="Pipeline volume and deal status mix for the active workspace."
        >
          <div className="grid gap-6">
            <ProgressList items={report?.dealReport.byPipeline ?? []} emptyLabel="No pipeline volume available yet." />
            <ProgressList items={report?.dealReport.byStatus ?? []} emptyLabel="No deal status data available yet." />
          </div>
        </DashboardPanel>
        <DashboardPanel
          title="Deal value summary"
          description="Current value exposure across open, won, and lost deals."
        >
          <div className="grid gap-3">
            <div className="flex items-center justify-between rounded-xl border px-4 py-3">
              <span className="text-sm text-muted-foreground">Open pipeline</span>
              <span className="font-medium">{formatCurrency(report?.dealReport.openValue ?? 0, true)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border px-4 py-3">
              <span className="text-sm text-muted-foreground">Won revenue</span>
              <span className="font-medium">{formatCurrency(report?.dealReport.wonValue ?? 0, true)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border px-4 py-3">
              <span className="text-sm text-muted-foreground">Lost value</span>
              <span className="font-medium">{formatCurrency(report?.dealReport.lostValue ?? 0, true)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border px-4 py-3">
              <span className="text-sm text-muted-foreground">Average deal value</span>
              <span className="font-medium">{formatCurrency(report?.dealReport.averageDealValue ?? 0, true)}</span>
            </div>
          </div>
        </DashboardPanel>
      </TabsContent>

      <TabsContent value="forecast" className="grid gap-4">
        <DashboardPanel
          title="Revenue forecast"
          description="Expected close-date buckets for open deals over the selected forecast window."
        >
          <ForecastArea items={report?.revenueForecast.months ?? []} />
        </DashboardPanel>
      </TabsContent>

      <TabsContent value="email-analytics" className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <DashboardPanel
          title="Email performance"
          description="Open, click, reply, bounce, and engagement summary for the selected period."
        >
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Card size="sm">
                <CardHeader>
                  <CardDescription>Open rate</CardDescription>
                  <CardTitle>{report?.emailAnalytics.rates.openRate ?? 0}%</CardTitle>
                </CardHeader>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardDescription>Click rate</CardDescription>
                  <CardTitle>{report?.emailAnalytics.rates.clickRate ?? 0}%</CardTitle>
                </CardHeader>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardDescription>Reply rate</CardDescription>
                  <CardTitle>{report?.emailAnalytics.rates.replyRate ?? 0}%</CardTitle>
                </CardHeader>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardDescription>Bounce rate</CardDescription>
                  <CardTitle>{report?.emailAnalytics.rates.bounceRate ?? 0}%</CardTitle>
                </CardHeader>
              </Card>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
              <div className="text-sm text-slate-500">Engagement score</div>
              <div className="mt-1 text-3xl font-semibold text-slate-950">{report?.emailAnalytics.engagementScore ?? 0}</div>
            </div>
            <EmailTrendChart items={report?.emailAnalytics.trend ?? []} />
          </div>
        </DashboardPanel>

        <DashboardPanel title="Campaign ranking" description="Top campaigns ranked by engagement score.">
          <div className="grid gap-3">
            {(report?.emailAnalytics.ranking ?? []).map((item) => (
              <div key={item.campaignId} className="rounded-2xl border border-sky-100 bg-white px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-950">{item.name}</span>
                  <Badge variant="secondary">{item.engagementScore}</Badge>
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  Open {item.openRate}% • Click {item.clickRate}% • Reply {item.replyRate}% • Bounce {item.bounceRate}%
                </div>
              </div>
            ))}
            {(report?.emailAnalytics.ranking.length ?? 0) === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">
                No campaign ranking data yet.
              </div>
            ) : null}
          </div>
        </DashboardPanel>
      </TabsContent>

      <TabsContent value="partners" className="grid gap-4">
        <DashboardPanel
          title="Partner performance"
          description="Lead volume, open pipeline, and closed revenue by partner company."
        >
          <div className="grid gap-3">
            {(report?.partnerPerformance ?? []).map((partner) => (
              <div key={partner.partnerId} className="grid gap-2 rounded-2xl border border-sky-100 bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center">
                <div>
                  <div className="font-medium text-slate-950">{partner.name}</div>
                  <div className="text-sm text-slate-500">{partner.leadCount} assigned leads</div>
                </div>
                <Badge variant="outline">{partner.openDealCount} open deals</Badge>
                <Badge variant="secondary">{partner.wonDealCount} won deals</Badge>
                <div className="text-sm font-medium">{formatCurrency(partner.wonRevenue, true)}</div>
              </div>
            ))}
            {(report?.partnerPerformance.length ?? 0) === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">
                No partner performance data yet.
              </div>
            ) : null}
          </div>
        </DashboardPanel>
      </TabsContent>

      <TabsContent value="campaigns" className="grid gap-4">
        <DashboardPanel
          title="Campaign performance"
          description="Delivery, open, and click rates for the most recent campaigns."
        >
          <div className="grid gap-3">
            {(report?.campaignPerformance ?? []).map((campaign) => (
              <div key={campaign.campaignId} className="grid gap-3 rounded-2xl border border-sky-100 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-950">{campaign.name}</span>
                    <Badge variant="outline">{campaign.channel}</Badge>
                    <Badge variant="secondary">{campaign.status}</Badge>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {campaign.audienceCount} linked customers • {campaign.sentCount} sent • {campaign.deliveredCount} delivered
                  </div>
                </div>
                <div className="text-sm">
                  <div className="text-slate-500">Delivery</div>
                  <div className="font-medium text-slate-950">{campaign.deliveryRate}%</div>
                </div>
                <div className="text-sm">
                  <div className="text-slate-500">Open</div>
                  <div className="font-medium text-slate-950">{campaign.openRate}%</div>
                </div>
                <div className="text-sm">
                  <div className="text-slate-500">Click</div>
                  <div className="font-medium text-slate-950">{campaign.clickRate}%</div>
                </div>
              </div>
            ))}
            {(report?.campaignPerformance.length ?? 0) === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">
                No campaign performance data yet.
              </div>
            ) : null}
          </div>
        </DashboardPanel>
      </TabsContent>
    </Tabs>
  );
}
