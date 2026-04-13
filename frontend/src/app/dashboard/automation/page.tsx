"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";

type AutomationStatus = "active" | "paused";

interface AutomationAction {
  type: string;
  config: Record<string, unknown>;
}

interface AutomationLog {
  id: string;
  status: "success" | "failed";
  message: string;
  executedAt: string;
}

interface Automation {
  id: string;
  name: string;
  status: AutomationStatus;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  testModeEnabled: boolean;
  branchMode: string;
  channelMetadata: Record<string, unknown>;
  actions: AutomationAction[];
  notes: string | null;
  logs: AutomationLog[];
}

interface AutomationListResponse {
  items: Automation[];
}

const statusTone: Record<AutomationStatus, "default" | "outline" | "secondary" | "destructive"> = {
  active: "default",
  paused: "outline",
};

const runTone: Record<AutomationLog["status"], "default" | "outline" | "secondary" | "destructive"> = {
  success: "default",
  failed: "destructive",
};

export default function AutomationPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<AutomationStatus>("active");
  const [triggerType, setTriggerType] = useState("lead.created");
  const [triggerConfigText, setTriggerConfigText] = useState('{"source":"website"}');
  const [actionsText, setActionsText] = useState('[{"type":"task.create","config":{"title":"Follow up with lead"}}]');
  const [notes, setNotes] = useState("");
  const [testModeEnabled, setTestModeEnabled] = useState(true);
  const [branchMode, setBranchMode] = useState("conditional");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [workingAutomationId, setWorkingAutomationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAutomations = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusFilter) {
      params.set("status", statusFilter);
    }

    try {
      const data = await apiRequest<AutomationListResponse>(`/automation/list?${params.toString()}`);
      setAutomations(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load automations");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadAutomations();
  }, [loadAutomations]);

  const parseJson = <T,>(value: string, label: string): T => {
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new Error(`${label} must be valid JSON`);
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const triggerConfig = parseJson<Record<string, unknown>>(triggerConfigText, "Trigger config");
      const actions = parseJson<AutomationAction[]>(actionsText, "Actions");

      await apiRequest("/automation", {
        method: "POST",
        body: JSON.stringify({
          name,
          status,
          triggerType,
          triggerConfig,
          testModeEnabled,
          branchMode,
          channelMetadata: {},
          actions,
          notes: notes || undefined,
        }),
      });

      setName("");
      setStatus("active");
      setTriggerType("lead.created");
      setTriggerConfigText('{"source":"website"}');
      setActionsText('[{"type":"task.create","config":{"title":"Follow up with lead"}}]');
      setNotes("");
      setTestModeEnabled(true);
      setBranchMode("conditional");
      await loadAutomations();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : requestError instanceof Error ? requestError.message : "Unable to create automation");
    } finally {
      setSubmitting(false);
    }
  };

  const updateAutomationStatus = async (automationId: string, nextStatus: AutomationStatus) => {
    setWorkingAutomationId(automationId);
    setError(null);

    try {
      await apiRequest(`/automation/${automationId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadAutomations();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update automation");
    } finally {
      setWorkingAutomationId(null);
    }
  };

  const testRunAutomation = async (automationId: string) => {
    setWorkingAutomationId(automationId);
    setError(null);

    try {
      await apiRequest(`/automation/${automationId}/test-run`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadAutomations();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to execute automation test run");
    } finally {
      setWorkingAutomationId(null);
    }
  };

  const deleteAutomation = async (automationId: string) => {
    setWorkingAutomationId(automationId);
    setError(null);

    try {
      await apiRequest(`/automation/${automationId}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      });
      await loadAutomations();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to delete automation");
    } finally {
      setWorkingAutomationId(null);
    }
  };

  return (
    <>
      <div className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Automation request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <CardHeader>
              <CardTitle>Create automation</CardTitle>
              <CardDescription>Define a trigger, JSON trigger config, and one or more action steps.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={handleCreate}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="automation-name">Workflow name</FieldLabel>
                    <Input id="automation-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Website lead follow-up" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="automation-status">Status</FieldLabel>
                    <select id="automation-status" value={status} onChange={(event) => setStatus(event.target.value as AutomationStatus)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                      <option value="active">active</option>
                      <option value="paused">paused</option>
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="automation-triggerType">Trigger type</FieldLabel>
                    <Input id="automation-triggerType" value={triggerType} onChange={(event) => setTriggerType(event.target.value)} placeholder="lead.created" required />
                    <FieldDescription>Examples: `lead.created`, `deal.won`, `task.overdue`.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="automation-branch-mode">Branch mode</FieldLabel>
                    <select id="automation-branch-mode" value={branchMode} onChange={(event) => setBranchMode(event.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                      <option value="none">none</option>
                      <option value="conditional">conditional</option>
                    </select>
                  </Field>
                </FieldGroup>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={testModeEnabled} onChange={(event) => setTestModeEnabled(event.target.checked)} />
                  Enable workflow test mode by default
                </label>

                <Field>
                  <FieldLabel htmlFor="automation-triggerConfig">Trigger config JSON</FieldLabel>
                  <Textarea id="automation-triggerConfig" value={triggerConfigText} onChange={(event) => setTriggerConfigText(event.target.value)} className="min-h-28 font-mono text-xs" />
                </Field>

                <Field>
                  <FieldLabel htmlFor="automation-actions">Actions JSON array</FieldLabel>
                  <Textarea id="automation-actions" value={actionsText} onChange={(event) => setActionsText(event.target.value)} className="min-h-40 font-mono text-xs" />
                  <FieldDescription>Use an array of action objects with `type` and `config` to model multi-step workflows.</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="automation-notes">Notes</FieldLabel>
                  <Textarea id="automation-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-24" placeholder="Operator notes, guardrails, ownership..." />
                </Field>

                <Button type="submit" disabled={submitting} className="w-fit">
                  {submitting ? "Creating..." : "Create automation"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Workflow list</CardTitle>
              <CardDescription>Filter, pause, test-run, and inspect recent execution logs per workflow.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <Field>
                  <FieldLabel htmlFor="automation-filter-status">Status filter</FieldLabel>
                  <select id="automation-filter-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                    <option value="">All statuses</option>
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                  </select>
                </Field>
                <div className="flex items-end">
                  <Button type="button" variant="outline" onClick={() => void loadAutomations()}>
                    Apply filter
                  </Button>
                </div>
              </div>

              {loading ? <div className="text-sm text-muted-foreground">Loading automations...</div> : null}

              {!loading ? (
                <div className="grid gap-3">
                  {automations.map((automation) => (
                    <Card key={automation.id} size="sm">
                      <CardHeader>
                        <CardTitle className="flex flex-wrap items-center gap-2">
                          <span>{automation.name}</span>
                          <Badge variant={statusTone[automation.status]}>{automation.status}</Badge>
                          <Badge variant="outline">{automation.triggerType}</Badge>
                          <Badge variant="secondary">{automation.actions.length} actions</Badge>
                        </CardTitle>
                        <CardDescription>{automation.notes ?? "No notes"}</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4">
                        <div className="grid gap-3 rounded-xl border bg-muted/10 p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Trigger config</div>
                          <pre className="overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(automation.triggerConfig, null, 2)}</pre>
                        </div>

                        <div className="grid gap-3 rounded-xl border bg-muted/10 p-3">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Actions</div>
                          <pre className="overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(automation.actions, null, 2)}</pre>
                        </div>

                        <div className="grid gap-2">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">Recent runs</div>
                          {automation.logs.map((log) => (
                            <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/10 px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={runTone[log.status]}>{log.status}</Badge>
                                <span className="text-sm text-muted-foreground">{log.message}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">{new Date(log.executedAt).toLocaleString()}</span>
                            </div>
                          ))}
                          {automation.logs.length === 0 ? <div className="text-sm text-muted-foreground">No execution logs yet.</div> : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={workingAutomationId === automation.id}
                            onClick={() => void updateAutomationStatus(automation.id, automation.status === "active" ? "paused" : "active")}
                          >
                            {workingAutomationId === automation.id ? "Working..." : automation.status === "active" ? "Pause" : "Activate"}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={workingAutomationId === automation.id}
                            onClick={() => void testRunAutomation(automation.id)}
                          >
                            Test run
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            disabled={workingAutomationId === automation.id}
                            onClick={() => void deleteAutomation(automation.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {automations.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                      No automations found for the active filter.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

