"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError, apiRequest } from "@/lib/api";
import { OutreachTopNav } from "@/features/outreach/outreach-top-nav";

type DashboardPayload = {
  stats: {
    emailsFound: number;
    emailsSent: number;
    leadsOpened: number;
    openRate: number;
  };
  funnel: {
    found: number;
    sent: number;
    opened: number;
  };
  openTiming: Array<{ hour: string; opens: number }>;
  lastRun: {
    status: string;
    startedAt: string;
    finishedAt: string | null;
    queuedCount: number;
    processedCount: number;
    skippedCount: number;
    failedCount: number;
    lastError: string | null;
  } | null;
};

export function OutreachDashboardPage() {
  const [range, setRange] = useState("all");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiRequest<DashboardPayload>(`/outreach/dashboard?range=${range}`);
        if (!disposed) {
          setData(response);
        }
      } catch (caughtError) {
        if (!disposed) {
          setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load outreach dashboard");
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, [range]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Email Outreach Agent</h1>
        <p className="mt-1 text-sm text-slate-600">AI-driven discovery and automated email campaigns</p>
      </div>

      <OutreachTopNav />

      <Card className="border-border/70">
        <CardContent className="p-4">
          <NativeSelect value={range} onChange={(event) => setRange(event.target.value)} className="h-10 w-44 rounded-xl px-3 text-sm">
            <option value="all">All time</option>
            <option value="30d">Last 30 days</option>
            <option value="7d">Last 7 days</option>
          </NativeSelect>
        </CardContent>
      </Card>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {loading ? <div className="rounded-xl border border-border/60 bg-white px-4 py-3 text-sm text-slate-500">Loading outreach metrics...</div> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <MetricCard label="Emails Found" value={data?.stats.emailsFound ?? 0} meta="discovered" />
        <MetricCard label="Emails Sent" value={data?.stats.emailsSent ?? 0} meta={`${data?.stats.openRate ?? 0}% open rate`} />
        <MetricCard label="Leads (Opens)" value={data?.stats.leadsOpened ?? 0} meta="opened at least once" />
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Pipeline Funnel</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          <MetricCard label="Found" value={data?.funnel.found ?? 0} meta="contacts" compact />
          <MetricCard label="Sent" value={data?.funnel.sent ?? 0} meta="emails queued/sent" compact />
          <MetricCard label="Opened" value={data?.funnel.opened ?? 0} meta="engaged leads" compact />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Email open timing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            {(data?.openTiming ?? []).map((item) => (
              <div key={item.hour} className="rounded-xl border border-border/60 bg-slate-50 px-3 py-2 text-sm">
                <div className="font-semibold text-slate-900">{item.hour}:00</div>
                <div className="text-slate-600">{item.opens} opens</div>
              </div>
            ))}
            {(!data || data.openTiming.length === 0) && <div className="text-sm text-slate-500">No open timing data yet.</div>}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Latest agent run</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.lastRun ? (
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Status" value={0} meta={data.lastRun.status} compact hideValue />
              <MetricCard label="Queued" value={data.lastRun.queuedCount} meta="messages" compact />
              <MetricCard label="Processed" value={data.lastRun.processedCount} meta="sent now" compact />
              <MetricCard label="Skipped" value={data.lastRun.skippedCount} meta={data.lastRun.lastError ?? "contacts/settings"} compact />
            </div>
          ) : (
            <div className="text-sm text-slate-500">No automated outreach run has been recorded yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  meta,
  compact,
  hideValue,
}: {
  label: string;
  value: number;
  meta: string;
  compact?: boolean;
  hideValue?: boolean;
}) {
  return (
    <Card className="border-border/70">
      <CardContent className={compact ? "p-4" : "p-5"}>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        {!hideValue ? <div className="mt-1 text-3xl font-bold text-slate-900">{value}</div> : null}
        <div className="mt-1 text-xs text-slate-500">{meta}</div>
      </CardContent>
    </Card>
  );
}
