"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CalendarPlus,
  ChartColumnBig,
  CheckCircle2,
  Megaphone,
  Plus,
  UserPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardInsightsResponse } from "@/features/dashboard/types";
import {
  ConversionGraph,
  DashboardPanel,
  DonutChartCard,
  MetricPill,
  ToneBadge,
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatDateTime,
} from "@/features/dashboard/dashboard-ui";

export function CompanyDashboardSections({ data }: { data: DashboardInsightsResponse }) {
  const quickActions = [
    { href: "/dashboard/leads", label: "Add lead", icon: UserPlus, tint: "text-sky-700", bg: "bg-sky-100" },
    { href: "/dashboard/tasks", label: "Add task", icon: CheckCircle2, tint: "text-emerald-700", bg: "bg-emerald-100" },
    { href: "/dashboard/deals", label: "Add deal", icon: BriefcaseBusiness, tint: "text-blue-700", bg: "bg-blue-100" },
    { href: "/dashboard/meetings", label: "Add meeting", icon: CalendarPlus, tint: "text-cyan-700", bg: "bg-cyan-100" },
    { href: "/dashboard/campaigns/add", label: "Add campaign", icon: Megaphone, tint: "text-violet-700", bg: "bg-violet-100" },
  ];

  const insightPages = [
    {
      href: "/dashboard/analytics",
      title: "Analytics workspace",
      detail: "Lead velocity, source mix, forecast trends, and pipeline concentration.",
      icon: ChartColumnBig,
      accent: "from-sky-500 to-blue-600",
    },
    {
      href: "/dashboard/reports",
      title: "Advanced stats",
      detail: "Time-window reporting for CRM, partner, and campaign performance.",
      icon: Activity,
      accent: "from-cyan-500 to-emerald-500",
    },
  ];

  const conversionItems = [
    { label: "Lead to customer", value: data.conversion.leadToCustomerRate },
    { label: "Win rate", value: data.conversion.openDealWinRate },
    { label: "Task completion", value: data.conversion.taskCompletionRate },
    { label: "Meeting completion", value: data.conversion.meetingCompletionRate },
    { label: "Campaign delivery", value: data.conversion.campaignDeliveryRate },
    { label: "Campaign engagement", value: data.conversion.campaignEngagementRate },
  ];

  return (
    <div className="grid gap-6">
      <section className="overflow-hidden rounded-[1.6rem] border border-white/75 bg-white/92 p-3 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.34)] backdrop-blur-sm">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
          {quickActions.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group relative flex min-h-20 items-center gap-3 overflow-hidden rounded-[1.1rem] border border-slate-200/75 bg-white px-3 py-3 transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_18px_42px_-30px_rgba(14,116,255,0.45)]"
              >
                <span className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-sky-400 via-cyan-300 to-blue-500 opacity-0 transition-opacity group-hover:opacity-100" />
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${item.bg} ${item.tint}`}>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-950">{item.label}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    <Plus className="size-3" />
                    Quick
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="overflow-hidden rounded-[2rem] border border-sky-300/35 bg-linear-to-br from-sky-950 via-blue-700 to-cyan-400 p-6 text-white shadow-[0_34px_90px_-50px_rgba(14,116,255,0.6)]">
          <div className="grid gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <ToneBadge tone="neutral">Revenue command</ToneBadge>
              <ToneBadge tone={data.overview.overdueTasks > 0 ? "risk" : "good"}>
                {data.overview.overdueTasks > 0 ? "Action needed" : "Healthy workspace"}
              </ToneBadge>
            </div>
            <div className="grid gap-3">
              <h1 className="max-w-4xl text-3xl font-semibold tracking-tight md:text-4xl">Clean command center for daily CRM movement.</h1>
              <p className="max-w-3xl text-sm leading-7 text-white/78 md:text-base">
                Quick actions, conversion health, pipeline momentum, meetings, and priority deal signals are grouped for faster review.
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
          description="Interactive rate graph for core movement and execution quality."
          action={
            <Link href="/dashboard/health">
              <Button size="sm" variant="outline" className="border-sky-200 bg-white/80">
                Open health
              </Button>
            </Link>
          }
        >
          <ConversionGraph items={conversionItems} />
        </DashboardPanel>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <DonutChartCard
          title="Lead velocity"
          href="/dashboard/analytics"
          items={[
            { label: "New leads", value: data.overview.newLeads, color: "#0ea5e9" },
            { label: "New customers", value: data.overview.newCustomers, color: "#2563eb" },
          ]}
        />
        <DonutChartCard
          title="Execution pressure"
          href="/dashboard/tasks"
          items={[
            { label: "Overdue", value: data.overview.overdueTasks, color: "#fb7185" },
            { label: "Due today", value: data.overview.dueTodayTasks, color: "#f97316" },
          ]}
        />
        <DonutChartCard
          title="Meetings scheduled"
          href="/dashboard/meetings"
          items={[
            { label: "Scheduled", value: data.overview.scheduledMeetings, color: "#22c55e" },
            { label: "Recent", value: data.overview.recentMeetings, color: "#06b6d4" },
          ]}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {insightPages.map((page) => {
          const Icon = page.icon;
          return (
            <Link
              key={page.href}
              href={page.href}
              className="group overflow-hidden rounded-[1.5rem] border border-white/75 bg-white/90 p-5 shadow-[0_20px_58px_-42px_rgba(15,23,42,0.34)] transition-all hover:-translate-y-0.5 hover:border-sky-200"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br ${page.accent} text-white shadow-[0_18px_35px_-24px_rgba(14,116,255,0.65)]`}>
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <div className="font-semibold text-slate-950">{page.title}</div>
                    <div className="mt-1 max-w-xl text-sm leading-6 text-slate-600">{page.detail}</div>
                  </div>
                </div>
                <ArrowRight className="size-4 shrink-0 text-sky-600 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.95fr_0.95fr]">
        <DashboardPanel
          title="Recent activity"
          description="Latest movement across leads, deals, tasks, meetings, and files."
          action={
            <Link href="/dashboard/recent-activity">
              <Button size="sm" variant="outline" className="border-sky-200 bg-white">
                View all
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          }
        >
          <div className="grid gap-3">
            {data.activityFeed.map((item) => (
              <div key={item.id} className="rounded-2xl border border-sky-100 bg-white px-4 py-3 transition-colors hover:bg-sky-50/55">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-950">{item.title}</div>
                    <div className="mt-1 text-sm text-slate-500">{item.detail}</div>
                  </div>
                  <ToneBadge tone={item.tone}>{item.type}</ToneBadge>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span>{formatDateTime(item.timestamp)}</span>
                  {typeof item.amount === "number" ? (
                    <span>{item.type === "document" ? `${formatCompactNumber(item.amount)} bytes` : formatCurrency(item.amount, true)}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </DashboardPanel>

        <DashboardPanel
          title="Upcoming meetings"
          description="The next scheduled meetings from the CRM calendar."
          action={
            <Link href="/dashboard/meetings">
              <Button size="sm" variant="outline" className="border-sky-200 bg-white">
                Open
                <CalendarClock className="size-4" />
              </Button>
            </Link>
          }
        >
          <Link href="/dashboard/meetings" className="grid gap-3">
            {data.meetingOverview.items.map((meeting) => (
              <div key={meeting.id} className="rounded-2xl border border-sky-100 bg-sky-50/55 px-4 py-3 transition-colors hover:border-sky-200 hover:bg-white">
                <div className="font-medium text-slate-950">{meeting.title}</div>
                <div className="mt-1 text-sm capitalize text-slate-500">
                  {meeting.source} / {meeting.status.replaceAll("_", " ")}
                </div>
                <div className="mt-2 text-xs text-slate-500">{formatDateTime(meeting.startsAt)}</div>
              </div>
            ))}
            {data.meetingOverview.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">
                No upcoming meetings are scheduled yet.
              </div>
            ) : null}
          </Link>
        </DashboardPanel>

        <DashboardPanel
          title="Top deals"
          description="Highest-value opportunities currently visible in the workspace."
          action={
            <Link href="/dashboard/top-deals">
              <Button size="sm" variant="outline" className="border-sky-200 bg-white">
                View all
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          }
        >
          <div className="grid gap-3">
            {data.topDeals.map((deal) => (
              <Link
                key={deal.id}
                href={`/dashboard/deals/${deal.id}`}
                className="rounded-2xl border border-sky-100 bg-white px-4 py-3 transition-colors hover:border-sky-200 hover:bg-sky-50/55"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-950">{deal.title}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {deal.stage} / {deal.status}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold text-slate-950">{formatCurrency(deal.value, true)}</div>
                    <div className="text-xs text-slate-500">{formatDate(deal.expectedCloseDate)}</div>
                  </div>
                </div>
              </Link>
            ))}
            {data.topDeals.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">
                No high-value deals found yet.
              </div>
            ) : null}
          </div>
        </DashboardPanel>
      </section>
    </div>
  );
}
