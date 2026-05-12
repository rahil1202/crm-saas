"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Pause, Play, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageSection } from "@/components/ui/page-patterns";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { compactNumber } from "@/features/whatsapp-crm/format";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  templateName: string | null;
  templateLanguage: string;
  scheduleType: string;
  scheduledAt: string | null;
  throttleMps: number;
  totalAudience: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  estimatedCost: string;
  actualCost: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string | null;
  body: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  scheduled: "bg-sky-100 text-sky-700",
  sending: "bg-amber-100 text-amber-800",
  paused: "bg-orange-100 text-orange-700",
  completed: "bg-emerald-100 text-emerald-700",
  canceled: "bg-rose-100 text-rose-700",
};

export function WhatsappCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    templateId: "",
    scheduleType: "immediate",
    scheduledAt: "",
    throttleMps: "30",
    audiencePhones: "",
  });

  const loadCampaigns = useCallback(async () => {
    try {
      const [campaignsPayload, templatesPayload] = await Promise.all([
        apiRequest<{ items: Campaign[] }>("/whatsapp/campaigns?limit=50", { skipCache: true }),
        apiRequest<{ items: Template[] }>("/whatsapp-templates?status=approved"),
      ]);
      setCampaigns(campaignsPayload.items);
      setTemplates(templatesPayload.items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const createCampaign = async () => {
    if (!draft.name.trim()) {
      toast.error("Campaign name is required.");
      return;
    }
    setCreating(true);
    try {
      const campaign = await apiRequest<Campaign>("/whatsapp/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          templateId: draft.templateId || undefined,
          scheduleType: draft.scheduleType,
          scheduledAt: draft.scheduledAt || undefined,
          throttleMps: Number(draft.throttleMps) || 30,
        }),
      });

      // Add audience if phones provided
      const phones = draft.audiencePhones
        .split(/[\n,;]+/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (phones.length > 0) {
        await apiRequest(`/whatsapp/campaigns/${campaign.id}/audience`, {
          method: "POST",
          body: JSON.stringify({
            contacts: phones.map((phoneE164) => ({ phoneE164 })),
          }),
        });
      }

      setDraft({ name: "", description: "", templateId: "", scheduleType: "immediate", scheduledAt: "", throttleMps: "30", audiencePhones: "" });
      toast.success(`Campaign "${campaign.name}" created.`);
      await loadCampaigns();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to create campaign.");
    } finally {
      setCreating(false);
    }
  };

  const performAction = async (campaignId: string, action: "start" | "pause" | "cancel" | "duplicate") => {
    try {
      if (action === "duplicate") {
        await apiRequest(`/whatsapp/campaigns/${campaignId}/duplicate`, { method: "POST", body: JSON.stringify({}) });
        toast.success("Campaign duplicated.");
      } else {
        await apiRequest(`/whatsapp/campaigns/${campaignId}/${action}`, { method: "POST", body: JSON.stringify({}) });
        toast.success(`Campaign ${action}ed.`);
      }
      await loadCampaigns();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : `Unable to ${action} campaign.`);
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    if (!window.confirm("Delete this campaign?")) return;
    try {
      await apiRequest(`/whatsapp/campaigns/${campaignId}`, { method: "DELETE" });
      toast.success("Campaign deleted.");
      await loadCampaigns();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to delete campaign.");
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-dashed border-border/80 bg-white/45 px-4 py-3 text-sm text-muted-foreground">Loading campaigns…</div>;
  }

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <PageSection title="Campaign Builder" description="Create a broadcast campaign, select a template, add audience, and schedule delivery.">
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle className="text-base">
              <Plus className="mr-1.5 inline size-4" /> New campaign
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel>Campaign name</FieldLabel>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Black Friday Promo" />
              </Field>
              <Field>
                <FieldLabel>Template</FieldLabel>
                <NativeSelect value={draft.templateId} onChange={(e) => setDraft({ ...draft, templateId: e.target.value })}>
                  <option value="">Select approved template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.language}) — {t.category ?? "utility"}
                    </option>
                  ))}
                </NativeSelect>
                <FieldDescription>{templates.length} approved templates available.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Schedule</FieldLabel>
                <NativeSelect value={draft.scheduleType} onChange={(e) => setDraft({ ...draft, scheduleType: e.target.value })}>
                  <option value="immediate">Send immediately</option>
                  <option value="scheduled">Schedule for later</option>
                </NativeSelect>
              </Field>
              {draft.scheduleType === "scheduled" ? (
                <Field>
                  <FieldLabel>Send at</FieldLabel>
                  <Input type="datetime-local" value={draft.scheduledAt} onChange={(e) => setDraft({ ...draft, scheduledAt: e.target.value })} />
                </Field>
              ) : null}
              <Field>
                <FieldLabel>Throttle (MPS)</FieldLabel>
                <Input type="number" value={draft.throttleMps} onChange={(e) => setDraft({ ...draft, throttleMps: e.target.value })} min="1" max="1000" />
                <FieldDescription>Messages per second. Respects workspace limits.</FieldDescription>
              </Field>
            </div>
            <Field>
              <FieldLabel>Audience (phone numbers)</FieldLabel>
              <Textarea
                value={draft.audiencePhones}
                onChange={(e) => setDraft({ ...draft, audiencePhones: e.target.value })}
                placeholder="Paste phone numbers, one per line or comma-separated. You can also add from segments after creation."
                rows={3}
              />
              <FieldDescription>Or add audience from contact segments after creating the campaign.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Description (optional)</FieldLabel>
              <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Internal notes about this campaign" />
            </Field>
            <div className="flex justify-end">
              <Button onClick={() => void createCampaign()} disabled={creating}>
                {creating ? "Creating…" : "Create campaign"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageSection>

      <PageSection title="Campaigns" description={`${campaigns.length} campaigns in this workspace.`}>
        {campaigns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-white/50 p-6 text-center text-sm text-muted-foreground">
            No campaigns yet. Create one above.
          </div>
        ) : (
          <div className="grid gap-3">
            {campaigns.map((campaign) => {
              const total = campaign.totalAudience || 1;
              const deliveryRate = Math.round((campaign.deliveredCount / total) * 100);
              const readRate = Math.round((campaign.readCount / total) * 100);
              return (
                <Card key={campaign.id} className="border-border/70 bg-card/95">
                  <CardContent className="flex flex-wrap items-center gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{campaign.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${STATUS_COLORS[campaign.status] ?? "bg-slate-100 text-slate-700"}`}>
                          {campaign.status}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>Template: {campaign.templateName ?? "—"}</span>
                        <span>Audience: {compactNumber(campaign.totalAudience)}</span>
                        <span>Sent: {compactNumber(campaign.sentCount)}</span>
                        <span>Delivered: {deliveryRate}%</span>
                        <span>Read: {readRate}%</span>
                        <span>Failed: {compactNumber(campaign.failedCount)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {(campaign.status === "draft" || campaign.status === "scheduled" || campaign.status === "paused") ? (
                        <Button variant="outline" size="sm" onClick={() => void performAction(campaign.id, "start")}>
                          <Play className="mr-1 size-3" /> Start
                        </Button>
                      ) : null}
                      {campaign.status === "sending" ? (
                        <Button variant="outline" size="sm" onClick={() => void performAction(campaign.id, "pause")}>
                          <Pause className="mr-1 size-3" /> Pause
                        </Button>
                      ) : null}
                      {campaign.status !== "completed" && campaign.status !== "canceled" ? (
                        <Button variant="ghost" size="sm" onClick={() => void performAction(campaign.id, "cancel")}>
                          <X className="mr-1 size-3" /> Cancel
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => void performAction(campaign.id, "duplicate")}>
                        <Copy className="size-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void deleteCampaign(campaign.id)}>
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </PageSection>
    </div>
  );
}
