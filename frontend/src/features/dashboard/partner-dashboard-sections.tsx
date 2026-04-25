"use client";

import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Link2,
  Mail,
  Megaphone,
  Phone,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardMetricCard, formatCurrency, formatDateTime } from "@/features/dashboard/dashboard-ui";
import { PartnerDashboardResponse } from "@/features/dashboard/types";

export function PartnerDashboardSections({ data }: { data: PartnerDashboardResponse }) {
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
        <Card className="overflow-hidden border-white/65 bg-linear-to-br from-sky-950 via-sky-700 to-cyan-500 text-white shadow-[0_34px_90px_-52px_rgba(14,116,255,0.58)]">
          <CardHeader className="gap-4">
            <Badge className="w-fit border-white/20 bg-white/12 text-white">Partner workspace</Badge>
            <CardTitle className="max-w-5xl text-3xl leading-tight text-white">
              {data.partner.partnerCompanyName} inside {data.company.name}
            </CardTitle>
            <CardDescription className="max-w-5xl text-white/80">
              Work in the linked company context with your assigned leads, deals, follow-ups, and internal support contacts in one place.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[1.4rem] border border-white/16 bg-white/12 p-4 backdrop-blur-sm">
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-white/68">Assigned leads</div>
              <div className="mt-3 text-3xl font-semibold">{data.summary.assignedLeads}</div>
            </div>
            <div className="rounded-[1.4rem] border border-white/16 bg-white/12 p-4 backdrop-blur-sm">
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-white/68">Open deals</div>
              <div className="mt-3 text-3xl font-semibold">{data.summary.openDeals}</div>
            </div>
            <div className="rounded-[1.4rem] border border-white/16 bg-white/12 p-4 backdrop-blur-sm">
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-white/68">Won revenue</div>
              <div className="mt-3 text-3xl font-semibold">{formatCurrency(data.summary.wonRevenue, true)}</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/75 bg-white/82">
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <DashboardMetricCard label="Won deals" value={data.summary.wonDeals} hint="Closed wins attached to this partner account" />
        <DashboardMetricCard label="Completed follow-ups" value={data.summary.completedFollowUps30d} hint="Completed in the last 30 days" />
        <DashboardMetricCard label="Templates ready" value={data.summary.availableTemplates} hint="Reusable assets available today" />
        <DashboardMetricCard label="Partner company" value={data.partner.storeName || "Shared"} hint="Current workspace scope" />
        <DashboardMetricCard label="Last access" value={formatDateTime(data.partner.lastAccessAt)} hint="Most recent active session" />
      </section>

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
        <Card className="border-white/75 bg-white/88">
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

        <Card className="border-white/75 bg-white/88">
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
                      <div className="font-medium text-slate-900">{formatCurrency(deal.value, true)}</div>
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
        <Card className="border-white/75 bg-white/88">
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

        <Card className="border-white/75 bg-white/88">
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
                    {data.partner.partnerPhone ? (
                      <div className="flex items-center gap-2">
                        <Phone className="size-4" />
                        <span>{data.partner.partnerPhone}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.2rem] border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                No internal owner or admin contacts are available for this company yet.
              </div>
            )}
            <div className="rounded-[1.2rem] border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">
              Need to switch companies or review your access? Use the{" "}
              <Link href="/dashboard/company" className="font-medium underline underline-offset-4">
                Company
              </Link>{" "}
              page.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/75 bg-white/88">
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
                <div className="mt-3 text-lg font-semibold text-slate-900">{formatCurrency(deal.value, true)}</div>
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
