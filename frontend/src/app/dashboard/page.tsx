"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  Link2,
  Mail,
  Megaphone,
  Phone,
  Target,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, PageSection, StatCard } from "@/components/ui/page-patterns";
import { ApiError, apiRequest } from "@/lib/api";
import { getCompanyCookie } from "@/lib/cookies";
import { loadMe } from "@/lib/me-cache";

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

interface PartnerDashboardResponse {
  company: {
    id: string;
    name: string;
    timezone: string;
    currency: string;
  };
  partner: {
    partnerCompanyId: string;
    partnerCompanyName: string;
    partnerContactName: string | null;
    partnerEmail: string | null;
    partnerPhone: string | null;
    linkedAt: string;
    lastAccessAt: string | null;
    storeId: string | null;
    storeName: string | null;
  };
  summary: {
    assignedLeads: number;
    openDeals: number;
    wonDeals: number;
    wonRevenue: number;
    overdueTasks: number;
    dueTodayTasks: number;
    pendingFollowUps: number;
    completedFollowUps30d: number;
    activeCampaigns: number;
    availableTemplates: number;
  };
  recentLeads: Array<{
    id: string;
    title: string;
    fullName: string | null;
    email: string | null;
    status: string;
    assignedToUserId: string | null;
    createdAt: string;
  }>;
  openPipeline: Array<{
    id: string;
    title: string;
    stage: string;
    status: string;
    value: number;
    expectedCloseDate: string | null;
    assignedToUserId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  recentWins: Array<{
    id: string;
    title: string;
    stage: string;
    status: string;
    value: number;
    expectedCloseDate: string | null;
    assignedToUserId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  upcomingFollowUps: Array<{
    id: string;
    subject: string;
    channel: string;
    status: string;
    scheduledAt: string;
    leadId: string | null;
    dealId: string | null;
    createdAt: string;
  }>;
  assignedTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt: string | null;
  }>;
  companyContacts: Array<{
    membershipId: string;
    userId: string;
    fullName: string | null;
    email: string | null;
    role: string;
    customRoleName: string | null;
    storeName: string | null;
  }>;
}

type DashboardMode = "company" | "partner";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function PartnerDashboard({ data }: { data: PartnerDashboardResponse }) {
  const quickLinks = [
    { href: "/dashboard/leads", label: "Leads", detail: `${data.summary.assignedLeads} assigned`, icon: Target },
    { href: "/dashboard/deals", label: "Deals", detail: `${data.summary.openDeals} open`, icon: BriefcaseBusiness },
    { href: "/dashboard/campaigns", label: "Campaigns", detail: `${data.summary.activeCampaigns} active`, icon: Megaphone },
    { href: "/dashboard/templates", label: "Templates", detail: `${data.summary.availableTemplates} available`, icon: CheckCircle2 },
    { href: "/dashboard/integrations", label: "Integrations", detail: "Manage connected channels", icon: Link2 },
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="overflow-hidden bg-linear-to-br from-sky-950 via-sky-700 to-cyan-500 text-white">
          <CardHeader className="gap-4">
            <Badge className="w-fit border-white/20 bg-white/12 text-white">Partner workspace</Badge>
            <CardTitle className="max-w-5xl text-3xl leading-tight text-white">
              {data.partner.partnerCompanyName} in {data.company.name}
            </CardTitle>
            <CardDescription className="max-w-5xl text-white/80">
              Work only from the active company context. This view keeps leads, deals, follow-ups, and support contacts in one place.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {[
              { label: "Assigned leads", value: data.summary.assignedLeads },
              { label: "Open deals", value: data.summary.openDeals },
              { label: "Won revenue", value: formatCurrency(data.summary.wonRevenue) },
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
            <CardDescription>Work that needs follow-up for your active partner account.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex items-center justify-between rounded-[1.4rem] border border-border/70 bg-secondary/45 px-4 py-4">
              <span className="text-sm text-muted-foreground">Due today</span>
              <Badge variant={data.summary.dueTodayTasks > 0 ? "secondary" : "outline"}>{data.summary.dueTodayTasks}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-[1.4rem] border border-border/70 bg-secondary/45 px-4 py-4">
              <span className="text-sm text-muted-foreground">Overdue tasks</span>
              <Badge variant={data.summary.overdueTasks > 0 ? "destructive" : "outline"}>{data.summary.overdueTasks}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-[1.4rem] border border-border/70 bg-secondary/45 px-4 py-4">
              <span className="text-sm text-muted-foreground">Pending follow-ups</span>
              <Badge variant="default">{data.summary.pendingFollowUps}</Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      <PageSection>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Assigned leads" value={data.summary.assignedLeads} />
          <StatCard label="Open deals" value={data.summary.openDeals} />
          <StatCard label="Won deals" value={data.summary.wonDeals} />
          <StatCard label="Completed follow-ups (30d)" value={data.summary.completedFollowUps30d} />
          <StatCard label="Templates ready" value={data.summary.availableTemplates} />
        </div>
      </PageSection>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {quickLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="group">
              <Card className="h-full border-border/70 bg-white/88 transition-colors group-hover:border-sky-300/80">
                <CardHeader className="gap-3">
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                      <Icon className="size-4" />
                    </span>
                    <ArrowRight className="size-4 text-sky-500 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{item.label}</CardTitle>
                    <CardDescription>{item.detail}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent leads</CardTitle>
            <CardDescription>Latest leads currently linked to your partner company.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.recentLeads.length > 0 ? (
              data.recentLeads.map((lead) => (
                <div key={lead.id} className="rounded-[1.2rem] border border-border/70 bg-secondary/35 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{lead.fullName || lead.title}</div>
                      <div className="text-sm text-muted-foreground">{lead.email || lead.title}</div>
                    </div>
                    <Badge variant="outline">{lead.status}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">{formatDateTime(lead.createdAt)}</div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                No leads linked to this partner company yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open pipeline</CardTitle>
            <CardDescription>Deals still in motion for this partner company.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.openPipeline.length > 0 ? (
              data.openPipeline.map((deal) => (
                <div key={deal.id} className="rounded-[1.2rem] border border-border/70 bg-secondary/35 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{deal.title}</div>
                      <div className="text-sm text-muted-foreground">{deal.stage}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-slate-900">{formatCurrency(deal.value)}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(deal.expectedCloseDate)}</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                No open deals are currently linked to this partner company.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming follow-ups</CardTitle>
            <CardDescription>Tasks and follow-ups currently assigned to you in this company.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.upcomingFollowUps.length > 0 ? (
              data.upcomingFollowUps.map((followUp) => (
                <div key={followUp.id} className="rounded-[1.2rem] border border-border/70 bg-secondary/35 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{followUp.subject}</div>
                      <div className="text-sm capitalize text-muted-foreground">{followUp.channel}</div>
                    </div>
                    <Badge variant="outline">{followUp.status}</Badge>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">{formatDateTime(followUp.scheduledAt)}</div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                No pending follow-ups are assigned to you.
              </div>
            )}
            {data.assignedTasks.length > 0 ? (
              <div className="grid gap-2 pt-2">
                {data.assignedTasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-slate-900">{task.title}</div>
                      <div className="text-xs capitalize text-muted-foreground">{task.priority}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(task.dueAt)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Company contacts</CardTitle>
            <CardDescription>Internal owner and admin contacts for help or escalation.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {data.companyContacts.length > 0 ? (
              data.companyContacts.map((contact) => (
                <div key={contact.membershipId} className="rounded-[1.2rem] border border-border/70 bg-secondary/35 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{contact.fullName || contact.email || "Company admin"}</div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="outline">{contact.role}</Badge>
                        {contact.storeName ? <Badge variant="secondary">{contact.storeName}</Badge> : null}
                      </div>
                    </div>
                    <CalendarClock className="size-4 text-sky-600" />
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Mail className="size-4" />
                      <span>{contact.email || "No email available"}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                No internal owner or admin contacts are available for this company yet.
              </div>
            )}
            <div className="rounded-[1.2rem] border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">
              Need to switch companies or review your access? Use the <Link href="/dashboard/company" className="font-medium underline underline-offset-4">Company</Link> page.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent wins</CardTitle>
          <CardDescription>Closed deals linked to your partner company.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.recentWins.length > 0 ? (
            data.recentWins.map((deal) => (
              <div key={deal.id} className="rounded-[1.2rem] border border-border/70 bg-secondary/35 px-4 py-3">
                <div className="font-medium text-slate-900">{deal.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{formatDateTime(deal.updatedAt)}</div>
                <div className="mt-3 text-lg font-semibold text-slate-900">{formatCurrency(deal.value)}</div>
              </div>
            ))
          ) : (
            <div className="rounded-[1.2rem] border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
              No won deals are linked to this partner company yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CompanyDashboard({ report }: { report: DashboardReportResponse }) {
  return (
    <div className="grid gap-6">
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
              { label: "Total leads", value: report.dashboard.totalLeads },
              { label: "Customers with deals", value: report.dashboard.customersWithDeals },
              { label: "Won revenue", value: formatCurrency(report.dashboard.wonValue) },
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
              <Badge variant={report.dashboard.dueTodayTasks > 0 ? "secondary" : "outline"}>{report.dashboard.dueTodayTasks}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-[1.4rem] border border-border/70 bg-secondary/45 px-4 py-4">
              <span className="text-sm text-muted-foreground">Overdue tasks</span>
              <Badge variant={report.dashboard.overdueTasks > 0 ? "destructive" : "outline"}>{report.dashboard.overdueTasks}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-[1.4rem] border border-border/70 bg-secondary/45 px-4 py-4">
              <span className="text-sm text-muted-foreground">Active campaigns</span>
              <Badge variant="default">{report.dashboard.activeCampaigns}</Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      <PageSection>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Leads (30d)" value={report.dashboard.leadsInPeriod} />
          <StatCard label="Open deals" value={report.dashboard.openDeals} />
          <StatCard label="Forecast" value={formatCurrency(report.dashboard.forecastValue)} />
          <StatCard label="Overdue tasks" value={report.dashboard.overdueTasks} />
          <StatCard label="Active campaigns" value={report.dashboard.activeCampaigns} />
        </div>
      </PageSection>

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
    </div>
  );
}

export default function DashboardPage() {
  const [mode, setMode] = useState<DashboardMode>("company");
  const [report, setReport] = useState<DashboardReportResponse | null>(null);
  const [partnerDashboard, setPartnerDashboard] = useState<PartnerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const me = await loadMe();
      const companyId = getCompanyCookie();
      const activeMembership =
        me.memberships.find((membership) => membership.companyId === companyId) ??
        me.memberships[0] ??
        null;

      if (activeMembership?.isPartnerAccess) {
        const data = await apiRequest<PartnerDashboardResponse>("/partners/me/dashboard");
        setMode("partner");
        setPartnerDashboard(data);
        setReport(null);
        return;
      }

      const data = await apiRequest<DashboardReportResponse>("/reports/summary?periodDays=30&forecastMonths=4");
      setMode("company");
      setReport(data);
      setPartnerDashboard(null);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load dashboard metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const content = useMemo(() => {
    if (loading) {
      return <LoadingState label="Loading dashboard metrics..." />;
    }

    if (mode === "partner" && partnerDashboard) {
      return <PartnerDashboard data={partnerDashboard} />;
    }

    if (report) {
      return <CompanyDashboard report={report} />;
    }

    return null;
  }, [loading, mode, partnerDashboard, report]);

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Dashboard request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {content}
    </div>
  );
}
