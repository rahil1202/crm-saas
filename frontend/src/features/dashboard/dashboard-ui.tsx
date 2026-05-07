"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";

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

const chartColors = ["#0ea5e9", "#2563eb", "#06b6d4", "#22c55e", "#f97316", "#a855f7"];

function getTotal(items: Array<{ value: number }>) {
  return items.reduce((total, item) => total + Math.max(item.value, 0), 0);
}

export function DonutChartCard({
  title,
  items,
  href,
  formatter = formatCompactNumber,
}: {
  title: string;
  href?: string;
  items: Array<{
    label: string;
    value: number;
    color?: string;
  }>;
  formatter?: (value: number) => ReactNode;
}) {
  const total = getTotal(items);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeItem = items[activeIndex] ?? items[0];
  const radius = 34;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    return items.map((item, index) => {
      const value = Math.max(item.value, 0);
      const ratio = total > 0 ? value / total : 1 / Math.max(items.length, 1);
      const dash = ratio * circumference;
      const offset = items
        .slice(0, index)
        .reduce((sum, previous) => {
          const previousValue = Math.max(previous.value, 0);
          const previousRatio = total > 0 ? previousValue / total : 1 / Math.max(items.length, 1);
          return sum + previousRatio * circumference;
        }, 0);

      const segment = {
        ...item,
        color: item.color ?? chartColors[index % chartColors.length],
        dasharray: `${dash} ${circumference - dash}`,
        dashoffset: -offset,
      };
      return segment;
    });
  }, [circumference, items, total]);

  const content = (
    <Card className="h-full overflow-hidden border-white/75 bg-white/92 shadow-[0_24px_65px_-44px_rgba(15,23,42,0.35)] backdrop-blur-sm transition-all group-hover:-translate-y-0.5 group-hover:border-sky-200 group-hover:shadow-[0_28px_70px_-46px_rgba(14,116,255,0.44)]">
      <CardHeader className="gap-4">
        <div className="flex items-center justify-between gap-3">
          <CardDescription className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-sky-700/90">
            {title}
          </CardDescription>
          {href ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-sky-50 text-sky-700 transition-colors group-hover:border-sky-200 group-hover:bg-sky-100">
              <ExternalLink className="size-3.5" />
            </span>
          ) : null}
        </div>
        <div className="grid gap-4">
          <div className="grid grid-cols-[116px_1fr] items-center gap-4">
            <div className="relative size-28">
              <svg viewBox="0 0 100 100" className="size-28 -rotate-90 drop-shadow-sm" role="img" aria-label={`${title} breakdown`}>
                <circle cx="50" cy="50" r={radius} fill="none" stroke="#e0f2fe" strokeWidth="14" />
                <circle cx="50" cy="50" r="23" fill="#ffffff" />
                <circle cx="50" cy="50" r="44" fill="none" stroke="#f8fafc" strokeWidth="1" />
              {segments.map((segment, index) => (
                <circle
                  key={segment.label}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={activeIndex === index ? 15 : 12}
                  strokeDasharray={segment.dasharray}
                  strokeDashoffset={segment.dashoffset}
                  strokeLinecap="round"
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  tabIndex={0}
                />
              ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="text-2xl font-semibold text-slate-950">{formatter(activeItem?.value ?? 0)}</div>
                <div className="max-w-20 truncate text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {activeItem?.label ?? "No data"}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/55 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700/80">Total</div>
              <div className="mt-1 text-3xl font-semibold text-slate-950">{formatter(total)}</div>
              <div className="mt-1 text-xs text-slate-500">Open full workspace</div>
            </div>
          </div>
          <div className="grid gap-2">
              {segments.map((segment, index) => (
                <div
                  key={segment.label}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                    activeIndex === index ? "border-sky-200 bg-sky-50 text-slate-950" : "border-transparent bg-transparent text-slate-600 hover:bg-sky-50/70",
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  tabIndex={0}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                    <span className="truncate">{segment.label}</span>
                  </span>
                  <span className="font-semibold">{formatter(segment.value)}</span>
                </div>
              ))}
            </div>
        </div>
      </CardHeader>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="group block h-full">
        {content}
      </Link>
    );
  }

  return content;
}

export function ConversionGraph({
  items,
}: {
  items: Array<{
    label: string;
    value: number;
  }>;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeItem = items[activeIndex] ?? items[0];
  const score =
    items.length === 0
      ? 0
      : Math.round(items.reduce((total, item) => total + Math.min(Math.max(item.value, 0), 100), 0) / items.length);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 rounded-[1.5rem] border border-sky-100 bg-linear-to-br from-sky-50 via-white to-cyan-50 p-4 sm:grid-cols-[150px_1fr] sm:items-center">
        <div className="relative mx-auto size-36">
          <svg viewBox="0 0 100 100" className="size-36 -rotate-90" role="img" aria-label="Conversion health score">
            <circle cx="50" cy="50" r="38" fill="none" stroke="#e0f2fe" strokeWidth="12" />
            <circle
              cx="50"
              cy="50"
              r="38"
              fill="none"
              stroke="#0284c7"
              strokeLinecap="round"
              strokeWidth="12"
              strokeDasharray={`${(score / 100) * 238.76} ${238.76 - (score / 100) * 238.76}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-3xl font-semibold text-slate-950">{score}%</div>
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">Score</div>
          </div>
        </div>

        <div className="grid gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-950">{activeItem?.label ?? "Conversion"}</div>
            <div className="mt-1 text-xs text-slate-500">Hover a row to focus the health signal.</div>
          </div>
          <div className="grid gap-2">
            {items.map((item, index) => (
              <button
                key={item.label}
                type="button"
                className={cn(
                  "grid gap-1 rounded-xl border px-3 py-2 text-left transition-colors",
                  activeIndex === index ? "border-sky-200 bg-white shadow-sm" : "border-transparent hover:bg-white/70",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-700">{item.label}</span>
                  <span className="font-semibold text-slate-950">{item.value}%</span>
                </div>
                <span className="block h-2 overflow-hidden rounded-full bg-sky-100">
                  <span
                    className={cn("block h-full rounded-full transition-all", activeIndex === index ? "bg-sky-600" : "bg-sky-400")}
                    style={{ width: `${Math.min(Math.max(item.value, 0), 100)}%` }}
                  />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ToneBadge({ tone, children }: { tone: "good" | "neutral" | "risk"; children: ReactNode }) {
  const variant = tone === "risk" ? "destructive" : tone === "good" ? "default" : "outline";
  return <Badge variant={variant}>{children}</Badge>;
}
