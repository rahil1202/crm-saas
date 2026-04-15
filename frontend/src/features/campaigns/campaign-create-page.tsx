"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getCampaignChannelOptions, type CampaignStatus, type ChannelKey, type TemplateType } from "@/features/campaigns/campaign-channel-options";
import type { IntegrationHubResponse, IntegrationSettings } from "@/features/integrations/config";

interface Template {
  id: string;
  name: string;
  type: TemplateType;
  subject: string | null;
  content: string;
  notes: string | null;
}

interface CustomerOption {
  id: string;
  fullName: string;
  email: string | null;
}

const statuses: CampaignStatus[] = ["draft", "scheduled", "active", "completed", "paused"];

function buildCampaignNotes(input: {
  notes: string;
  templateName: string;
  sourceType: string;
  timeSpan: string;
  listName: string;
  partner: string;
}) {
  const blocks = [
    input.notes.trim(),
    input.templateName ? `Template: ${input.templateName}` : null,
    input.sourceType.trim() ? `Source Type: ${input.sourceType.trim()}` : null,
    input.timeSpan.trim() ? `Time Span: ${input.timeSpan.trim()}` : null,
    input.listName.trim() ? `List Name: ${input.listName.trim()}` : null,
    input.partner.trim() ? `Partner: ${input.partner.trim()}` : null,
  ].filter(Boolean);

  return blocks.join("\n");
}

export function CampaignCreatePage({ initialChannel }: { initialChannel: ChannelKey }) {
  const router = useRouter();
  const [hub, setHub] = useState<IntegrationHubResponse | null>(null);
  const [settings, setSettings] = useState<IntegrationSettings["integrations"] | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<CampaignStatus>("draft");
  const [sourceType, setSourceType] = useState("Broadcast");
  const [timeSpan, setTimeSpan] = useState("One-time");
  const [listName, setListName] = useState("");
  const [partner, setPartner] = useState("");
  const [audienceDescription, setAudienceDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        const [hubPayload, settingsPayload, templatePayload, customerPayload] = await Promise.all([
          apiRequest<IntegrationHubResponse>("/settings/integration-hub"),
          apiRequest<IntegrationSettings>("/settings/integrations"),
          apiRequest<{ items: Template[] }>("/templates/list?limit=100"),
          apiRequest<{ items: CustomerOption[] }>("/customers?limit=100"),
        ]);

        if (disposed) return;

        setHub(hubPayload);
        setSettings(settingsPayload.integrations);
        setTemplates(templatePayload.items);
        setCustomers(customerPayload.items);
      } catch (caughtError) {
        if (!disposed) {
          setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load campaign builder.");
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

  const channelOptions = useMemo(() => getCampaignChannelOptions(hub, settings), [hub, settings]);
  const selectedChannelOption = channelOptions.find((channel) => channel.key === initialChannel) ?? channelOptions[0];
  const integrationReady = selectedChannelOption.integrationStatus !== "pending";
  const filteredTemplates = useMemo(() => {
    if (!selectedChannelOption.templateType) return [];
    return templates.filter((template) => template.type === selectedChannelOption.templateType);
  }, [selectedChannelOption.templateType, templates]);

  useEffect(() => {
    if (filteredTemplates.length === 0) {
      setSelectedTemplateId("");
      return;
    }

    if (!filteredTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(filteredTemplates[0]?.id ?? "");
    }
  }, [filteredTemplates, selectedTemplateId]);

  const selectedTemplate = filteredTemplates.find((template) => template.id === selectedTemplateId) ?? null;

  const visibleCustomers = useMemo(() => {
    const needle = customerSearch.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((customer) =>
      `${customer.fullName} ${customer.email ?? ""}`.toLowerCase().includes(needle),
    );
  }, [customerSearch, customers]);

  const toggleCustomer = (customerId: string, checked: boolean) => {
    setSelectedCustomerIds((current) => (checked ? [...new Set([...current, customerId])] : current.filter((id) => id !== customerId)));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!integrationReady) {
      setError("Complete the required integration before creating this campaign.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await apiRequest("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          channel: initialChannel,
          status,
          customerIds: selectedCustomerIds,
          audienceDescription: audienceDescription.trim() || listName.trim() || undefined,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
          notes: buildCampaignNotes({
            notes,
            templateName: selectedTemplate?.name ?? "",
            sourceType,
            timeSpan,
            listName,
            partner,
          }) || undefined,
        }),
      });

      toast.success("Campaign created");
      router.push("/dashboard/campaigns");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to create campaign";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-border/60 bg-white px-5 py-4 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.18)]">
        <div>
          <h1 className="text-[1.7rem] font-semibold tracking-[-0.03em] text-slate-900">Create {selectedChannelOption.title} Campaign</h1>
          <p className="mt-1 text-sm text-muted-foreground">Set the campaign basics, audience, and schedule in one simple form.</p>
        </div>
        <Link href="/dashboard/campaigns/add" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          <ArrowLeft className="size-4" /> Back
        </Link>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Campaign builder blocked</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>{selectedChannelOption.title}</CardTitle>
          <CardDescription>{selectedChannelOption.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-sm text-muted-foreground">Loading campaign builder...</div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-6">
              {!integrationReady ? (
                <Alert>
                  <AlertTitle>Integration needed before create</AlertTitle>
                  <AlertDescription>
                    Finish the setup for <strong>{selectedChannelOption.title}</strong> first. Then come back here to create the campaign.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <Field>
                  <FieldLabel>Campaign name</FieldLabel>
                  <Input value={name} onChange={(event) => setName(event.target.value)} className="h-11" placeholder="Q2 partner reactivation" required />
                </Field>
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <NativeSelect value={status} onChange={(event) => setStatus(event.target.value as CampaignStatus)} className="h-11 rounded-2xl px-3 text-sm">
                    {statuses.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Source type</FieldLabel>
                  <NativeSelect value={sourceType} onChange={(event) => setSourceType(event.target.value)} className="h-11 rounded-2xl px-3 text-sm">
                    <option value="Broadcast">Broadcast</option>
                    <option value="Automation">Automation</option>
                    <option value="Retargeting">Retargeting</option>
                    <option value="Partner Outreach">Partner Outreach</option>
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Time span</FieldLabel>
                  <NativeSelect value={timeSpan} onChange={(event) => setTimeSpan(event.target.value)} className="h-11 rounded-2xl px-3 text-sm">
                    <option value="One-time">One-time</option>
                    <option value="Recurring">Recurring</option>
                    <option value="Drip">Drip</option>
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel>Start date</FieldLabel>
                  <Input value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} type="datetime-local" className="h-11" />
                </Field>
                <Field>
                  <FieldLabel>Partner</FieldLabel>
                  <Input value={partner} onChange={(event) => setPartner(event.target.value)} className="h-11" placeholder="Internal team or partner owner" />
                </Field>
                <Field>
                  <FieldLabel>List name</FieldLabel>
                  <Input value={listName} onChange={(event) => setListName(event.target.value)} className="h-11" placeholder="Warm leads - April" />
                </Field>
                <Field>
                  <FieldLabel>Template</FieldLabel>
                  <NativeSelect value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className="h-11 rounded-2xl px-3 text-sm">
                    <option value="">No template selected</option>
                    {filteredTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field className="lg:col-span-2">
                  <FieldLabel>Audience summary</FieldLabel>
                  <Input value={audienceDescription} onChange={(event) => setAudienceDescription(event.target.value)} className="h-11" placeholder="Opted-in customers with recent engagement" />
                </Field>
                <Field className="lg:col-span-2">
                  <FieldLabel>Notes</FieldLabel>
                  <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-28" placeholder="Operator notes, approvals, or content caveats." />
                </Field>
              </div>

              <div className="grid gap-4 rounded-[1.35rem] border border-border/60 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Audience</div>
                    <p className="mt-1 text-sm text-muted-foreground">Choose the recipients for this campaign.</p>
                  </div>
                  <Badge variant="outline">{selectedCustomerIds.length} selected</Badge>
                </div>
                <Input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} className="h-11 bg-white" placeholder="Search contacts" />
                <div className="max-h-80 overflow-y-auto rounded-[1.15rem] border border-border/60 bg-white">
                  <div className="grid divide-y divide-border/50">
                    {visibleCustomers.map((customer) => (
                      <label key={customer.id} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900">{customer.fullName}</div>
                          <div className="truncate text-sm text-muted-foreground">{customer.email ?? "No email"}</div>
                        </div>
                        <Checkbox checked={selectedCustomerIds.includes(customer.id)} onCheckedChange={(checked) => toggleCustomer(customer.id, checked === true)} />
                      </label>
                    ))}
                    {visibleCustomers.length === 0 ? (
                      <div className="px-4 py-8 text-sm text-muted-foreground">No matching contacts found.</div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => router.push("/dashboard/campaigns")}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !integrationReady || !name.trim()}>
                  {saving ? "Creating..." : "Create campaign"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
