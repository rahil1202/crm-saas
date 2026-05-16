"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/api";
import {
  getIntegrationStatus,
  integrationsCatalog,
  type IntegrationHubResponse,
  type IntegrationSettings,
} from "@/features/integrations/config";

export default function IntegrationsPage() {
  const [hub, setHub] = useState<IntegrationHubResponse | null>(null);
  const [settings, setSettings] = useState<IntegrationSettings["integrations"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const visibleIntegrations = integrationsCatalog.filter(
    (integration) => integration.key !== "linkedin" && integration.key !== "documents" && integration.key !== "webhooks",
  );

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
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load integrations.");
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, []);

  return (
    <div className="grid gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load integrations</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-border/60" size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>Integrations</CardTitle>
              <CardDescription>Connect the channels your team uses. Open one integration to finish its setup.</CardDescription>
            </div>
            {loading ? <Badge variant="outline">Loading status</Badge> : null}
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3">
        {visibleIntegrations.map((integration) => {
          const Icon = integration.icon;
          const status = getIntegrationStatus(integration.key, hub, settings);
          const completed = status === "completed";
          const href = integration.key === "whatsapp" ? "/dashboard/whatsapp-crm/integrations" : `/dashboard/integrations/${integration.key}`;

          return (
            <Link key={integration.key} href={href} className="group">
              <Card className="border-border/60 transition-colors group-hover:border-primary/40" size="sm">
                <CardContent className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">{integration.title}</CardTitle>
                        <Badge variant={completed ? "secondary" : "outline"}>{completed ? "Completed" : "Pending"}</Badge>
                      </div>
                      <CardDescription>{integration.description}</CardDescription>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {integration.steps.map((step, index) => (
                          <span key={step} className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-white/50 px-2 py-1 text-xs text-muted-foreground">
                            {completed || (index === 0 && completed) ? <CheckCircle2 className="size-3 text-primary" /> : <Circle className="size-3" />}
                            {step}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-primary">
                    <span>{completed ? "Review" : "Continue"}</span>
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
