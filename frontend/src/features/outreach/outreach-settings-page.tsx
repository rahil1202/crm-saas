"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError, apiRequest } from "@/lib/api";
import { OutreachTopNav } from "@/features/outreach/outreach-top-nav";

type OutreachAgentSettings = {
  enabled: boolean;
  dailyEmailEnabled: boolean;
  addLeadToLinkedIn: boolean;
  maxCompaniesPerRun: number;
  emailWindowStart: string;
  emailWindowEnd: string;
  sendDays: string[];
  maxEmailsPerDay: number;
  minMinutesBetweenEmails: number;
  searchSettings: {
    industries: string[];
    titles: string[];
    locations: string[];
    includeDomains: string[];
    excludeDomains: string[];
  };
  defaultTemplateId: string | null;
  defaultEmailAccountId: string | null;
  defaultFromName: string | null;
};

type Template = { id: string; name: string };
type EmailAccount = { id: string; label: string; fromEmail: string; status: string; isDefault: boolean };
type OutreachRun = {
  status: string;
  queuedCount: number;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
  lastError: string | null;
};

export function OutreachSettingsPage() {
  const [tab, setTab] = useState<"schedule" | "frequency" | "search">("schedule");
  const [settings, setSettings] = useState<OutreachAgentSettings | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const [response, templatesResponse, accountsResponse] = await Promise.all([
          apiRequest<{ outreachAgent: OutreachAgentSettings }>("/settings/outreach-agent"),
          apiRequest<{ items: Template[] }>("/templates/list?type=email&limit=100"),
          apiRequest<{ items: EmailAccount[] }>("/campaigns/email-accounts"),
        ]);
        if (!disposed) {
          setSettings(response.outreachAgent);
          setTemplates(templatesResponse.items);
          setEmailAccounts(accountsResponse.items);
        }
      } catch (caughtError) {
        if (!disposed) setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load outreach settings");
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiRequest<{ outreachAgent: OutreachAgentSettings }>("/settings/outreach-agent", {
        method: "PATCH",
        body: JSON.stringify({ outreachAgent: settings }),
      });
      setSettings(response.outreachAgent);
      setSuccess("Outreach settings saved.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to save outreach settings");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiRequest<{ run: OutreachRun }>("/outreach/run-now", { method: "POST", body: JSON.stringify({}) });
      const run = response.run;
      setSuccess(
        run.status === "completed"
          ? `Agent run complete: queued ${run.queuedCount}, processed ${run.processedCount}.`
          : `Agent run ${run.status}: ${run.lastError ?? "no eligible contacts"}.`,
      );
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to trigger outreach run");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Email Outreach Agent</h1>
        <p className="mt-1 text-sm text-slate-600">AI-driven discovery and automated email campaigns</p>
      </div>

      <OutreachTopNav />

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Automation Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={tab === "schedule" ? "default" : "outline"} size="sm" onClick={() => setTab("schedule")}>Schedule</Button>
            <Button type="button" variant={tab === "frequency" ? "default" : "outline"} size="sm" onClick={() => setTab("frequency")}>Frequency</Button>
            <Button type="button" variant={tab === "search" ? "default" : "outline"} size="sm" onClick={() => setTab("search")}>Search Settings</Button>
          </div>

          {tab === "schedule" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel>Enable daily email outreach</FieldLabel>
                <div className="pt-2">
                  <Checkbox
                    checked={settings?.dailyEmailEnabled === true}
                    onCheckedChange={(value) => setSettings((current) => (current ? { ...current, dailyEmailEnabled: value === true } : current))}
                  />
                </div>
              </Field>
              <Field>
                <FieldLabel>Add Lead to LinkedIn</FieldLabel>
                <div className="pt-2">
                  <Checkbox
                    checked={settings?.addLeadToLinkedIn === true}
                    onCheckedChange={(value) => setSettings((current) => (current ? { ...current, addLeadToLinkedIn: value === true } : current))}
                  />
                </div>
              </Field>
              <Field>
                <FieldLabel>Email window start</FieldLabel>
                <Input value={settings?.emailWindowStart ?? "09:00"} onChange={(event) => setSettings((current) => (current ? { ...current, emailWindowStart: event.target.value } : current))} />
              </Field>
              <Field>
                <FieldLabel>Email window end</FieldLabel>
                <Input value={settings?.emailWindowEnd ?? "17:00"} onChange={(event) => setSettings((current) => (current ? { ...current, emailWindowEnd: event.target.value } : current))} />
              </Field>
              <Field>
                <FieldLabel>Default email template</FieldLabel>
                <NativeSelect
                  value={settings?.defaultTemplateId ?? ""}
                  onChange={(event) => setSettings((current) => (current ? { ...current, defaultTemplateId: event.target.value || null } : current))}
                  className="h-10 rounded-xl px-3 text-sm"
                >
                  <option value="">Select template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Default sending account</FieldLabel>
                <NativeSelect
                  value={settings?.defaultEmailAccountId ?? ""}
                  onChange={(event) => setSettings((current) => (current ? { ...current, defaultEmailAccountId: event.target.value || null } : current))}
                  className="h-10 rounded-xl px-3 text-sm"
                >
                  <option value="">Use default connected account</option>
                  {emailAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label} - {account.fromEmail}{account.status !== "connected" ? " (disconnected)" : ""}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          ) : null}

          {tab === "frequency" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel>Max number of companies to email</FieldLabel>
                <Input
                  type="number"
                  value={settings?.maxCompaniesPerRun ?? 10}
                  onChange={(event) =>
                    setSettings((current) => (current ? { ...current, maxCompaniesPerRun: Number(event.target.value || 0) } : current))
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Max emails per day</FieldLabel>
                <Input
                  type="number"
                  value={settings?.maxEmailsPerDay ?? 100}
                  onChange={(event) =>
                    setSettings((current) => (current ? { ...current, maxEmailsPerDay: Number(event.target.value || 0) } : current))
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Min minutes between emails</FieldLabel>
                <Input
                  type="number"
                  value={settings?.minMinutesBetweenEmails ?? 5}
                  onChange={(event) =>
                    setSettings((current) => (current ? { ...current, minMinutesBetweenEmails: Number(event.target.value || 0) } : current))
                  }
                />
              </Field>
            </div>
          ) : null}

          {tab === "search" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel>Industries (comma separated)</FieldLabel>
                <Input
                  value={settings?.searchSettings.industries.join(", ") ?? ""}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            searchSettings: {
                              ...current.searchSettings,
                              industries: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                            },
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Titles (comma separated)</FieldLabel>
                <Input
                  value={settings?.searchSettings.titles.join(", ") ?? ""}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            searchSettings: {
                              ...current.searchSettings,
                              titles: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                            },
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Locations (comma separated)</FieldLabel>
                <Input
                  value={settings?.searchSettings.locations.join(", ") ?? ""}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            searchSettings: {
                              ...current.searchSettings,
                              locations: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                            },
                          }
                        : current,
                    )
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Include domains (comma separated)</FieldLabel>
                <Input
                  value={settings?.searchSettings.includeDomains.join(", ") ?? ""}
                  onChange={(event) =>
                    setSettings((current) =>
                      current
                        ? {
                            ...current,
                            searchSettings: {
                              ...current.searchSettings,
                              includeDomains: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                            },
                          }
                        : current,
                    )
                  }
                />
              </Field>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save} disabled={saving || !settings}>{saving ? "Saving..." : "Save settings"}</Button>
            <Button type="button" variant="outline" onClick={runNow} disabled={running || !settings}>{running ? "Running..." : "Run now"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
