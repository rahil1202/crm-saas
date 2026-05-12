"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Clock, Globe, Shield, Users } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageSection } from "@/components/ui/page-patterns";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";

interface CrmSettings {
  id: string;
  companyId: string;
  defaultWorkspaceId: string | null;
  autoReplyEnabled: boolean;
  autoReplyBody: string | null;
  autoReplyOutsideHours: boolean;
  businessHours: { timezone: string; schedule: Array<{ day: number; start: string; end: string }> };
  assignmentStrategy: string;
  assignmentUserIds: string[];
  maxConcurrentPerAgent: number;
  unassignedTimeoutMinutes: number;
  webhookHealthAlertEnabled: boolean;
  webhookHealthAlertThreshold: number;
  realtimeTransport: string;
  defaultPriority: string;
  autoArchiveAfterHours: number;
  optInRequiredForCampaigns: boolean;
  updatedAt: string;
}

interface Workspace {
  id: string;
  name: string;
  phoneNumberId: string;
  isActive: boolean;
}

export function WhatsappSettingsPage() {
  const [settings, setSettings] = useState<CrmSettings | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const [settingsPayload, workspacesPayload] = await Promise.all([
        apiRequest<CrmSettings>("/whatsapp/settings", { skipCache: true }),
        apiRequest<{ items: Workspace[] }>("/whatsapp/dashboard/connections", { skipCache: true }),
      ]);
      setSettings(settingsPayload);
      setWorkspaces(workspacesPayload.items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const save = async (patch: Partial<CrmSettings>) => {
    try {
      const updated = await apiRequest<CrmSettings>("/whatsapp/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setSettings(updated);
      toast.success("Settings saved.");
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to save settings.");
    }
  };

  if (loading || !settings) {
    return <div className="rounded-2xl border border-dashed border-border/80 bg-white/45 px-4 py-3 text-sm text-muted-foreground">Loading settings…</div>;
  }

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <PageSection title="WhatsApp CRM Settings" description="Module-level configuration for the WhatsApp CRM. Changes apply immediately.">
        <div />
      </PageSection>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* General */}
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle className="text-base">
              <Globe className="mr-1.5 inline size-4" /> General
            </CardTitle>
            <CardDescription>Default workspace and priority for new conversations.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field>
              <FieldLabel>Default workspace</FieldLabel>
              <NativeSelect
                value={settings.defaultWorkspaceId ?? ""}
                onChange={(e) => void save({ defaultWorkspaceId: e.target.value || null })}
              >
                <option value="">Auto (first active)</option>
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name} ({ws.phoneNumberId})</option>
                ))}
              </NativeSelect>
              <FieldDescription>Used when no workspace is specified in API calls.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Default conversation priority</FieldLabel>
              <NativeSelect
                value={settings.defaultPriority}
                onChange={(e) => void save({ defaultPriority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Auto-archive after (hours)</FieldLabel>
              <Input
                type="number"
                value={settings.autoArchiveAfterHours}
                onChange={(e) => void save({ autoArchiveAfterHours: Number(e.target.value) || 0 })}
                min="0"
                max="8760"
              />
              <FieldDescription>0 = disabled. Resolved conversations are archived after this many hours.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Realtime transport</FieldLabel>
              <NativeSelect
                value={settings.realtimeTransport}
                onChange={(e) => void save({ realtimeTransport: e.target.value })}
              >
                <option value="sse">Server-Sent Events (SSE)</option>
                <option value="polling">Polling</option>
                <option value="websocket">WebSocket (future)</option>
              </NativeSelect>
            </Field>
          </CardContent>
        </Card>

        {/* Auto-reply */}
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle className="text-base">
              <Clock className="mr-1.5 inline size-4" /> Auto-reply
            </CardTitle>
            <CardDescription>Automatic response when no agent is available or outside business hours.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={settings.autoReplyEnabled}
                onCheckedChange={(checked) => void save({ autoReplyEnabled: Boolean(checked) })}
                id="auto-reply-enabled"
              />
              <label htmlFor="auto-reply-enabled" className="text-sm font-medium">Enable auto-reply</label>
            </div>
            <Field>
              <FieldLabel>Auto-reply message</FieldLabel>
              <Textarea
                value={settings.autoReplyBody ?? ""}
                onChange={(e) => setSettings({ ...settings, autoReplyBody: e.target.value })}
                onBlur={() => void save({ autoReplyBody: settings.autoReplyBody })}
                placeholder="Thanks for reaching out! We'll get back to you shortly."
                rows={3}
              />
            </Field>
            <div className="flex items-center gap-3">
              <Checkbox
                checked={settings.autoReplyOutsideHours}
                onCheckedChange={(checked) => void save({ autoReplyOutsideHours: Boolean(checked) })}
                id="auto-reply-outside"
              />
              <label htmlFor="auto-reply-outside" className="text-sm font-medium">Only reply outside business hours</label>
            </div>
            <Field>
              <FieldLabel>Business hours timezone</FieldLabel>
              <Input
                value={settings.businessHours.timezone}
                onChange={(e) => {
                  const next = { ...settings.businessHours, timezone: e.target.value };
                  setSettings({ ...settings, businessHours: next });
                }}
                onBlur={() => void save({ businessHours: settings.businessHours })}
                placeholder="UTC"
              />
              <FieldDescription>IANA timezone (e.g. Asia/Kolkata, America/New_York).</FieldDescription>
            </Field>
          </CardContent>
        </Card>

        {/* Assignment */}
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle className="text-base">
              <Users className="mr-1.5 inline size-4" /> Assignment routing
            </CardTitle>
            <CardDescription>How new conversations are assigned to agents.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field>
              <FieldLabel>Strategy</FieldLabel>
              <NativeSelect
                value={settings.assignmentStrategy}
                onChange={(e) => void save({ assignmentStrategy: e.target.value })}
              >
                <option value="manual">Manual (unassigned until agent picks up)</option>
                <option value="round_robin">Round-robin across team</option>
                <option value="least_busy">Least busy agent</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Max concurrent per agent</FieldLabel>
              <Input
                type="number"
                value={settings.maxConcurrentPerAgent}
                onChange={(e) => void save({ maxConcurrentPerAgent: Number(e.target.value) || 20 })}
                min="1"
                max="200"
              />
              <FieldDescription>Used by round-robin and least-busy strategies.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Unassigned timeout (minutes)</FieldLabel>
              <Input
                type="number"
                value={settings.unassignedTimeoutMinutes}
                onChange={(e) => void save({ unassignedTimeoutMinutes: Number(e.target.value) || 0 })}
                min="0"
                max="10080"
              />
              <FieldDescription>0 = disabled. Escalate unassigned conversations after this time.</FieldDescription>
            </Field>
          </CardContent>
        </Card>

        {/* Webhook health */}
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle className="text-base">
              <Bell className="mr-1.5 inline size-4" /> Webhook health
            </CardTitle>
            <CardDescription>Alert when webhook events fail repeatedly.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={settings.webhookHealthAlertEnabled}
                onCheckedChange={(checked) => void save({ webhookHealthAlertEnabled: Boolean(checked) })}
                id="webhook-alert"
              />
              <label htmlFor="webhook-alert" className="text-sm font-medium">Enable webhook health alerts</label>
            </div>
            <Field>
              <FieldLabel>Failure threshold</FieldLabel>
              <Input
                type="number"
                value={settings.webhookHealthAlertThreshold}
                onChange={(e) => void save({ webhookHealthAlertThreshold: Number(e.target.value) || 5 })}
                min="1"
                max="100"
              />
              <FieldDescription>Alert after this many consecutive failures in a 7-day window.</FieldDescription>
            </Field>
          </CardContent>
        </Card>

        {/* Campaigns */}
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle className="text-base">
              <Shield className="mr-1.5 inline size-4" /> Campaign compliance
            </CardTitle>
            <CardDescription>Controls for broadcast campaign behavior.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={settings.optInRequiredForCampaigns}
                onCheckedChange={(checked) => void save({ optInRequiredForCampaigns: Boolean(checked) })}
                id="opt-in-required"
              />
              <label htmlFor="opt-in-required" className="text-sm font-medium">Require opt-in for campaign sends</label>
            </div>
            <FieldDescription>
              When enabled, only contacts with opt_in_status = &ldquo;opted_in&rdquo; will receive campaign messages.
              This is recommended for compliance with Meta&apos;s messaging policies.
            </FieldDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
