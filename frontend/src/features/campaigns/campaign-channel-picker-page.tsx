"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ApiError, apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getCampaignChannelOptions } from "@/features/campaigns/campaign-channel-options";
import type { IntegrationHubResponse, IntegrationSettings } from "@/features/integrations/config";

export function CampaignChannelPickerPage() {
  const [hub, setHub] = useState<IntegrationHubResponse | null>(null);
  const [settings, setSettings] = useState<IntegrationSettings["integrations"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        const [hubPayload, settingsPayload] = await Promise.all([
          apiRequest<IntegrationHubResponse>("/settings/integration-hub"),
          apiRequest<IntegrationSettings>("/settings/integrations"),
        ]);
        if (!disposed) {
          setHub(hubPayload);
          setSettings(settingsPayload.integrations);
        }
      } catch (caughtError) {
        if (!disposed) {
          setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load campaign channels.");
        }
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, []);

  const options = useMemo(() => getCampaignChannelOptions(hub, settings), [hub, settings]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-border/60 bg-white px-5 py-4 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.18)]">
        <div>
          <h1 className="text-[1.7rem] font-semibold tracking-[-0.03em] text-slate-900">Choose Campaign Type</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pick the channel first. Then continue to the right add page for that campaign.</p>
        </div>
        <Link href="/dashboard/campaigns" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <ArrowLeft className="size-4" /> Back to Campaigns
        </Link>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load campaign types</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {options.map((option) => {
          const Icon = option.icon;
          const ready = option.integrationStatus !== "pending";
          const href = ready ? `/dashboard/campaigns/add/${option.key}` : option.integrationPath ?? "/dashboard/integrations";

          return (
            <Link
              key={option.key}
              href={href}
              className="group rounded-[1.35rem] border border-border/60 bg-white p-5 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-[0_24px_48px_-34px_rgba(14,116,144,0.28)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition group-hover:bg-sky-50 group-hover:text-sky-700">
                  <Icon className="size-5" />
                </span>
                <Badge variant={ready ? "secondary" : "outline"}>{ready ? "Ready" : "Setup first"}</Badge>
              </div>
              <div className="mt-5">
                <h2 className="text-lg font-semibold text-slate-900">{option.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{option.description}</p>
                <p className="mt-3 text-sm text-slate-600">{option.setup}</p>
              </div>
              <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-sky-700">
                {ready ? "Continue" : "Open integration setup"} <ArrowRight className="size-4" />
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
