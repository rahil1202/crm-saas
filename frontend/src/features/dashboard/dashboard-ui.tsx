"use client";

import type { CSSProperties, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function formatCurrency(value: number, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(value);
}

export function formatDateTime(value: string | null | undefined) {
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

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function DashboardMetricCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint: ReactNode;
  accent?: string;
}) {
  return (
    <Card className="border-white/70 bg-white/84 shadow-[0_22px_55px_-38px_rgba(30,64,175,0.38)] backdrop-blur-sm">
      <CardHeader className="gap-2">
        <CardDescription className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-sky-700/90">
          {label}
        </CardDescription>
        <CardTitle className="text-3xl text-slate-950">{value}</CardTitle>
        <div className="text-sm text-slate-600">{hint}</div>
        {accent ? (
          <div
            className="mt-2 h-1.5 rounded-full"
            style={
              {
                background: accent,
              } as CSSProperties
            }
          />
        ) : null}
      </CardHeader>
    </Card>
  );
}

export function DashboardPanel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-white/75 bg-white/88 shadow-[0_24px_65px_-44px_rgba(15,23,42,0.35)] backdrop-blur-sm", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-lg text-slate-950">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function MetricPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/12 px-4 py-3 backdrop-blur-sm">
      <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/65">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

export function ProgressList({
  items,
  emptyLabel,
  formatter,
}: {
  items: Array<{ key: string; count: number }>;
  emptyLabel: string;
  formatter?: (value: number) => ReactNode;
}) {
  const maxValue = Math.max(...items.map((item) => item.count), 1);

  if (items.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border/80 px-4 py-8 text-sm text-muted-foreground">{emptyLabel}</div>;
  }

  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <div key={item.key} className="grid gap-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium capitalize text-slate-800">{item.key.replaceAll("_", " ")}</span>
            <span className="text-slate-500">{formatter ? formatter(item.count) : item.count}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-sky-100">
            <div
              className="h-full rounded-full bg-linear-to-r from-sky-500 via-cyan-500 to-blue-600"
              style={{ width: `${Math.max((item.count / maxValue) * 100, 10)}%`, opacity: 1 - index * 0.08 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DualTrendBars({
  items,
  firstLabel,
  secondLabel,
}: {
  items: Array<{ label: string; leads: number; customers: number }>;
  firstLabel: string;
  secondLabel: string;
}) {
  const maxValue = Math.max(...items.flatMap((item) => [item.leads, item.customers]), 1);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-sky-500" />
          {firstLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-cyan-300" />
          {secondLabel}
        </span>
      </div>
      <div className="grid grid-cols-6 gap-3">
        {items.map((item) => (
          <div key={item.label} className="flex min-h-44 flex-col justify-end gap-3">
            <div className="flex flex-1 items-end justify-center gap-1.5">
              <div
                className="w-4 rounded-t-2xl bg-sky-500/95"
                style={{ height: `${Math.max((item.leads / maxValue) * 100, item.leads > 0 ? 12 : 4)}%` }}
              />
              <div
                className="w-4 rounded-t-2xl bg-cyan-300"
                style={{ height: `${Math.max((item.customers / maxValue) * 100, item.customers > 0 ? 12 : 4)}%` }}
              />
            </div>
            <div className="text-center text-xs font-medium text-slate-500">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ForecastArea({
  items,
}: {
  items: Array<{
    label: string;
    totalValue: number;
    dealCount: number;
  }>;
}) {
  const maxValue = Math.max(...items.map((item) => item.totalValue), 1);
  const points = items
    .map((item, index) => {
      const x = items.length === 1 ? 0 : (index / (items.length - 1)) * 100;
      const y = 100 - (item.totalValue / maxValue) * 84;
      return `${x},${y}`;
    })
    .join(" ");
  const area = `0,100 ${points} 100,100`;

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-[1.6rem] border border-sky-100 bg-linear-to-b from-sky-50 to-white p-4">
        <svg viewBox="0 0 100 100" className="h-52 w-full" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="dashboard-area-fill" x1="0%" x2="0%" y1="0%" y2="100%">
              <stop offset="0%" stopColor="rgba(14,165,233,0.38)" />
              <stop offset="100%" stopColor="rgba(14,165,233,0.04)" />
            </linearGradient>
            <linearGradient id="dashboard-area-line" x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="#0ea5e9" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
          </defs>
          <polygon points={area} fill="url(#dashboard-area-fill)" />
          <polyline
            points={points}
            fill="none"
            stroke="url(#dashboard-area-line)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl border border-sky-100/90 bg-sky-50/55 px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700/80">{item.label}</div>
            <div className="mt-2 text-base font-semibold text-slate-900">{formatCurrency(item.totalValue, true)}</div>
            <div className="mt-1 text-xs text-slate-500">{item.dealCount} deals</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ToneBadge({ tone, children }: { tone: "good" | "neutral" | "risk"; children: ReactNode }) {
  const variant = tone === "risk" ? "destructive" : tone === "good" ? "default" : "outline";
  return <Badge variant={variant}>{children}</Badge>;
}
