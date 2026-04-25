import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageSection({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-4", className)}>
      {title || description ? (
        <header className="grid gap-1">
          {title ? <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2> : null}
          {description ? <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card size="sm" className="border-border/70 bg-card/90">
      <CardHeader>
        <CardDescription className="text-[0.72rem] font-semibold uppercase tracking-[0.18em]">{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardHeader>
    </Card>
  );
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 rounded-[1.6rem] border border-white/70 bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]", className)}>{children}</div>;
}

export function EmptyState({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[1.6rem] border border-dashed border-border/80 bg-white/45 p-6 text-sm", className)}>
      <div className="font-medium">{title}</div>
      {description ? <div className="mt-1 text-muted-foreground">{description}</div> : null}
    </div>
  );
}

export function LoadingState({ label = "Loading...", className }: { label?: string; className?: string }) {
  return <div className={cn("rounded-2xl border border-dashed border-border/80 bg-white/40 px-4 py-3 text-sm text-muted-foreground", className)}>{label}</div>;
}

export function CrudPanel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-border/70 bg-card/95", className)}>
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
