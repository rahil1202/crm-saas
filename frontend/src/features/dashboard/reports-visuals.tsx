"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Tabs defaultValue="general" queryKey="tab" className="grid gap-4">
      <TabsList className="w-fit flex-wrap">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="funnel">Funnel</TabsTrigger>
        <TabsTrigger value="owners">Owner</TabsTrigger>
        <TabsTrigger value="conversion">Conversion</TabsTrigger>
        <TabsTrigger value="leads">Leads</TabsTrigger>
        <TabsTrigger value="deals">Deals</TabsTrigger>
        <TabsTrigger value="forecast">Forecast</TabsTrigger>
        <TabsTrigger value="email-analytics">Email</TabsTrigger>
        <TabsTrigger value="partners">Partners</TabsTrigger>
        <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <DashboardPanel title="General report" description="Workspace totals across leads, customers, deals, tasks, and hot pipeline.">
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["Total leads", report?.generalReport.totals.leads ?? 0],
              ["Leads in period", report?.generalReport.totals.leadsInPeriod ?? 0],
              ["Customers", report?.generalReport.totals.customers ?? 0],
              ["Open deals", report?.generalReport.totals.openDeals ?? 0],
              ["Won deals", report?.generalReport.totals.wonDeals ?? 0],
              ["Hot leads", report?.generalReport.totals.hotLeads ?? 0],
            ].map(([label, value]) => (
              <Card key={label} size="sm">
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle>{value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        </DashboardPanel>
        <DashboardPanel title="General mix" description="Lead source and status distribution for the selected reporting window.">
          <div className="grid gap-6">
            <ProgressList items={report?.generalReport.sourceMix ?? []} emptyLabel="No source data available." />
            <ProgressList items={report?.generalReport.statusMix ?? []} emptyLabel="No status data available." />
          </div>
        </DashboardPanel>
      </TabsContent>

      <TabsContent value="funnel" className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <DashboardPanel title="Funnel analytics" description="Lead progression from capture through won deals.">
          <div className="grid gap-3">
            {(report?.funnelAnalytics.stages ?? []).map((stage, index) => (
              <div key={stage.key} className="rounded-2xl border border-sky-100 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-950">{stage.label}</div>
                    <div className="text-sm text-slate-500">
                      {index === 0 ? "Starting volume" : `${stage.rateFromPrevious}% from previous stage`}
                    </div>
                  </div>
                  <div className="text-2xl font-semibold text-slate-950">{stage.count}</div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(100, stage.rateFromLead)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </DashboardPanel>
        <DashboardPanel title="Source funnel" description="Conversion and win rates by source.">
          <div className="grid gap-3">
            {(report?.funnelAnalytics.bySource ?? []).map((source) => (
              <div key={source.key} className="grid gap-3 rounded-2xl border border-sky-100 bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                <div>
                  <div className="font-medium text-slate-950">{source.key}</div>
                  <div className="text-sm text-slate-500">{source.leads} leads • {source.customers} customers • {source.deals} deals</div>
                </div>
                <Badge variant="secondary">{source.conversionRate}% converted</Badge>
                <Badge variant="outline">{source.winRate}% won</Badge>
              </div>
            ))}
            {(report?.funnelAnalytics.bySource.length ?? 0) === 0 ? <div className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">No source funnel data yet.</div> : null}
          </div>
        </DashboardPanel>
      </TabsContent>

      <TabsContent value="owners" className="grid gap-4">
        <DashboardPanel title="Owner analytics" description="Lead ownership, conversion, deal value, and workload risk by owner.">
          <div className="grid gap-3">
            {(report?.ownerAnalytics ?? []).map((owner) => (
              <div key={owner.userId ?? "unassigned"} className="grid gap-3 rounded-2xl border border-sky-100 bg-white p-4 xl:grid-cols-[minmax(0,1.2fr)_repeat(5,auto)] xl:items-center">
                <div>
                  <div className="font-medium text-slate-950">{owner.name}</div>
                  <div className="text-sm text-slate-500">{owner.leads} leads • {owner.hotLeads} hot • {owner.overdueTasks} overdue tasks</div>
                </div>
                <Badge variant="outline">{owner.leadToCustomerRate}% L/C</Badge>
                <Badge variant="outline">{owner.winRate}% win</Badge>
                <div className="text-sm text-slate-600">{owner.openDeals} open deals</div>
                <div className="text-sm font-medium">{formatCurrency(owner.openValue, true)} open</div>
                <div className="text-sm font-medium">{formatCurrency(owner.wonRevenue, true)} won</div>
              </div>
            ))}
            {(report?.ownerAnalytics.length ?? 0) === 0 ? <div className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">No owner analytics available yet.</div> : null}
          </div>
        </DashboardPanel>
      </TabsContent>

      <TabsContent value="conversion" className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <DashboardPanel title="Conversion analytics" description="Core conversion rates across lead, deal, and priority outcomes.">
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["Lead to customer", `${report?.conversionAnalytics.rates.leadToCustomer ?? 0}%`],
              ["Lead to deal", `${report?.conversionAnalytics.rates.leadToDeal ?? 0}%`],
              ["Deal win", `${report?.conversionAnalytics.rates.dealWin ?? 0}%`],
              ["Deal loss", `${report?.conversionAnalytics.rates.dealLoss ?? 0}%`],
              ["Hot lead share", `${report?.conversionAnalytics.rates.hotLeadShare ?? 0}%`],
              ["Period L/C", `${report?.conversionAnalytics.rates.periodLeadToCustomer ?? 0}%`],
            ].map(([label, value]) => (
              <Card key={label} size="sm">
                <CardHeader>
                  <CardDescription>{label}</CardDescription>
                  <CardTitle>{value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        </DashboardPanel>
        <DashboardPanel title="Conversion counts" description="Raw counts behind the conversion rates.">
          <div className="grid gap-3">
            {Object.entries(report?.conversionAnalytics.counts ?? {}).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-xl border px-4 py-3">
                <span className="text-sm capitalize text-muted-foreground">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>
        </DashboardPanel>
      </TabsContent>

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
