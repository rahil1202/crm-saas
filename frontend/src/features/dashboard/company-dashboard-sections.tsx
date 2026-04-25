"use client";

import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Megaphone,
  Target,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardInsightsResponse } from "@/features/dashboard/types";
import {
  DashboardMetricCard,
  DashboardPanel,
  DualTrendBars,
  ForecastArea,
  MetricPill,
  ProgressList,
  ToneBadge,
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatDateTime,
} from "@/features/dashboard/dashboard-ui";

export function CompanyDashboardSections({ data }: { data: DashboardInsightsResponse }) {
  const topActions = [
    {
      href: "/dashboard/leads",
      label: "Lead queue",
      detail: `${formatCompactNumber(data.overview.newLeads)} new in ${data.periodDays}d`,
      icon: Target,
    },
    {
      href: "/dashboard/deals",
      label: "Pipeline",
      detail: `${data.overview.openDeals} open deals`,
      icon: BriefcaseBusiness,
    },
    {
      href: "/dashboard/tasks",
      label: "Task board",
      detail: `${data.overview.overdueTasks} overdue`,
      icon: CheckCircle2,
    },
    {
      href: "/dashboard/campaigns",
      label: "Campaigns",
      detail: `${data.overview.activeCampaigns} active`,
      icon: Megaphone,
    },
    {
      href: "/dashboard/reports",
      label: "Stats",
      detail: "Detailed charts and reporting",
      icon: Users,
    },
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-hidden rounded-[2rem] border border-sky-300/35 bg-linear-to-br from-sky-950 via-blue-700 to-cyan-400 p-6 text-white shadow-[0_34px_90px_-50px_rgba(14,116,255,0.6)]">
          <div className="grid gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <ToneBadge tone="neutral">Revenue command</ToneBadge>
              <ToneBadge tone={data.overview.overdueTasks > 0 ? "risk" : "good"}>
                {data.overview.overdueTasks > 0 ? "Action needed" : "Healthy workspace"}
              </ToneBadge>
            </div>
            <div className="grid gap-3">
              <h1 className="max-w-4xl text-3xl font-semibold tracking-tight md:text-4xl">
                Stronger CRM visibility across leads, revenue, meetings, documents, and campaign execution.
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-white/78 md:text-base">
                The dashboard now rolls up live activity across the full CRM, then sends deeper analysis to the stats workspace.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <MetricPill label="Forecast" value={formatCurrency(data.overview.forecastValue, true)} />
              <MetricPill label="Won revenue" value={formatCurrency(data.overview.wonRevenue, true)} />
              <MetricPill label="Customers" value={formatCompactNumber(data.overview.totalCustomers)} />
            </div>
          </div>
        </div>

        <DashboardPanel
          title="Conversion health"
          description="Fast read on how the workspace is moving from pipeline to revenue."
          action={
            <Link href="/dashboard/reports">
              <Button size="sm" variant="outline" className="border-sky-200 bg-white/80">
                Open stats
              </Button>
            </Link>
          }
        >
          <div className="grid gap-3">
            {[
              ["Lead to customer", `${data.conversion.leadToCustomerRate}%`],
              ["Win rate", `${data.conversion.openDealWinRate}%`],
              ["Task completion", `${data.conversion.taskCompletionRate}%`],
              ["Meeting completion", `${data.conversion.meetingCompletionRate}%`],
              ["Campaign delivery", `${data.conversion.campaignDeliveryRate}%`],
              ["Campaign engagement", `${data.conversion.campaignEngagementRate}%`],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3">
                <span className="text-sm text-slate-600">{label}</span>
                <span className="text-base font-semibold text-slate-950">{value}</span>
              </div>
            ))}
          </div>
        </DashboardPanel>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard
          label="Lead velocity"
          value={data.overview.newLeads}
          hint={`${data.overview.newCustomers} customers created in the same window`}
          accent="linear-gradient(90deg,#0ea5e9,#2563eb)"
        />
        <DashboardMetricCard
          label="Execution pressure"
          value={data.overview.overdueTasks + data.overview.dueTodayTasks}
          hint={`${data.overview.overdueTasks} overdue and ${data.overview.dueTodayTasks} due today`}
          accent="linear-gradient(90deg,#fb7185,#f97316)"
        />
        <DashboardMetricCard
          label="Meetings scheduled"
          value={data.overview.scheduledMeetings}
          hint={`${data.overview.recentMeetings} meetings created in the current window`}
          accent="linear-gradient(90deg,#22c55e,#06b6d4)"
        />
        <DashboardMetricCard
          label="Knowledge base"
          value={data.overview.documentCount}
          hint={`${data.overview.recentDocuments} recent document uploads`}
          accent="linear-gradient(90deg,#a855f7,#2563eb)"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {topActions.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-[1.6rem] border border-white/75 bg-white/82 p-4 shadow-[0_18px_52px_-38px_rgba(15,23,42,0.34)] transition-all hover:-translate-y-0.5 hover:border-sky-200"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <Icon className="size-4" />
                </span>
                <ArrowRight className="size-4 text-sky-500 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-4">
                <div className="font-semibold text-slate-950">{item.label}</div>
                <div className="mt-1 text-sm text-slate-500">{item.detail}</div>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <DashboardPanel
          title="Lead and customer flow"
          description="Six-week comparison between new leads and actual converted customers."
        >
          <DualTrendBars items={data.leadVelocity.byWeek} firstLabel="Leads" secondLabel="Customers" />
        </DashboardPanel>

        <DashboardPanel
          title="Lead source mix"
          description="Current acquisition channels feeding the CRM."
        >
          <ProgressList items={data.leadVelocity.bySource} emptyLabel="No lead sources in this period." />
        </DashboardPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <DashboardPanel
          title="Revenue forecast"
          description="Open-pipeline value distributed across the current forecast horizon."
        >
          <ForecastArea items={data.pipeline.forecast} />
        </DashboardPanel>

        <DashboardPanel
          title="Pipeline stage concentration"
          description="Where value is currently sitting inside the active pipeline."
        >
          <div className="grid gap-3">
            {data.pipeline.byStage.slice(0, 6).map((item) => (
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
            {data.pipeline.byStage.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">
                No pipeline stages are populated yet.
              </div>
            ) : null}
          </div>
        </DashboardPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <DashboardPanel
          title="Task health"
          description="Status and priority balance across active work."
        >
          <div className="grid gap-5">
            <ProgressList items={data.taskHealth.byStatus} emptyLabel="No task status data yet." />
            <ProgressList items={data.taskHealth.byPriority} emptyLabel="No task priority data yet." />
          </div>
        </DashboardPanel>

        <DashboardPanel
          title="Campaign ranking"
          description="Top campaign execution based on delivery and engagement."
        >
          <div className="grid gap-3">
            {data.campaignHealth.ranking.map((campaign) => (
              <div key={campaign.campaignId} className="rounded-2xl border border-sky-100 bg-white px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-950">{campaign.name}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {campaign.channel} • {campaign.status}
                    </div>
                  </div>
                  <div className="rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-800">
                    Score {campaign.engagementScore}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="rounded-xl bg-sky-50 px-3 py-2 text-sm">
                    <div className="text-slate-500">Delivery</div>
                    <div className="font-semibold text-slate-900">{campaign.deliveryRate}%</div>
                  </div>
                  <div className="rounded-xl bg-sky-50 px-3 py-2 text-sm">
                    <div className="text-slate-500">Open</div>
                    <div className="font-semibold text-slate-900">{campaign.openRate}%</div>
                  </div>
                  <div className="rounded-xl bg-sky-50 px-3 py-2 text-sm">
                    <div className="text-slate-500">Click</div>
                    <div className="font-semibold text-slate-900">{campaign.clickRate}%</div>
                  </div>
                </div>
              </div>
            ))}
            {data.campaignHealth.ranking.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">
                No campaign performance data yet.
              </div>
            ) : null}
          </div>
        </DashboardPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.95fr_0.95fr]">
        <DashboardPanel title="Recent activity" description="Cross-module events ordered by the latest CRM movement.">
          <div className="grid gap-3">
            {data.activityFeed.map((item) => (
              <div key={item.id} className="rounded-2xl border border-sky-100 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-950">{item.title}</div>
                    <div className="mt-1 text-sm text-slate-500">{item.detail}</div>
                  </div>
                  <ToneBadge tone={item.tone}>{item.type}</ToneBadge>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{formatDateTime(item.timestamp)}</span>
                  {typeof item.amount === "number" ? (
                    <span>{item.type === "document" ? `${formatCompactNumber(item.amount)} bytes` : formatCurrency(item.amount, true)}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </DashboardPanel>

        <DashboardPanel title="Upcoming meetings" description="The next scheduled meetings from the CRM calendar.">
          <div className="grid gap-3">
            {data.meetingOverview.items.map((meeting) => (
              <div key={meeting.id} className="rounded-2xl border border-sky-100 bg-sky-50/55 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-950">{meeting.title}</div>
                    <div className="mt-1 text-sm text-slate-500 capitalize">
                      {meeting.source} • {meeting.status.replaceAll("_", " ")}
                    </div>
                  </div>
                  <CalendarClock className="size-4 text-sky-600" />
                </div>
                <div className="mt-2 text-xs text-slate-500">{formatDateTime(meeting.startsAt)}</div>
              </div>
            ))}
            {data.meetingOverview.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">
                No upcoming meetings are scheduled yet.
              </div>
            ) : null}
          </div>
        </DashboardPanel>

        <DashboardPanel title="Top deals" description="Highest-value opportunities currently visible in the workspace.">
          <div className="grid gap-3">
            {data.topDeals.map((deal) => (
              <div key={deal.id} className="rounded-2xl border border-sky-100 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-950">{deal.title}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {deal.stage} • {deal.status}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-slate-950">{formatCurrency(deal.value, true)}</div>
                    <div className="text-xs text-slate-500">{formatDate(deal.expectedCloseDate)}</div>
                  </div>
                </div>
              </div>
            ))}
            {data.topDeals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">
                No high-value deals found yet.
              </div>
            ) : null}
            <Link href="/dashboard/deals">
              <Button variant="outline" className="justify-between border-sky-200 bg-white">
                Review full pipeline
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </DashboardPanel>
      </section>
    </div>
  );
}
