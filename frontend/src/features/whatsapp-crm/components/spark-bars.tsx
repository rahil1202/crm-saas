interface SparkBarsProps {
  data: Array<{ day: string; count: number }>;
  ariaLabel?: string;
}

/**
 * Lightweight CSS-only bar chart for Phase 1. No chart libraries; keeps the
 * bundle small and matches the saas design system aesthetic.
 */
export function SparkBars({ data, ariaLabel = "Weekly trend" }: SparkBarsProps) {
  const max = Math.max(1, ...data.map((d) => d.count));

  return (
    <div className="flex items-end gap-1.5" role="img" aria-label={ariaLabel}>
      {data.map((point) => {
        const pct = Math.max(4, Math.round((point.count / max) * 100));
        return (
          <div key={point.day} className="group flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-md bg-emerald-200/80 transition-colors group-hover:bg-emerald-400"
              style={{ height: `${pct}%`, minHeight: "6px" }}
              title={`${point.day}: ${point.count}`}
            />
            <span className="text-[0.62rem] uppercase tracking-wide text-muted-foreground">{shortDay(point.day)}</span>
          </div>
        );
      })}
    </div>
  );
}

function shortDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return isoDate.slice(5);
  }
  return new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(date);
}
