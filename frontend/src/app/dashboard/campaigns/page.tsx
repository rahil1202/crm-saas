"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";

type CampaignStatus = "draft" | "scheduled" | "active" | "completed" | "paused";

interface Campaign {
  id: string;
  name: string;
  channel: string;
  status: CampaignStatus;
  audienceDescription: string | null;
  scheduledAt: string | null;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  notes: string | null;
  audienceCount: number;
  linkedCustomers: Array<{
    customerId: string;
    fullName: string;
    email: string | null;
  }>;
}

interface ListResponse {
  items: Campaign[];
}

interface CustomerOption {
  id: string;
  fullName: string;
  email: string | null;
}

interface CustomerListResponse {
  items: CustomerOption[];
}

const statuses: CampaignStatus[] = ["draft", "scheduled", "active", "completed", "paused"];

const statusTone: Record<CampaignStatus, "outline" | "secondary" | "default" | "destructive"> = {
  draft: "outline",
  scheduled: "secondary",
  active: "default",
  completed: "default",
  paused: "destructive",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("email");
  const [status, setStatus] = useState<CampaignStatus>("draft");
  const [audienceDescription, setAudienceDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingCampaignId, setSavingCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusFilter) {
      params.set("status", statusFilter);
    }

    try {
      const data = await apiRequest<ListResponse>(`/campaigns/list?${params.toString()}`);
      setCampaigns(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load campaigns");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadCustomers = useCallback(async () => {
    try {
      const data = await apiRequest<CustomerListResponse>("/customers?limit=100");
      setCustomers(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load customers for campaign audience");
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await apiRequest("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name,
          channel,
          status,
          customerIds: selectedCustomerIds,
          audienceDescription: audienceDescription || undefined,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
          notes: notes || undefined,
        }),
      });
      setName("");
      setChannel("email");
      setStatus("draft");
      setAudienceDescription("");
      setScheduledAt("");
      setNotes("");
      setSelectedCustomerIds([]);
      await loadCampaigns();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to create campaign");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCustomerSelection = (customerId: string) => {
    setSelectedCustomerIds((current) =>
      current.includes(customerId) ? current.filter((id) => id !== customerId) : [...current, customerId],
    );
  };

  const updateCampaignStatus = async (campaignId: string, nextStatus: CampaignStatus) => {
    setSavingCampaignId(campaignId);
    setError(null);

    try {
      await apiRequest(`/campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadCampaigns();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update campaign");
    } finally {
      setSavingCampaignId(null);
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    setSavingCampaignId(campaignId);
    setError(null);

    try {
      await apiRequest(`/campaigns/${campaignId}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      });
      await loadCampaigns();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to delete campaign");
    } finally {
      setSavingCampaignId(null);
    }
  };

  return (
    <AppShell
      title="Campaigns & Templates"
      description="Campaign planning workspace for outbound batches, scheduling, audience targeting, and high-level delivery metrics."
    >
      <div className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Campaign request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <CardHeader>
              <CardTitle>Create campaign</CardTitle>
              <CardDescription>Start with email and basic scheduling so campaign delivery can be managed in the CRM workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={handleCreate}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="campaign-name">Campaign name</FieldLabel>
                    <Input id="campaign-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Q2 Renewal Outreach" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="campaign-channel">Channel</FieldLabel>
                    <Input id="campaign-channel" value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="email" required />
                    <FieldDescription>This first implementation stores the campaign channel as plain text.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="campaign-status">Status</FieldLabel>
                    <select
                      id="campaign-status"
                      value={status}
                      onChange={(event) => setStatus(event.target.value as CampaignStatus)}
                      className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                    >
                      {statuses.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="campaign-scheduledAt">Scheduled time</FieldLabel>
                    <Input id="campaign-scheduledAt" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
                  </Field>
                </FieldGroup>

                <Field>
                  <FieldLabel htmlFor="campaign-audience">Audience description</FieldLabel>
                  <Input id="campaign-audience" value={audienceDescription} onChange={(event) => setAudienceDescription(event.target.value)} placeholder="Customers with renewals due in 30 days" />
                </Field>

                <Field>
                  <FieldLabel>Linked customers</FieldLabel>
                  <FieldDescription>Select customers to create campaign-to-customer history links.</FieldDescription>
                  <div className="grid max-h-56 gap-2 overflow-auto rounded-xl border bg-muted/20 p-3">
                    {customers.map((customer) => (
                      <label key={customer.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedCustomerIds.includes(customer.id)}
                          onChange={() => toggleCustomerSelection(customer.id)}
                        />
                        <span>
                          <span className="font-medium">{customer.fullName}</span>
                          <span className="block text-muted-foreground">{customer.email ?? "No email"}</span>
                        </span>
                      </label>
                    ))}
                    {customers.length === 0 ? <div className="text-sm text-muted-foreground">No customers available for audience linking.</div> : null}
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="campaign-notes">Notes</FieldLabel>
                  <Textarea id="campaign-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-28" placeholder="Offer details, audience assumptions, copy handoff notes..." />
                </Field>

                <Button type="submit" disabled={submitting} className="w-fit">
                  {submitting ? "Creating..." : "Create campaign"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campaign list</CardTitle>
              <CardDescription>Review delivery metrics, filter by status, and manage live campaign state.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <Field>
                  <FieldLabel htmlFor="campaign-filter-status">Status filter</FieldLabel>
                  <select
                    id="campaign-filter-status"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    <option value="">All statuses</option>
                    {statuses.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex items-end">
                  <Button type="button" variant="outline" onClick={() => void loadCampaigns()}>
                    Apply filter
                  </Button>
                </div>
              </div>

              {loading ? <div className="text-sm text-muted-foreground">Loading campaigns...</div> : null}

              {!loading ? (
                <div className="grid gap-3">
                  {campaigns.map((campaign) => (
                    <Card key={campaign.id} size="sm">
                      <CardHeader>
                        <CardTitle className="flex flex-wrap items-center gap-2">
                          <span>{campaign.name}</span>
                          <Badge variant={statusTone[campaign.status]}>{campaign.status}</Badge>
                          <Badge variant="outline">{campaign.channel}</Badge>
                        </CardTitle>
                        <CardDescription>
                          {campaign.audienceDescription ?? "No audience description"}
                          {campaign.scheduledAt ? ` • Scheduled ${new Date(campaign.scheduledAt).toLocaleString()}` : ""}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{campaign.audienceCount} linked customers</Badge>
                          {campaign.linkedCustomers.slice(0, 4).map((customer) => (
                            <Badge key={customer.customerId} variant="outline">{customer.fullName}</Badge>
                          ))}
                          {campaign.linkedCustomers.length > 4 ? <Badge variant="outline">+{campaign.linkedCustomers.length - 4} more</Badge> : null}
                        </div>

                        <div className="grid gap-3 md:grid-cols-4">
                          <div className="rounded-xl border bg-muted/10 p-3">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Sent</div>
                            <div className="mt-1 text-xl font-semibold">{campaign.sentCount}</div>
                          </div>
                          <div className="rounded-xl border bg-muted/10 p-3">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Delivered</div>
                            <div className="mt-1 text-xl font-semibold">{campaign.deliveredCount}</div>
                          </div>
                          <div className="rounded-xl border bg-muted/10 p-3">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Opened</div>
                            <div className="mt-1 text-xl font-semibold">{campaign.openedCount}</div>
                          </div>
                          <div className="rounded-xl border bg-muted/10 p-3">
                            <div className="text-xs uppercase tracking-wide text-muted-foreground">Clicked</div>
                            <div className="mt-1 text-xl font-semibold">{campaign.clickedCount}</div>
                          </div>
                        </div>

                        {campaign.notes ? <div className="text-sm text-muted-foreground">{campaign.notes}</div> : null}

                        <div className="flex flex-wrap items-center gap-3">
                          <Field>
                            <FieldLabel>Status</FieldLabel>
                            <select
                              value={campaign.status}
                              onChange={(event) => void updateCampaignStatus(campaign.id, event.target.value as CampaignStatus)}
                              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                              disabled={savingCampaignId === campaign.id}
                            >
                              {statuses.map((item) => (
                                <option key={item} value={item}>
                                  {item}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <div className="flex items-end">
                            <Button type="button" variant="destructive" disabled={savingCampaignId === campaign.id} onClick={() => void deleteCampaign(campaign.id)}>
                              {savingCampaignId === campaign.id ? "Working..." : "Delete"}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {campaigns.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                      No campaigns found for the active filter.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
