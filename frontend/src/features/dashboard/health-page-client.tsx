"use client";

import Link from "next/link";
import { ArrowRight, HeartPulse } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/page-patterns";
import { DashboardMetricCard, DashboardPanel, ProgressList, formatDateTime } from "@/features/dashboard/dashboard-ui";
import { useDashboardWorkspace } from "@/features/dashboard/use-dashboard-workspace";

function getHealthScore(rates: number[]) {
  if (rates.length === 0) return 0;
  const total = rates.reduce((sum, value) => sum + value, 0);
  return Math.round(total / rates.length);
}

export default function HealthPageClient() {
  const { mode, companyDashboard, loading, error } = useDashboardWorkspace();

  if (loading) {
    return <LoadingState label="Loading health workspace..." />;
  }

  const score = companyDashboard
    ? getHealthScore([
        companyDashboard.conversion.leadToCustomerRate,
        companyDashboard.conversion.openDealWinRate,
        companyDashboard.conversion.taskCompletionRate,
        companyDashboard.conversion.meetingCompletionRate,
        companyDashboard.conversion.campaignDeliveryRate,
        companyDashboard.conversion.campaignEngagementRate,
      ])
    : 0;

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Health request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {mode === "partner" || !companyDashboard ? (
        <Alert>
          <AlertTitle>Health is available in company workspace</AlertTitle>
          <AlertDescription>
            This page uses company-wide KPI diagnostics. Switch to a company membership and open dashboard health again.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <section className="overflow-hidden rounded-[2rem] border border-emerald-300/40 bg-linear-to-br from-white/92 via-emerald-50 to-cyan-100/80 p-6 shadow-[0_28px_70px_-46px_rgba(16,185,129,0.4)]">
            <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
              <div className="grid gap-2">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  <HeartPulse className="size-3.5" />
                  Health
                </div>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Workspace quality and risk monitoring</h2>
                <p className="max-w-3xl text-sm leading-7 text-slate-600">
                  Delivery rates, execution pressure, and conversion performance are tracked together to identify action areas quickly.
                </p>
              </div>
              <Link href="/dashboard">
                <Button variant="outline" className="border-emerald-200 bg-white">
                  Back to dashboard
                </Button>
              </Link>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DashboardMetricCard label="Workspace health" value={`${score}%`} hint="Average of key conversion and delivery rates" />
            <DashboardMetricCard
              label="Overdue tasks"
              value={companyDashboard.taskHealth.overdueCount}
              hint={`${companyDashboard.taskHealth.dueTodayCount} due today`}
            />
            <DashboardMetricCard
              label="Pending follow-ups"
              value={companyDashboard.overview.pendingFollowUps}
              hint={`${companyDashboard.overview.overdueTasks} overdue tasks`}
            />
            <DashboardMetricCard
              label="Campaign engagement"
              value={`${companyDashboard.conversion.campaignEngagementRate}%`}
              hint={`${companyDashboard.campaignHealth.ranking.length} campaigns ranked`}
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <DashboardPanel title="Task health" description="Status and priority balance across active work.">
              <div className="grid gap-5">
                <ProgressList items={companyDashboard.taskHealth.byStatus} emptyLabel="No task status data yet." />
                <ProgressList items={companyDashboard.taskHealth.byPriority} emptyLabel="No task priority data yet." />
              </div>
            </DashboardPanel>

            <DashboardPanel title="Conversion diagnostics" description="Core movement from inbound to revenue and execution quality.">
              <div className="grid gap-3">
                {[
                  ["Lead to customer", `${companyDashboard.conversion.leadToCustomerRate}%`],
                  ["Deal win rate", `${companyDashboard.conversion.openDealWinRate}%`],
                  ["Task completion", `${companyDashboard.conversion.taskCompletionRate}%`],
                  ["Meeting completion", `${companyDashboard.conversion.meetingCompletionRate}%`],
                  ["Campaign delivery", `${companyDashboard.conversion.campaignDeliveryRate}%`],
                  ["Campaign engagement", `${companyDashboard.conversion.campaignEngagementRate}%`],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/55 px-4 py-3">
                    <span className="text-sm text-slate-600">{label}</span>
                    <span className="font-semibold text-slate-950">{value}</span>
                  </div>
                ))}
              </div>
            </DashboardPanel>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <DashboardPanel title="Campaign ranking" description="Top campaign execution based on delivery and engagement.">
              <div className="grid gap-3">
                {companyDashboard.campaignHealth.ranking.map((campaign) => (
                  <div key={campaign.campaignId} className="rounded-2xl border border-emerald-100 bg-white px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-950">{campaign.name}</div>
                        <div className="mt-1 text-sm text-slate-500">
                          {campaign.channel} • {campaign.status}
                        </div>
                      </div>
                      <div className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
                        Score {campaign.engagementScore}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm">
                        <div className="text-slate-500">Delivery</div>
                        <div className="font-semibold text-slate-900">{campaign.deliveryRate}%</div>
                      </div>
                      <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm">
                        <div className="text-slate-500">Open</div>
                        <div className="font-semibold text-slate-900">{campaign.openRate}%</div>
                      </div>
                      <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm">
                        <div className="text-slate-500">Click</div>
                        <div className="font-semibold text-slate-900">{campaign.clickRate}%</div>
                      </div>
                    </div>
                  </div>
                ))}
                {companyDashboard.campaignHealth.ranking.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">
                    No campaign performance data yet.
                  </div>
                ) : null}
              </div>
            </DashboardPanel>

            <DashboardPanel title="Upcoming meetings" description="Next scheduled meetings from the CRM calendar.">
              <div className="grid gap-3">
                {companyDashboard.meetingOverview.items.map((meeting) => (
                  <div key={meeting.id} className="rounded-2xl border border-emerald-100 bg-emerald-50/55 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-slate-900">{meeting.title}</div>
                      <Badge variant="outline" className="capitalize">
                        {meeting.status.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-slate-500 capitalize">{meeting.source}</div>
                    <div className="mt-2 text-xs text-slate-500">{formatDateTime(meeting.startsAt)}</div>
                  </div>
                ))}
                {companyDashboard.meetingOverview.items.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">
                    No upcoming meetings are scheduled yet.
                  </div>
                ) : null}
              </div>
            </DashboardPanel>
          </section>

          <div className="flex">
            <Link href="/dashboard/analytics" className="inline-flex">
              <Button variant="outline" className="border-emerald-200 bg-white">
                Open analytics workspace
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
