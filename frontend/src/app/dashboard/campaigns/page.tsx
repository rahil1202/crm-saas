"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";

type CampaignStatus = "draft" | "scheduled" | "active" | "completed" | "paused";
type TemplateType = "email" | "whatsapp" | "sms" | "task" | "pipeline";

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

interface Template {
  id: string;
  name: string;
  type: TemplateType;
  subject: string | null;
  content: string;
  notes: string | null;
}

interface TemplateListResponse {
  items: Template[];
}

const statuses: CampaignStatus[] = ["draft", "scheduled", "active", "completed", "paused"];
const templateTypes: TemplateType[] = ["email", "whatsapp", "sms", "task", "pipeline"];

const statusTone: Record<CampaignStatus, "outline" | "secondary" | "default" | "destructive"> = {
  draft: "outline",
  scheduled: "secondary",
  active: "default",
  completed: "default",
  paused: "destructive",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);

  const [name, setName] = useState("");
  const [channel, setChannel] = useState("email");
  const [status, setStatus] = useState<CampaignStatus>("draft");
  const [audienceDescription, setAudienceDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);

  const [templateName, setTemplateName] = useState("");
  const [templateType, setTemplateType] = useState<TemplateType>("email");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateContent, setTemplateContent] = useState("");
  const [templateNotes, setTemplateNotes] = useState("");

  const [statusFilter, setStatusFilter] = useState<string>("");
  const [templateTypeFilter, setTemplateTypeFilter] = useState<string>("");

  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [submittingCampaign, setSubmittingCampaign] = useState(false);
  const [submittingTemplate, setSubmittingTemplate] = useState(false);
  const [savingCampaignId, setSavingCampaignId] = useState<string | null>(null);
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
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
      setLoadingCampaigns(false);
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

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const params = new URLSearchParams();
      if (templateTypeFilter) {
        params.set("type", templateTypeFilter);
      }
      const data = await apiRequest<TemplateListResponse>(`/templates/list?${params.toString()}`);
      setTemplates(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load templates");
    } finally {
      setLoadingTemplates(false);
    }
  }, [templateTypeFilter]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const handleCreateCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingCampaign(true);
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
      setSubmittingCampaign(false);
    }
  };

  const handleCreateTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingTemplate(true);
    setError(null);

    try {
      await apiRequest("/templates", {
        method: "POST",
        body: JSON.stringify({
          name: templateName,
          type: templateType,
          subject: templateSubject || undefined,
          content: templateContent,
          notes: templateNotes || undefined,
        }),
      });
      setTemplateName("");
      setTemplateType("email");
      setTemplateSubject("");
      setTemplateContent("");
      setTemplateNotes("");
      await loadTemplates();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to create template");
    } finally {
      setSubmittingTemplate(false);
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

  const deleteTemplate = async (templateId: string) => {
    setSavingTemplateId(templateId);
    setError(null);

    try {
      await apiRequest(`/templates/${templateId}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      });
      await loadTemplates();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to delete template");
    } finally {
      setSavingTemplateId(null);
    }
  };

  return (
    <AppShell
      title="Campaigns & Templates"
      description="Campaign planning workspace for outbound batches, scheduling, reusable templates, and high-level delivery metrics."
    >
      <div className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Campaign request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Tabs defaultValue="campaigns" className="grid gap-6">
          <TabsList className="w-fit">
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="campaigns">
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Create campaign</CardTitle>
                  <CardDescription>Start with email and basic scheduling so campaign delivery can be managed in the CRM workspace.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-4" onSubmit={handleCreateCampaign}>
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
                        <select id="campaign-status" value={status} onChange={(event) => setStatus(event.target.value as CampaignStatus)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
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
                            <input type="checkbox" checked={selectedCustomerIds.includes(customer.id)} onChange={() => toggleCustomerSelection(customer.id)} />
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

                    <Button type="submit" disabled={submittingCampaign} className="w-fit">
                      {submittingCampaign ? "Creating..." : "Create campaign"}
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
                      <select id="campaign-filter-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
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

                  {loadingCampaigns ? <div className="text-sm text-muted-foreground">Loading campaigns...</div> : null}

                  {!loadingCampaigns ? (
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
                                <select value={campaign.status} onChange={(event) => void updateCampaignStatus(campaign.id, event.target.value as CampaignStatus)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm" disabled={savingCampaignId === campaign.id}>
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
          </TabsContent>

          <TabsContent value="templates">
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Create template</CardTitle>
                  <CardDescription>Store reusable message, task, or pipeline templates inside the same module.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-4" onSubmit={handleCreateTemplate}>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="template-name">Template name</FieldLabel>
                        <Input id="template-name" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Renewal email v1" required />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="template-type">Template type</FieldLabel>
                        <select id="template-type" value={templateType} onChange={(event) => setTemplateType(event.target.value as TemplateType)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                          {templateTypes.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </FieldGroup>

                    <Field>
                      <FieldLabel htmlFor="template-subject">Subject</FieldLabel>
                      <Input id="template-subject" value={templateSubject} onChange={(event) => setTemplateSubject(event.target.value)} placeholder="Your renewal options" />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="template-content">Content</FieldLabel>
                      <Textarea id="template-content" value={templateContent} onChange={(event) => setTemplateContent(event.target.value)} className="min-h-40" placeholder="Template body, task checklist, or pipeline description..." />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="template-notes">Notes</FieldLabel>
                      <Textarea id="template-notes" value={templateNotes} onChange={(event) => setTemplateNotes(event.target.value)} className="min-h-24" placeholder="Context for operators using this template..." />
                    </Field>

                    <Button type="submit" disabled={submittingTemplate} className="w-fit">
                      {submittingTemplate ? "Creating..." : "Create template"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Template library</CardTitle>
                  <CardDescription>Filter stored templates by type and remove outdated variants.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Field>
                      <FieldLabel htmlFor="template-type-filter">Type filter</FieldLabel>
                      <select id="template-type-filter" value={templateTypeFilter} onChange={(event) => setTemplateTypeFilter(event.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                        <option value="">All types</option>
                        {templateTypes.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="flex items-end">
                      <Button type="button" variant="outline" onClick={() => void loadTemplates()}>
                        Apply filter
                      </Button>
                    </div>
                  </div>

                  {loadingTemplates ? <div className="text-sm text-muted-foreground">Loading templates...</div> : null}

                  {!loadingTemplates ? (
                    <div className="grid gap-3">
                      {templates.map((template) => (
                        <Card key={template.id} size="sm">
                          <CardHeader>
                            <CardTitle className="flex flex-wrap items-center gap-2">
                              <span>{template.name}</span>
                              <Badge variant="outline">{template.type}</Badge>
                            </CardTitle>
                            <CardDescription>{template.subject ?? "No subject"}</CardDescription>
                          </CardHeader>
                          <CardContent className="grid gap-4">
                            <div className="text-sm whitespace-pre-wrap text-muted-foreground">{template.content}</div>
                            {template.notes ? <div className="text-sm text-muted-foreground">{template.notes}</div> : null}
                            <div className="flex justify-end">
                              <Button type="button" variant="destructive" disabled={savingTemplateId === template.id} onClick={() => void deleteTemplate(template.id)}>
                                {savingTemplateId === template.id ? "Working..." : "Delete"}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}

                      {templates.length === 0 ? (
                        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                          No templates found for the active filter.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
