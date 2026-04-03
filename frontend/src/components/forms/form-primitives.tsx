"use client";

import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FormSection({
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
          {title ? <h3 className="text-base font-medium tracking-tight">{title}</h3> : null}
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function FormErrorSummary({
  title = "Request failed",
  error,
}: {
  title?: string;
  error: string | null;
}) {
  if (!error) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
}

export function FormActions({
  submitLabel,
  submittingLabel,
  submitting,
  children,
  className,
}: {
  submitLabel: string;
  submittingLabel?: string;
  submitting?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <Button type="submit" disabled={submitting}>
        {submitting ? submittingLabel ?? submitLabel : submitLabel}
      </Button>
      {children}
    </div>
  );
}
