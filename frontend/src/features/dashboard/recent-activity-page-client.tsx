"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/page-patterns";
import { DashboardPanel, ToneBadge, formatCompactNumber, formatCurrency, formatDateTime } from "@/features/dashboard/dashboard-ui";
import { useDashboardWorkspace } from "@/features/dashboard/use-dashboard-workspace";

export default function RecentActivityPageClient() {
  const { mode, companyDashboard, loading, error } = useDashboardWorkspace({ activityLimit: 20 });

  if (loading) {
    return <LoadingState label="Loading recent activity..." />;
  }

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Recent activity request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {mode === "partner" || !companyDashboard ? (
        <Alert>
          <AlertTitle>Recent activity is available in company workspace</AlertTitle>
          <AlertDescription>Switch to a company membership and open recent activity again.</AlertDescription>
        </Alert>
      ) : (
        <>
          <section className="overflow-hidden rounded-[2rem] border border-sky-300/35 bg-linear-to-br from-white/92 via-sky-50 to-cyan-100/80 p-6 shadow-[0_28px_70px_-46px_rgba(14,116,255,0.42)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Recent activity</h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                  Expanded CRM feed across leads, deals, tasks, meetings, and document uploads.
                </p>
              </div>
              <Link href="/dashboard">
                <Button variant="outline" className="border-sky-200 bg-white">
                  <ArrowLeft className="size-4" />
                  Back to dashboard
                </Button>
              </Link>
            </div>
          </section>

          <DashboardPanel title="All recent activity" description={`${companyDashboard.activityFeed.length} latest workspace events.`}>
            <div className="grid gap-3">
              {companyDashboard.activityFeed.map((item) => (
                <div key={item.id} className="rounded-2xl border border-sky-100 bg-white px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-950">{item.title}</div>
                      <div className="mt-1 text-sm text-slate-500">{item.detail}</div>
                    </div>
                    <ToneBadge tone={item.tone}>{item.type}</ToneBadge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                    <span>{formatDateTime(item.timestamp)}</span>
                    {typeof item.amount === "number" ? (
                      <span>{item.type === "document" ? `${formatCompactNumber(item.amount)} bytes` : formatCurrency(item.amount, true)}</span>
                    ) : null}
                  </div>
                </div>
              ))}
              {companyDashboard.activityFeed.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">
                  No recent activity found yet.
                </div>
              ) : null}
            </div>
          </DashboardPanel>
        </>
      )}
    </div>
  );
}
