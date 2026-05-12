import type { ComponentType, ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface PlaceholderPageProps {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  bulletpoints: string[];
  footnote?: ReactNode;
}

/**
 * Scaffolding surface for WhatsApp CRM pages that ship in later phases.
 * Keeps the navigation cohesive and signals scope to the operator.
 */
export function WhatsappPlaceholderPage({ title, description, icon: Icon, bulletpoints, footnote }: PlaceholderPageProps) {
  return (
    <div className="grid gap-4">
      <Card className="border-border/70 bg-card/95">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Icon className="size-5" />
            </span>
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border-dashed border-border/70 bg-white/60">
        <CardHeader>
          <CardTitle className="text-base">Scheduled for a later phase</CardTitle>
          <CardDescription>
            This page is a placeholder. The production experience ships in an upcoming milestone. Meanwhile, the underlying data
            and APIs are already available through the existing WhatsApp backend module.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm text-slate-700">
            {bulletpoints.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {footnote ? <div className="mt-4 text-xs text-muted-foreground">{footnote}</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
