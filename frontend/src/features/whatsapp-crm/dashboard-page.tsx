"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRightCircle,
  CheckCircle2,
  MessageSquareShare,
  Phone,
  Plug,
  Radar,
  Send,
  Users2,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageSection, StatCard } from "@/components/ui/page-patterns";
import { ApiError, apiRequest } from "@/lib/api";
import { RecentActivityList } from "@/features/whatsapp-crm/components/recent-activity";
import { RecentEventsList } from "@/features/whatsapp-crm/components/recent-events";
import { SparkBars } from "@/features/whatsapp-crm/components/spark-bars";
import { WhatsappConnectionCard } from "@/features/whatsapp-crm/components/connection-card";
import { compactNumber } from "@/features/whatsapp-crm/format";
import { useWhatsappRealtime } from "@/features/whatsapp-crm/realtime";
import type {
  WhatsappConnectionSummary,
  WhatsappDashboardStats,
  WhatsappRecentActivityItem,
  WhatsappWebhookEventSummary,
} from "@/features/whatsapp-crm/types";

interface DashboardData {
  stats: WhatsappDashboardStats;
  connections: WhatsappConnectionSummary[];
  events: WhatsappWebhookEventSummary[];
  activity: WhatsappRecentActivityItem[];
}

export function WhatsappCrmDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const loadDashboard = useCallback(async (options: { skipCache?: boolean } = {}) => {
    try {
      const [stats, connectionsPayload, eventsPayload, activityPayload] = await Promise.all([
        apiRequest<WhatsappDashboardStats>("/whatsapp/dashboard/stats", { skipCache: options.skipCache }),
        apiRequest<{ items: WhatsappConnectionSummary[] }>("/whatsapp/dashboard/connections", { skipCache: options.skipCache }),
        apiRequest<{ items: WhatsappWebhookEventSummary[] }>("/whatsapp/dashboard/recent-events?limit=12", {
          skipCache: options.skipCache,
        }),
        apiRequest<{ items: WhatsappRecentActivityItem[] }>("/whatsapp/dashboard/recent-activity?limit=10", {
          skipCache: options.skipCache,
        }),
      ]);
      setData({
        stats,
        connections: connectionsPayload.items,
        events: eventsPayload.items,
        activity: activityPayload.items,
      });
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load the WhatsApp CRM dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  // Realtime foundation: refetch on any bus event (passive polling in Phase 1).
  useWhatsappRealtime(
    () => {
      void loadDashboard({ skipCache: true });
    },
    { pollIntervalMs: 30_000 },
  );

  const syncConnection = async (connection: WhatsappConnectionSummary) => {
    setSyncingId(connection.id);
    try {
      await apiRequest(`/whatsapp/workspaces/${connection.id}/sync-meta`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadDashboard({ skipCache: true });
      toast.success(`Synced Meta status for ${connection.name}.`);
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to sync Meta status.");
    } finally {
      setSyncingId(null);
    }
  };

  if (loading && !data) {
    return <div className="rounded-2xl border border-dashed border-border/80 bg-white/45 px-4 py-3 text-sm text-muted-foreground">Loading WhatsApp dashboard…</div>;
  }

  if (error && !data) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to load dashboard</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return null;
  }

  const { stats, connections, events, activity } = data;
  const hasConnections = connections.length > 0;
  const readyConnections = connections.filter((item) => item.status === "ready").length;

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Partial load</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!hasConnections ? (
        <Card className="border-emerald-200/70 bg-emerald-50/50">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-white text-emerald-700">
                  <Plug className="size-5" />
                </span>
                <div>
                  <CardTitle>Connect your first WhatsApp account</CardTitle>
                  <CardDescription>Launch Meta Embedded Signup to add a WhatsApp Business Account and phone number.</CardDescription>
                </div>
              </div>
              <Link href="/dashboard/whatsapp-crm/integrations">
                <Button>
                  Go to integrations
                  <ArrowRightCircle className="ml-2 size-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <PageSection
        title="Overview"
        description={`${readyConnections} of ${stats.workspaces.total} connections ready. Data refreshes automatically.`}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Connected accounts"
            value={compactNumber(stats.workspaces.total)}
            hint={`${stats.workspaces.verified} verified · ${stats.workspaces.active} active`}
          />
          <StatCard
            label="Messages sent today"
            value={compactNumber(stats.messagesToday.sent)}
            hint={`${stats.messagesToday.received} received · ${stats.messagesToday.failed} failed`}
          />
          <StatCard
            label="Active conversations"
            value={compactNumber(stats.conversations.active24h)}
            hint={`${stats.conversations.open} open · ${stats.conversations.unread} unread`}
          />
          <StatCard
            label="Webhook events today"
            value={compactNumber(stats.webhooks.eventsToday)}
            hint={stats.webhooks.failedLast7d > 0 ? `${stats.webhooks.failedLast7d} failed this week` : "All healthy"}
          />
        </div>
      </PageSection>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <Send className="size-5" />
              </span>
              <div>
                <CardTitle>Outbound volume (last 7 days)</CardTitle>
                <CardDescription>Messages sent per day aggregated across all connected WhatsApp accounts.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-40">
              <SparkBars data={stats.messagesSentSeries} ariaLabel="Outbound WhatsApp messages per day" />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
              <div>
                <dt>Today</dt>
                <dd className="text-base font-semibold text-slate-900">{compactNumber(stats.messagesToday.sent)}</dd>
              </div>
              <div>
                <dt>Failed today</dt>
                <dd className="text-base font-semibold text-destructive">{compactNumber(stats.messagesToday.failed)}</dd>
              </div>
              <div>
                <dt>Approved templates</dt>
                <dd className="text-base font-semibold text-slate-900">{compactNumber(stats.templates.approved)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <Radar className="size-5" />
              </span>
              <div>
                <CardTitle>Connection health</CardTitle>
                <CardDescription>Status at a glance across workspaces.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <HealthRow
              icon={<Phone className="size-4" />}
              label="Connected numbers"
              value={`${compactNumber(stats.workspaces.active)} active`}
              hint={`${compactNumber(stats.workspaces.verified)} with verified webhook`}
            />
            <HealthRow
              icon={<Users2 className="size-4" />}
              label="Open conversations"
              value={compactNumber(stats.conversations.open)}
              hint={`${compactNumber(stats.conversations.unread)} unread`}
            />
            <HealthRow
              icon={<Activity className="size-4" />}
              label="Webhook traffic"
              value={`${compactNumber(stats.webhooks.eventsToday)} today`}
              hint={stats.webhooks.failedLast7d > 0 ? `${stats.webhooks.failedLast7d} failed in 7d` : "No failures"}
              warn={stats.webhooks.failedLast7d > 0}
            />
            <HealthRow
              icon={<CheckCircle2 className="size-4" />}
              label="Approved templates"
              value={compactNumber(stats.templates.approved)}
            />
          </CardContent>
        </Card>
      </div>

      {hasConnections ? (
        <PageSection title="Connections" description="WhatsApp Business Accounts currently connected to this workspace.">
          <div className="grid gap-3 md:grid-cols-2">
            {connections.map((connection) => (
              <WhatsappConnectionCard
                key={connection.id}
                connection={connection}
                onSync={syncConnection}
                syncing={syncingId === connection.id}
              />
            ))}
          </div>
        </PageSection>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <MessageSquareShare className="size-5" />
              </span>
              <div>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>Most recent inbound and outbound WhatsApp messages.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <RecentActivityList items={activity} />
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <AlertTriangle className="size-5" />
              </span>
              <div>
                <CardTitle>Recent webhook events</CardTitle>
                <CardDescription>Signed Meta webhook events stored for audit and replay.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <RecentEventsList items={events} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HealthRow({
  icon,
  label,
  value,
  hint,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-white/60 px-3 py-2.5">
      <div className="flex items-center gap-2 text-slate-700">
        <span className={warn ? "text-destructive" : "text-muted-foreground"}>{icon}</span>
        <span className="font-medium">{label}</span>
      </div>
      <div className="text-right">
        <div className={warn ? "text-sm font-semibold text-destructive" : "text-sm font-semibold text-slate-900"}>{value}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
    </div>
  );
}
