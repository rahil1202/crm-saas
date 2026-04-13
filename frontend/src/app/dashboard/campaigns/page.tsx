"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest, buildApiUrl } from "@/lib/api";

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
  linkedCustomers: Array<{ customerId: string; fullName: string; email: string | null }>;
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

interface EmailAccount {
  id: string;
  label: string;
  provider: string;
  fromName: string | null;
  fromEmail: string;
  status: "connected" | "disconnected";
  isDefault: boolean;
}

interface DeliveryLogItem {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  status: "queued" | "sending" | "sent" | "delivered" | "failed";
  provider: string;
  providerMessageId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  lastError: string | null;
  queuedAt: string;
  recentEvents: Array<{
    emailMessageId: string;
    eventType: "sent" | "delivered" | "opened" | "clicked" | "replied" | "failed";
    occurredAt: string;
    url: string | null;
  }>;
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
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [deliveryLog, setDeliveryLog] = useState<DeliveryLogItem[]>([]);

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

  const [emailAccountLabel, setEmailAccountLabel] = useState("Primary outbound");
  const [emailProvider, setEmailProvider] = useState("resend");
  const [emailFromName, setEmailFromName] = useState("");
  const [emailFromAddress, setEmailFromAddress] = useState("");
  const [emailIsDefault, setEmailIsDefault] = useState(true);
  const [testRecipientEmail, setTestRecipientEmail] = useState("");
  const [testRecipientName, setTestRecipientName] = useState("");
  const [testSubject, setTestSubject] = useState("Runtime validation email");
  const [testBody, setTestBody] = useState("<p>This is a live provider test from the CRM runtime.</p>");

  const [statusFilter, setStatusFilter] = useState("");
  const [templateTypeFilter, setTemplateTypeFilter] = useState("");

  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingEmailAccounts, setLoadingEmailAccounts] = useState(true);
  const [loadingDeliveryLog, setLoadingDeliveryLog] = useState(true);
  const [submittingCampaign, setSubmittingCampaign] = useState(false);
  const [submittingTemplate, setSubmittingTemplate] = useState(false);
  const [submittingEmailAccount, setSubmittingEmailAccount] = useState(false);
  const [submittingTestEmail, setSubmittingTestEmail] = useState(false);
  const [savingCampaignId, setSavingCampaignId] = useState<string | null>(null);
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
  const [launchingCampaignId, setLaunchingCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);

  const resendWebhookUrl = useMemo(() => buildApiUrl("/public/email/resend/webhook"), []);

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);

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
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load customers");
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const params = new URLSearchParams();
      if (templateTypeFilter) params.set("type", templateTypeFilter);
      const data = await apiRequest<TemplateListResponse>(`/templates/list?${params.toString()}`);
      setTemplates(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load templates");
    } finally {
      setLoadingTemplates(false);
    }
  }, [templateTypeFilter]);

  const loadEmailAccounts = useCallback(async () => {
    setLoadingEmailAccounts(true);
    try {
      const data = await apiRequest<{ items: EmailAccount[] }>("/campaigns/email-accounts");
      setEmailAccounts(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load email accounts");
    } finally {
      setLoadingEmailAccounts(false);
    }
  }, []);

  const loadDeliveryLog = useCallback(async () => {
    setLoadingDeliveryLog(true);
    try {
      const data = await apiRequest<{ items: DeliveryLogItem[] }>("/campaigns/delivery-log?limit=12");
      setDeliveryLog(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load delivery log");
    } finally {
      setLoadingDeliveryLog(false);
    }
  }, []);

  useEffect(() => void loadCampaigns(), [loadCampaigns]);
  useEffect(() => void loadCustomers(), [loadCustomers]);
  useEffect(() => void loadTemplates(), [loadTemplates]);
  useEffect(() => void loadEmailAccounts(), [loadEmailAccounts]);
  useEffect(() => void loadDeliveryLog(), [loadDeliveryLog]);

  const toggleCustomerSelection = (customerId: string) => {
    setSelectedCustomerIds((current) => (current.includes(customerId) ? current.filter((id) => id !== customerId) : [...current, customerId]));
  };

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

  const handleCreateEmailAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingEmailAccount(true);
    setError(null);
    setDeliveryMessage(null);
    try {
      await apiRequest("/campaigns/email-accounts", {
        method: "POST",
        body: JSON.stringify({
          label: emailAccountLabel,
          provider: emailProvider,
          fromName: emailFromName || undefined,
          fromEmail: emailFromAddress,
          isDefault: emailIsDefault,
        }),
      });
      setEmailFromName("");
      setEmailFromAddress("");
      setEmailIsDefault(true);
      await loadEmailAccounts();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to create email account");
    } finally {
      setSubmittingEmailAccount(false);
    }
  };

  const handleSendTestEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingTestEmail(true);
    setError(null);
    setDeliveryMessage(null);
    try {
      const response = await apiRequest<{ queued: boolean; messageId: string; recipientEmail: string; status: string }>("/campaigns/test-email", {
        method: "POST",
        body: JSON.stringify({
          recipientEmail: testRecipientEmail,
          recipientName: testRecipientName || undefined,
          subject: testSubject,
          body: testBody,
        }),
      });
      setDeliveryMessage(`Queued test email to ${response.recipientEmail}. Message ${response.messageId} is ${response.status}.`);
      await loadDeliveryLog();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to queue test email");
    } finally {
      setSubmittingTestEmail(false);
    }
  };

  const updateCampaignStatus = async (campaignId: string, nextStatus: CampaignStatus) => {
    setSavingCampaignId(campaignId);
    setError(null);
    try {
      await apiRequest(`/campaigns/${campaignId}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      await loadCampaigns();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update campaign");
    } finally {
      setSavingCampaignId(null);
    }
  };

  const launchCampaign = async (campaignId: string) => {
    setLaunchingCampaignId(campaignId);
    setError(null);
    try {
      await apiRequest(`/campaigns/${campaignId}/launch`, { method: "POST", body: JSON.stringify({}) });
      await loadCampaigns();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to launch campaign");
    } finally {
      setLaunchingCampaignId(null);
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    setSavingCampaignId(campaignId);
    setError(null);
    try {
      await apiRequest(`/campaigns/${campaignId}`, { method: "DELETE", body: JSON.stringify({}) });
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
      await apiRequest(`/templates/${templateId}`, { method: "DELETE", body: JSON.stringify({}) });
      await loadTemplates();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to delete template");
    } finally {
      setSavingTemplateId(null);
    }
  };

  return (
    <>
      <div className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Campaign request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Tabs defaultValue="campaigns" queryKey="tab" className="grid gap-6">
          <TabsList className="w-fit">
            <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="delivery">Delivery</TabsTrigger>
          </TabsList>
          <TabsContent value="campaigns">
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Create campaign</CardTitle>
                  <CardDescription>Campaign launch uses the live email queue once a sender identity exists.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-4" onSubmit={handleCreateCampaign}>
                    <FieldGroup>
                      <Field><FieldLabel>Campaign name</FieldLabel><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
                      <Field><FieldLabel>Channel</FieldLabel><Input value={channel} onChange={(event) => setChannel(event.target.value)} required /></Field>
                      <Field>
                        <FieldLabel>Status</FieldLabel>
                        <select value={status} onChange={(event) => setStatus(event.target.value as CampaignStatus)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                          {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </Field>
                      <Field><FieldLabel>Scheduled time</FieldLabel><Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></Field>
                    </FieldGroup>
                    <Field><FieldLabel>Audience description</FieldLabel><Input value={audienceDescription} onChange={(event) => setAudienceDescription(event.target.value)} /></Field>
                    <Field>
                      <FieldLabel>Linked customers</FieldLabel>
                      <FieldDescription>Recipients without email stay linked for history but are skipped by the queue.</FieldDescription>
                      <div className="grid max-h-56 gap-2 overflow-auto rounded-xl border bg-muted/20 p-3">
                        {customers.map((customer) => (
                          <label key={customer.id} className="flex items-start gap-2 text-sm">
                            <input type="checkbox" checked={selectedCustomerIds.includes(customer.id)} onChange={() => toggleCustomerSelection(customer.id)} />
                            <span><span className="font-medium">{customer.fullName}</span><span className="block text-muted-foreground">{customer.email ?? "No email"}</span></span>
                          </label>
                        ))}
                      </div>
                    </Field>
                    <Field><FieldLabel>Notes</FieldLabel><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-28" /></Field>
                    <Button type="submit" disabled={submittingCampaign} className="w-fit">{submittingCampaign ? "Creating..." : "Create campaign"}</Button>
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Campaign list</CardTitle>
                  <CardDescription>Launch, monitor, and prune runtime-backed campaign batches.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Field>
                      <FieldLabel>Status filter</FieldLabel>
                      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                        <option value="">All statuses</option>
                        {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </Field>
                    <div className="flex items-end"><Button type="button" variant="outline" onClick={() => void loadCampaigns()}>Apply filter</Button></div>
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
                            <CardDescription>{campaign.audienceDescription ?? "No audience description"}</CardDescription>
                          </CardHeader>
                          <CardContent className="grid gap-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary">{campaign.audienceCount} linked customers</Badge>
                              {campaign.linkedCustomers.slice(0, 3).map((customer) => <Badge key={customer.customerId} variant="outline">{customer.fullName}</Badge>)}
                            </div>
                            <div className="grid gap-3 md:grid-cols-4">
                              {[
                                ["Sent", campaign.sentCount],
                                ["Delivered", campaign.deliveredCount],
                                ["Opened", campaign.openedCount],
                                ["Clicked", campaign.clickedCount],
                              ].map(([label, value]) => (
                                <div key={label} className="rounded-xl border bg-muted/10 p-3">
                                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
                                  <div className="mt-1 text-xl font-semibold">{value}</div>
                                </div>
                              ))}
                            </div>
                            <div className="flex flex-wrap items-end gap-3">
                              <Field>
                                <FieldLabel>Status</FieldLabel>
                                <select value={campaign.status} onChange={(event) => void updateCampaignStatus(campaign.id, event.target.value as CampaignStatus)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm" disabled={savingCampaignId === campaign.id}>
                                  {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
                                </select>
                              </Field>
                              <Button type="button" disabled={launchingCampaignId === campaign.id || campaign.audienceCount === 0 || emailAccounts.length === 0} onClick={() => void launchCampaign(campaign.id)}>
                                {launchingCampaignId === campaign.id ? "Launching..." : "Launch"}
                              </Button>
                              <Button type="button" variant="destructive" disabled={savingCampaignId === campaign.id} onClick={() => void deleteCampaign(campaign.id)}>
                                {savingCampaignId === campaign.id ? "Working..." : "Delete"}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
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
                  <CardDescription>Templates render CRM variables such as <code>{"{{ customer.fullName | there }}"}</code>.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-4" onSubmit={handleCreateTemplate}>
                    <FieldGroup>
                      <Field><FieldLabel>Template name</FieldLabel><Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} required /></Field>
                      <Field>
                        <FieldLabel>Template type</FieldLabel>
                        <select value={templateType} onChange={(event) => setTemplateType(event.target.value as TemplateType)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                          {templateTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </Field>
                    </FieldGroup>
                    <Field><FieldLabel>Subject</FieldLabel><Input value={templateSubject} onChange={(event) => setTemplateSubject(event.target.value)} /></Field>
                    <Field><FieldLabel>Content</FieldLabel><Textarea value={templateContent} onChange={(event) => setTemplateContent(event.target.value)} className="min-h-40" /></Field>
                    <Field><FieldLabel>Notes</FieldLabel><Textarea value={templateNotes} onChange={(event) => setTemplateNotes(event.target.value)} className="min-h-24" /></Field>
                    <Button type="submit" disabled={submittingTemplate} className="w-fit">{submittingTemplate ? "Creating..." : "Create template"}</Button>
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Template library</CardTitle>
                  <CardDescription>Filter stored templates and remove outdated variants.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 rounded-xl border bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                    <Field>
                      <FieldLabel>Type filter</FieldLabel>
                      <select value={templateTypeFilter} onChange={(event) => setTemplateTypeFilter(event.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                        <option value="">All types</option>
                        {templateTypes.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </Field>
                    <div className="flex items-end"><Button type="button" variant="outline" onClick={() => void loadTemplates()}>Apply filter</Button></div>
                  </div>
                  {loadingTemplates ? <div className="text-sm text-muted-foreground">Loading templates...</div> : null}
                  {!loadingTemplates ? (
                    <div className="grid gap-3">
                      {templates.map((template) => (
                        <Card key={template.id} size="sm">
                          <CardHeader>
                            <CardTitle className="flex flex-wrap items-center gap-2"><span>{template.name}</span><Badge variant="outline">{template.type}</Badge></CardTitle>
                            <CardDescription>{template.subject ?? "No subject"}</CardDescription>
                          </CardHeader>
                          <CardContent className="grid gap-4">
                            <div className="text-sm whitespace-pre-wrap text-muted-foreground">{template.content}</div>
                            {template.notes ? <div className="text-sm text-muted-foreground">{template.notes}</div> : null}
                            <div className="flex justify-end"><Button type="button" variant="destructive" disabled={savingTemplateId === template.id} onClick={() => void deleteTemplate(template.id)}>{savingTemplateId === template.id ? "Working..." : "Delete"}</Button></div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent value="delivery">
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Connect sender identity</CardTitle>
                  <CardDescription>Register the sender identity used by the Resend-backed email runtime.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-4" onSubmit={handleCreateEmailAccount}>
                    <FieldGroup>
                      <Field><FieldLabel>Label</FieldLabel><Input value={emailAccountLabel} onChange={(event) => setEmailAccountLabel(event.target.value)} required /></Field>
                      <Field>
                        <FieldLabel>Provider</FieldLabel>
                        <select value={emailProvider} onChange={(event) => setEmailProvider(event.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                          <option value="resend">resend</option>
                          <option value="mock">mock</option>
                        </select>
                      </Field>
                    </FieldGroup>
                    <FieldGroup>
                      <Field><FieldLabel>From name</FieldLabel><Input value={emailFromName} onChange={(event) => setEmailFromName(event.target.value)} /></Field>
                      <Field><FieldLabel>From email</FieldLabel><Input type="email" value={emailFromAddress} onChange={(event) => setEmailFromAddress(event.target.value)} required /></Field>
                    </FieldGroup>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={emailIsDefault} onChange={(event) => setEmailIsDefault(event.target.checked)} />Make this the default sender</label>
                    <Button type="submit" disabled={submittingEmailAccount} className="w-fit">{submittingEmailAccount ? "Saving..." : "Save email account"}</Button>
                  </form>
                </CardContent>
              </Card>
              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Send test email</CardTitle>
                    <CardDescription>Queue a real outbound message through the currently configured provider path.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form className="grid gap-4" onSubmit={handleSendTestEmail}>
                      <FieldGroup>
                        <Field><FieldLabel>Recipient email</FieldLabel><Input type="email" value={testRecipientEmail} onChange={(event) => setTestRecipientEmail(event.target.value)} required /></Field>
                        <Field><FieldLabel>Recipient name</FieldLabel><Input value={testRecipientName} onChange={(event) => setTestRecipientName(event.target.value)} /></Field>
                      </FieldGroup>
                      <Field><FieldLabel>Subject</FieldLabel><Input value={testSubject} onChange={(event) => setTestSubject(event.target.value)} required /></Field>
                      <Field><FieldLabel>HTML body</FieldLabel><Textarea value={testBody} onChange={(event) => setTestBody(event.target.value)} className="min-h-28" required /></Field>
                      {deliveryMessage ? <div className="text-sm text-emerald-700">{deliveryMessage}</div> : null}
                      <Button type="submit" disabled={submittingTestEmail || emailAccounts.length === 0} className="w-fit">
                        {submittingTestEmail ? "Queueing..." : "Send test email"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Webhook and account status</CardTitle>
                  <CardDescription>Connect your provider to the runtime endpoints below.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="rounded-xl border bg-muted/20 p-4 text-sm">
                    <div className="font-medium">Resend webhook URL</div>
                    <div className="mt-2 break-all text-muted-foreground">{resendWebhookUrl}</div>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                    Backend secrets still need to be configured: <code>RESEND_API_KEY</code> and <code>RESEND_WEBHOOK_SECRET</code>.
                  </div>
                  {loadingEmailAccounts ? <div className="text-sm text-muted-foreground">Loading email accounts...</div> : null}
                  {!loadingEmailAccounts ? (
                    emailAccounts.length > 0 ? (
                      <div className="grid gap-3">
                        {emailAccounts.map((account) => (
                          <div key={account.id} className="rounded-xl border p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{account.label}</span>
                              <Badge variant="outline">{account.provider}</Badge>
                              <Badge variant={account.status === "connected" ? "secondary" : "outline"}>{account.status}</Badge>
                              {account.isDefault ? <Badge>default</Badge> : null}
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">{account.fromName ? `${account.fromName} • ` : ""}{account.fromEmail}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                        No sender identity configured yet. Campaign launch stays disabled until at least one email account exists.
                      </div>
                    )
                  ) : null}
                </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Recent delivery activity</CardTitle>
                    <CardDescription>Recent outbound email jobs, including test sends and tracking events.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {loadingDeliveryLog ? <div className="text-sm text-muted-foreground">Loading delivery log...</div> : null}
                    {!loadingDeliveryLog && deliveryLog.length === 0 ? (
                      <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No email delivery activity yet.</div>
                    ) : null}
                    {!loadingDeliveryLog && deliveryLog.length > 0 ? (
                      <div className="grid gap-3">
                        {deliveryLog.map((item) => (
                          <div key={item.id} className="rounded-xl border p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{item.recipientName ?? item.recipientEmail}</span>
                              <Badge variant="outline">{item.provider}</Badge>
                              <Badge variant={item.status === "failed" ? "destructive" : item.status === "delivered" ? "secondary" : "outline"}>{item.status}</Badge>
                              {item.campaignName ? <Badge variant="outline">{item.campaignName}</Badge> : <Badge variant="outline">manual</Badge>}
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">{item.subject}</div>
                            <div className="mt-2 text-xs text-muted-foreground">Queued {new Date(item.queuedAt).toLocaleString()}</div>
                            {item.lastError ? <div className="mt-2 text-sm text-red-600">{item.lastError}</div> : null}
                            {item.recentEvents.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {item.recentEvents.map((event) => (
                                  <Badge key={`${item.id}-${event.eventType}-${event.occurredAt}`} variant="secondary">
                                    {event.eventType} {new Date(event.occurredAt).toLocaleTimeString()}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

