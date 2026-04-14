"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";

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
    <div className="grid gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load integrations</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>Select an integration to configure it step by step.</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {integrationsCatalog.map((integration) => {
          const Icon = integration.icon;
          const status = getIntegrationStatus(integration.key, hub, settings);

          return (
            <Link key={integration.key} href={`/dashboard/integrations/${integration.key}`} className="group">
              <Card className="h-full border-border/60 transition-colors group-hover:border-primary/40">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                        <Icon className="size-4" />
                      </span>
                      <CardTitle className="text-base">{integration.title}</CardTitle>
                    </div>
                    <Badge variant={status === "completed" ? "secondary" : "outline"}>{status === "completed" ? "Completed" : "Pending"}</Badge>
                  </div>
                  <CardDescription>{integration.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{integration.steps.length} steps</span>
                  <ArrowUpRight className="size-4 text-primary/70" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading integrations...</p> : null}
    </div>
  );
}
