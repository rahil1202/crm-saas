"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/page-patterns";
import { DashboardPanel, formatCurrency, formatDate } from "@/features/dashboard/dashboard-ui";
import { useDashboardWorkspace } from "@/features/dashboard/use-dashboard-workspace";

export default function TopDealsPageClient() {
  const { mode, companyDashboard, loading, error } = useDashboardWorkspace({ topDealsLimit: 20 });

  if (loading) {
    return <LoadingState label="Loading top deals..." />;
  }

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Top deals request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {mode === "partner" || !companyDashboard ? (
        <Alert>
          <AlertTitle>Top deals are available in company workspace</AlertTitle>
          <AlertDescription>Switch to a company membership and open top deals again.</AlertDescription>
        </Alert>
      ) : (
        <>
          <section className="overflow-hidden rounded-[2rem] border border-sky-300/35 bg-linear-to-br from-white/92 via-sky-50 to-cyan-100/80 p-6 shadow-[0_28px_70px_-46px_rgba(14,116,255,0.42)]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Top deals</h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                  Highest-value opportunities ranked by value and recent deal movement.
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

          <DashboardPanel title="Expanded deal ranking" description={`${companyDashboard.topDeals.length} highest-value visible deals.`}>
            <div className="grid gap-3">
              {companyDashboard.topDeals.map((deal, index) => (
                <Link
                  key={deal.id}
                  href={`/dashboard/deals/${deal.id}`}
                  className="grid gap-3 rounded-2xl border border-sky-100 bg-white px-4 py-4 transition-colors hover:border-sky-200 hover:bg-sky-50/55 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:items-center"
                >
                  <div className="flex size-10 items-center justify-center rounded-2xl bg-sky-100 text-sm font-semibold text-sky-800">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-950">{deal.title}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {deal.stage} / {deal.status}
                    </div>
                  </div>
                  <div className="text-sm">
                    <div className="text-slate-500">Expected close</div>
                    <div className="font-medium text-slate-950">{formatDate(deal.expectedCloseDate)}</div>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-right">
                    <div>
                      <div className="text-slate-500 text-sm">Value</div>
                      <div className="font-semibold text-slate-950">{formatCurrency(deal.value, true)}</div>
                    </div>
                    <ArrowRight className="size-4 text-sky-600" />
                  </div>
                </Link>
              ))}
              {companyDashboard.topDeals.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">
                  No high-value deals found yet.
                </div>
              ) : null}
            </div>
          </DashboardPanel>
        </>
      )}
    </div>
  );
}
