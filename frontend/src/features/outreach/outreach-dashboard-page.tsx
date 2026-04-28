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
};

export function OutreachDashboardPage() {
  const [range, setRange] = useState("all");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const response = await apiRequest<DashboardPayload>(`/outreach/dashboard?range=${range}`);
        if (!disposed) {
          setData(response);
        }
      } catch (caughtError) {
        if (!disposed) {
          setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load outreach dashboard");
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
    </div>
  );
}

function MetricCard({
  label,
  value,
  meta,
  compact,
}: {
  label: string;
  value: number;
  meta: string;
  compact?: boolean;
}) {
  return (
    <Card className="border-border/70">
      <CardContent className={compact ? "p-4" : "p-5"}>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-1 text-3xl font-bold text-slate-900">{value}</div>
        <div className="mt-1 text-xs text-slate-500">{meta}</div>
      </CardContent>
    </Card>
  );
}
