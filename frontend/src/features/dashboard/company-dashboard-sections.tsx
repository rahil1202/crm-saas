"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  CalendarPlus,
  ChartColumnBig,
  CheckCircle2,
  HeartPulse,
  Megaphone,
  Plus,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardInsightsResponse } from "@/features/dashboard/types";
import {
  DashboardMetricCard,
  DashboardPanel,
  MetricPill,
  ToneBadge,
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatDateTime,
} from "@/features/dashboard/dashboard-ui";

export function CompanyDashboardSections({ data }: { data: DashboardInsightsResponse }) {
  const quickActions = [
    {
      href: "/dashboard/leads",
      label: "Add lead",
      detail: "Capture and qualify a new lead",
      icon: UserPlus,
    },
    {
      href: "/dashboard/tasks",
      label: "Add task",
      detail: "Create a follow-up action",
      icon: CheckCircle2,
    },
    {
      href: "/dashboard/deals",
      label: "Add deal",
      detail: "Open a new pipeline opportunity",
      icon: BriefcaseBusiness,
    },
    {
      href: "/dashboard/meetings",
      label: "Add meeting",
      detail: "Schedule a customer call",
      icon: CalendarPlus,
    },
    {
      href: "/dashboard/campaigns/add",
      label: "Add campaign",
      detail: "Launch a new outbound campaign",
      icon: Megaphone,
    },
  ];

  const insightPages = [
    {
      href: "/dashboard/analytics",
      title: "Analytics workspace",
      detail: "Lead velocity, pipeline forecast, and source distribution charts.",
      icon: ChartColumnBig,
    },
    {
      href: "/dashboard/health",
      title: "Health workspace",
      detail: "Conversion rates, task pressure, campaign quality, and risk signals.",
      icon: HeartPulse,
    },
    {
      href: "/dashboard/reports",
      title: "Advanced stats",
      detail: "Time-window reporting with deeper CRM, partner, and campaign breakdowns.",
      icon: Activity,
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
              <h1 className="max-w-4xl text-3xl font-semibold tracking-tight md:text-4xl">Overview first, deep analysis in dedicated pages.</h1>
              <p className="max-w-3xl text-sm leading-7 text-white/78 md:text-base">
                Dashboard now stays focused on daily execution. Use the Analytics and Health pages for full graphs and deep diagnostics.
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
            <Link href="/dashboard/health">
              <Button size="sm" variant="outline" className="border-sky-200 bg-white/80">
                Open health
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
        {quickActions.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-[1.4rem] border border-white/75 bg-white/88 p-4 shadow-[0_18px_52px_-38px_rgba(15,23,42,0.34)] transition-all hover:-translate-y-0.5 hover:border-sky-200"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                  <Icon className="size-4" />
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-sky-700">
                  <Plus className="size-3" />
                  Quick
                </span>
              </div>
              <div className="mt-4">
                <div className="font-semibold text-slate-950">{item.label}</div>
                <div className="mt-1 text-sm text-slate-500">{item.detail}</div>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {insightPages.map((page) => {
          const Icon = page.icon;
          return (
            <Link
              key={page.href}
              href={page.href}
              className="group rounded-[1.4rem] border border-sky-100 bg-sky-50/55 p-5 transition-all hover:-translate-y-0.5 hover:border-sky-300"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-white text-sky-700 shadow-sm">
                  <Icon className="size-4" />
                </span>
                <ArrowRight className="size-4 text-sky-600 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-4">
                <div className="font-semibold text-slate-900">{page.title}</div>
                <div className="mt-1 text-sm text-slate-600">{page.detail}</div>
              </div>
            </Link>
          );
        })}
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
                <div className="font-medium text-slate-950">{meeting.title}</div>
                <div className="mt-1 text-sm text-slate-500 capitalize">
                  {meeting.source} • {meeting.status.replaceAll("_", " ")}
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
