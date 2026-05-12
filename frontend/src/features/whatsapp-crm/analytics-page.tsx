"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, TrendingUp } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { PageSection, StatCard } from "@/components/ui/page-patterns";
import { ApiError, apiRequest } from "@/lib/api";
import { compactNumber } from "@/features/whatsapp-crm/format";
import { SparkBars } from "@/features/whatsapp-crm/components/spark-bars";

interface GlobalAnalytics {
  totals: {
    campaigns: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    failed: number;
    cost: string;
  };
  dailySeries: Array<{ day: string; sent: number }>;
  templatePerformance: Array<{
    templateName: string | null;
    campaigns: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    deliveryRate: number;
    readRate: number;
  }>;
}

export function WhatsappAnalyticsPage() {
  const [data, setData] = useState<GlobalAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState("30");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiRequest<GlobalAnalytics>(`/whatsapp/analytics?days=${days}`, { skipCache: true });
      setData(payload);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  if (loading && !data) {
    return <div className="rounded-2xl border border-dashed border-border/80 bg-white/45 px-4 py-3 text-sm text-muted-foreground">Loading analytics…</div>;
  }

  if (error && !data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const { totals, dailySeries, templatePerformance } = data;
  const deliveryRate = totals.sent > 0 ? Math.round((totals.delivered / totals.sent) * 100) : 0;
  const readRate = totals.sent > 0 ? Math.round((totals.read / totals.sent) * 100) : 0;
  const replyRate = totals.sent > 0 ? Math.round((totals.replied / totals.sent) * 100) : 0;

  return (
    <div className="grid gap-6">
      <PageSection
        title="WhatsApp Analytics"
        description="Campaign performance, delivery funnel, and template effectiveness."
      >
        <div className="flex items-center gap-3">
          <NativeSelect value={days} onChange={(e) => setDays(e.target.value)} className="h-9 w-auto">
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </NativeSelect>
        </div>
      </PageSection>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Campaigns" value={compactNumber(totals.campaigns)} hint={`Last ${days} days`} />
        <StatCard label="Messages sent" value={compactNumber(totals.sent)} hint={`${compactNumber(totals.failed)} failed`} />
        <StatCard label="Delivery rate" value={`${deliveryRate}%`} hint={`${compactNumber(totals.delivered)} delivered`} />
        <StatCard label="Read rate" value={`${readRate}%`} hint={`${compactNumber(totals.read)} read · ${replyRate}% replied`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <TrendingUp className="size-5" />
              </span>
              <div>
                <CardTitle>Daily send volume</CardTitle>
                <CardDescription>Messages sent per day across all campaigns.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {dailySeries.length > 0 ? (
              <div className="h-40">
                <SparkBars data={dailySeries.map((d) => ({ day: d.day, count: d.sent }))} ariaLabel="Daily campaign sends" />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-white/50 p-4 text-sm text-muted-foreground">
                No send data in this period.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <BarChart3 className="size-5" />
              </span>
              <div>
                <CardTitle>Delivery funnel</CardTitle>
                <CardDescription>Aggregate funnel for the selected period.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <FunnelRow label="Sent" value={totals.sent} max={totals.sent} color="bg-sky-400" />
              <FunnelRow label="Delivered" value={totals.delivered} max={totals.sent} color="bg-emerald-400" />
              <FunnelRow label="Read" value={totals.read} max={totals.sent} color="bg-violet-400" />
              <FunnelRow label="Replied" value={totals.replied} max={totals.sent} color="bg-amber-400" />
              <FunnelRow label="Failed" value={totals.failed} max={totals.sent} color="bg-rose-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      <PageSection title="Template performance" description="Delivery and read rates per template used in campaigns.">
        {templatePerformance.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-white/50 p-4 text-sm text-muted-foreground">
            No template data in this period.
          </div>
        ) : (
          <Card className="border-border/70 bg-card/95">
            <CardContent className="overflow-x-auto pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs uppercase tracking-[0.1em] text-muted-foreground">
                    <th className="pb-2 pr-4">Template</th>
                    <th className="pb-2 pr-4">Campaigns</th>
                    <th className="pb-2 pr-4">Sent</th>
                    <th className="pb-2 pr-4">Delivered</th>
                    <th className="pb-2 pr-4">Read</th>
                    <th className="pb-2 pr-4">Failed</th>
                    <th className="pb-2 pr-4">Delivery %</th>
                    <th className="pb-2">Read %</th>
                  </tr>
                </thead>
                <tbody>
                  {templatePerformance.map((row) => (
                    <tr key={row.templateName ?? "unknown"} className="border-b border-border/40">
                      <td className="py-2 pr-4 font-medium text-slate-900">{row.templateName ?? "—"}</td>
                      <td className="py-2 pr-4">{row.campaigns}</td>
                      <td className="py-2 pr-4">{compactNumber(row.sent)}</td>
                      <td className="py-2 pr-4">{compactNumber(row.delivered)}</td>
                      <td className="py-2 pr-4">{compactNumber(row.read)}</td>
                      <td className="py-2 pr-4 text-destructive">{compactNumber(row.failed)}</td>
                      <td className="py-2 pr-4">{row.deliveryRate}%</td>
                      <td className="py-2">{row.readRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </PageSection>
    </div>
  );
}

function FunnelRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs font-medium text-slate-700">{label}</span>
      <div className="flex-1 rounded-full bg-slate-100 h-5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right text-xs font-semibold text-slate-900">{compactNumber(value)}</span>
    </div>
  );
}
