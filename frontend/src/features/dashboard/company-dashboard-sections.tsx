"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  AlertTriangle,
  BriefcaseBusiness,
  CalendarClock,
  CalendarPlus,
  ChartColumnBig,
  CheckCircle2,
  FileText,
  Funnel,
  Megaphone,
  MessageSquare,
  PlugZap,
  Plus,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { downloadCsvFile, downloadExcelLikeFile, toCsvCell } from "@/components/crm/csv-export";
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
  const exportDashboard = (format: "csv" | "excel") => {
    const rows: Array<Array<string | number>> = [
      ["Section", "Metric", "Value"],
      ["Overview", "Total leads", data.overview.totalLeads],
      ["Overview", "Total customers", data.overview.totalCustomers],
      ["Overview", "Open deals", data.overview.openDeals],
      ["Overview", "Won deals", data.overview.wonDeals],
      ["Overview", "Forecast value", data.overview.forecastValue],
      ["Overview", "Won revenue", data.overview.wonRevenue],
      ...data.pipeline.byStage.map((stage) => ["Pipeline stage", stage.key, stage.value]),
    ];

    if (format === "csv") {
      const csv = rows.map((row) => row.map((cell) => toCsvCell(String(cell))).join(",")).join("\n");
      downloadCsvFile(csv, "dashboard-summary.csv");
      return;
    }
    downloadExcelLikeFile(rows, "dashboard-summary.xls");
  };

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
  const attentionItems = [
    { href: "/dashboard/tasks", label: "Overdue tasks", value: data.signals.attention.overdueTasks, icon: AlertTriangle, tone: "risk" },
    { href: "/dashboard/tasks", label: "Due today", value: data.signals.attention.dueTodayTasks, icon: CheckCircle2, tone: "neutral" },
    { href: "/dashboard/health", label: "Pending follow-ups", value: data.signals.attention.pendingFollowUps, icon: CalendarClock, tone: "neutral" },
    { href: "/dashboard/meetings", label: "Meeting exceptions", value: data.signals.attention.cancelledOrNoShowMeetings, icon: CalendarPlus, tone: "risk" },
    { href: "/dashboard/campaigns", label: "Low delivery", value: data.signals.attention.lowDeliveryCampaigns, icon: Megaphone, tone: "risk" },
    { href: "/dashboard/social", label: "Unread inbox", value: data.signals.attention.unreadConversations, icon: MessageSquare, tone: "neutral" },
  ];
  const funnelItems = [
    { label: "Leads", value: data.overview.totalLeads },
    { label: "Customers", value: data.overview.totalCustomers },
    { label: "Won deals", value: data.overview.wonDeals },
  ];
  const campaignBars = [
    { label: "Delivered", value: data.campaignHealth.totals.deliveredCount, total: data.campaignHealth.totals.sentCount },
    { label: "Opened", value: data.campaignHealth.totals.openedCount, total: data.campaignHealth.totals.deliveredCount },
    { label: "Clicked", value: data.campaignHealth.totals.clickedCount, total: data.campaignHealth.totals.openedCount },
    { label: "Replied", value: data.campaignHealth.totals.repliedCount, total: data.campaignHealth.totals.deliveredCount },
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
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => exportDashboard("csv")}>Export CSV</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => exportDashboard("excel")}>Export Excel</Button>
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {attentionItems.map((item) => {
          const Icon = item.icon;
          const active = item.value > 0;
          return (
            <Link
              key={item.label}
              href={item.href}
              className="group rounded-[1.25rem] border border-white/75 bg-white/92 p-4 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.32)] transition-all hover:-translate-y-0.5 hover:border-sky-200"
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`flex size-10 items-center justify-center rounded-2xl ${active && item.tone === "risk" ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"}`}>
                  <Icon className="size-4" />
                </span>
                <ArrowRight className="size-4 text-sky-600 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
              </div>
              <div className="mt-4 text-2xl font-semibold text-slate-950">{formatCompactNumber(item.value)}</div>
              <div className="mt-1 text-sm font-medium text-slate-600">{item.label}</div>
            </Link>
          );
        })}
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

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr_0.85fr]">
        <DashboardPanel title="Pipeline intelligence" description="Funnel movement from inbound volume to closed revenue.">
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-3">
              {funnelItems.map((item, index) => (
                <div key={item.label} className="rounded-2xl border border-sky-100 bg-sky-50/55 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700/80">
                    <Funnel className="size-3.5" />
                    Step {index + 1}
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">{formatCompactNumber(item.value)}</div>
                  <div className="text-sm text-slate-500">{item.label}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-2">
              {data.pipeline.byStage.slice(0, 4).map((stage) => (
                <div key={stage.key} className="flex items-center justify-between gap-3 rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm">
                  <span className="capitalize text-slate-600">{stage.key}</span>
                  <span className="font-semibold text-slate-950">{formatCurrency(stage.value, true)}</span>
                </div>
              ))}
              {data.pipeline.byStage.length > 1 ? (
                <div className="rounded-xl border border-sky-100 bg-sky-50/55 px-3 py-2 text-xs text-sky-800">
                  Conversion: {Math.round((data.pipeline.byStage[data.pipeline.byStage.length - 1]!.count / Math.max(data.pipeline.byStage[0]!.count, 1)) * 100)}% from first to last stage.
                </div>
              ) : null}
            </div>
          </div>
        </DashboardPanel>

        <DashboardPanel title="Pipeline risk" description="Open pipeline records that need cleanup before forecasting.">
          <div className="grid gap-3">
            {[
              ["Missing close date", data.signals.pipelineRisk.openDealsWithoutCloseDate, "/dashboard/deals"],
              ["Stale open deals", data.signals.pipelineRisk.staleOpenDeals, "/dashboard/deals"],
              ["High-value open deals", data.signals.pipelineRisk.highValueOpenDeals, "/dashboard/top-deals"],
            ].map(([label, value, href]) => (
              <Link key={label} href={String(href)} className="flex items-center justify-between rounded-2xl border border-sky-100 bg-white px-4 py-3 transition-colors hover:bg-sky-50/55">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <span className="text-lg font-semibold text-slate-950">{formatCompactNumber(Number(value))}</span>
              </Link>
            ))}
          </div>
        </DashboardPanel>

        <DashboardPanel title="Forecast confidence" description="Close-date coverage, forecast value, and win rate blended into one signal.">
          <div className="grid gap-4">
            <div className="rounded-[1.4rem] border border-sky-100 bg-linear-to-br from-sky-50 to-white p-4">
              <div className="flex items-center justify-between">
                <TrendingUp className="size-5 text-sky-700" />
                <span className="text-3xl font-semibold text-slate-950">{data.signals.pipelineRisk.forecastConfidence}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-sky-100">
                <div className="h-full rounded-full bg-sky-600" style={{ width: `${data.signals.pipelineRisk.forecastConfidence}%` }} />
              </div>
              <div className="mt-3 text-sm text-slate-600">{formatCurrency(data.signals.pipelineRisk.openPipelineValue, true)} open pipeline</div>
            </div>
            <Link href="/dashboard/reports" className="inline-flex items-center justify-between rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50">
              Open reports
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </DashboardPanel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr_1fr]">
        <DashboardPanel title="Source & acquisition" description="Lead source mix and form capture performance.">
          <div className="grid gap-4">
            <div className="grid gap-2">
              {data.leadVelocity.bySource.slice(0, 4).map((source) => {
                const maxSource = Math.max(...data.leadVelocity.bySource.map((item) => item.count), 1);
                return (
                  <div key={source.key} className="grid gap-1">
                    <div className="flex justify-between text-sm">
                      <span className="capitalize text-slate-600">{source.key}</span>
                      <span className="font-semibold text-slate-950">{source.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-sky-100">
                      <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.max((source.count / maxSource) * 100, 8)}%` }} />
                    </div>
                  </div>
                );
              })}
              {data.leadVelocity.bySource.length === 0 ? <div className="text-sm text-muted-foreground">No lead source data yet.</div> : null}
            </div>
            <Link href="/dashboard/forms" className="grid gap-2 rounded-2xl border border-sky-100 bg-sky-50/55 px-4 py-3 transition-colors hover:bg-white">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-950">
                  <FileText className="size-4 text-sky-700" />
                  Forms
                </span>
                <ArrowRight className="size-4 text-sky-600" />
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span>{data.signals.forms.publishedCount} published</span>
                <span>{data.signals.forms.submissions} submissions</span>
                <span>{data.signals.forms.conversions} conversions</span>
              </div>
            </Link>
          </div>
        </DashboardPanel>

        <DashboardPanel title="Campaign & outreach health" description="Delivery quality and top campaign execution.">
          <div className="grid gap-4">
            {campaignBars.map((item) => {
              const rate = item.total > 0 ? Math.round((item.value / item.total) * 100) : 0;
              return (
                <div key={item.label} className="grid gap-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">{item.label}</span>
                    <span className="font-semibold text-slate-950">{rate}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sky-100">
                    <div className="h-full rounded-full bg-blue-600" style={{ width: `${rate}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="grid gap-2">
              {data.campaignHealth.ranking.slice(0, 3).map((campaign) => (
                <Link key={campaign.campaignId} href="/dashboard/campaigns" className="flex items-center justify-between rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm hover:bg-sky-50/55">
                  <span className="truncate text-slate-700">{campaign.name}</span>
                  <span className="font-semibold text-slate-950">{campaign.engagementScore}</span>
                </Link>
              ))}
            </div>
            <Link href="/dashboard/outreach" className="inline-flex items-center justify-between rounded-xl border border-sky-100 bg-sky-50/55 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-white">
              <span className="inline-flex items-center gap-2">
                <Workflow className="size-4" />
                Open outreach
              </span>
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </DashboardPanel>

        <DashboardPanel title="Inbox & readiness" description="Social inbox load and outbound runtime readiness.">
          <div className="grid gap-3">
            <Link href="/dashboard/social" className="rounded-2xl border border-sky-100 bg-white px-4 py-3 hover:bg-sky-50/55">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 font-semibold text-slate-950">
                  <MessageSquare className="size-4 text-sky-700" />
                  Social inbox
                </span>
                <ArrowRight className="size-4 text-sky-600" />
              </div>
              <div className="mt-2 text-sm text-slate-600">
                {data.signals.social.connectedAccounts} accounts / {data.signals.social.openConversations} open / {data.signals.social.unreadMessages} unread
              </div>
            </Link>
            <Link href="/dashboard/settings" className="rounded-2xl border border-sky-100 bg-white px-4 py-3 hover:bg-sky-50/55">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 font-semibold text-slate-950">
                  <ShieldCheck className="size-4 text-emerald-700" />
                  Runtime readiness
                </span>
                <ArrowRight className="size-4 text-sky-600" />
              </div>
              <div className="mt-2 text-sm text-slate-600">
                Email {data.signals.readiness.email.connectedAccounts}/{data.signals.readiness.email.accountCount} / WhatsApp {data.signals.readiness.whatsapp.verifiedWorkspaceCount}/{data.signals.readiness.whatsapp.workspaceCount}
              </div>
            </Link>
            <Link href="/dashboard/integrations" className="inline-flex items-center justify-between rounded-xl border border-sky-100 bg-sky-50/55 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-white">
              <span className="inline-flex items-center gap-2">
                <PlugZap className="size-4" />
                Open integrations
              </span>
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </DashboardPanel>
      </section>

      <DashboardPanel title="Team workload" description="Top overloaded owners based on open tasks, overdue work, active deals, and assigned leads.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {data.signals.workload.map((owner) => (
            <div key={owner.userId ?? "unassigned"} className="rounded-2xl border border-sky-100 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Users className="size-4 shrink-0 text-sky-700" />
                  <span className="truncate font-semibold text-slate-950">{owner.name}</span>
                </span>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">{owner.pressureScore}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                <span>{owner.openTasks} tasks</span>
                <span>{owner.openDeals} deals</span>
                <span>{owner.assignedLeads} leads</span>
              </div>
            </div>
          ))}
          {data.signals.workload.length === 0 ? <div className="text-sm text-muted-foreground">No assigned workload signals yet.</div> : null}
        </div>
      </DashboardPanel>

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
