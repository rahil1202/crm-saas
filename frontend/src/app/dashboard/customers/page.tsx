"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";

interface Customer {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  tags?: string[];
  notes?: string | null;
}

interface CustomerUpdatePayload {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  notes?: string | null;
}

interface LeadHistory {
  id: string;
  title: string;
  status: "new" | "qualified" | "proposal" | "won" | "lost";
  source: string | null;
  score: number;
  createdAt: string;
}

interface DealHistory {
  id: string;
  title: string;
  status: "open" | "won" | "lost";
  pipeline: string;
  stage: string;
  value: number;
  createdAt: string;
}

interface TaskHistory {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done" | "overdue";
  priority: "low" | "medium" | "high";
  dueAt: string | null;
  createdAt: string;
}

interface CampaignHistory {
  id: string;
  name: string;
  channel: string;
  status: "draft" | "scheduled" | "active" | "completed" | "paused";
  scheduledAt: string | null;
  createdAt: string;
}

interface ListResponse {
  items: Customer[];
}

interface CustomerHistoryResponse {
  customer: Customer;
  lead: LeadHistory | null;
  deals: DealHistory[];
  tasks: TaskHistory[];
  campaigns: CampaignHistory[];
  summary: {
    openDeals: number;
    wonDeals: number;
    pendingTasks: number;
    completedTasks: number;
    campaigns: number;
  };
}

const dealTone: Record<DealHistory["status"], "outline" | "secondary" | "default" | "destructive"> = {
  open: "outline",
  won: "default",
  lost: "destructive",
};

const taskTone: Record<TaskHistory["priority"], "outline" | "secondary" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "destructive",
};

const campaignTone: Record<CampaignHistory["status"], "outline" | "secondary" | "default" | "destructive"> = {
  draft: "outline",
  scheduled: "secondary",
  active: "default",
  completed: "default",
  paused: "destructive",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [historyByCustomer, setHistoryByCustomer] = useState<Record<string, CustomerHistoryResponse>>({});
  const [historyLoadingCustomerId, setHistoryLoadingCustomerId] = useState<string | null>(null);
  const [editStateByCustomer, setEditStateByCustomer] = useState<Record<string, { fullName: string; email: string; phone: string; tagsInput: string; notes: string }>>({});
  const [savingCustomerId, setSavingCustomerId] = useState<string | null>(null);

  const parseTags = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }

    try {
      const data = await apiRequest<ListResponse>(`/customers?${params.toString()}`);
      setCustomers(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load customers");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const loadCustomerHistory = useCallback(async (customerId: string) => {
    setHistoryLoadingCustomerId(customerId);

    try {
      const data = await apiRequest<CustomerHistoryResponse>(`/customers/${customerId}/history`);
      setHistoryByCustomer((current) => ({ ...current, [customerId]: data }));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load customer history");
    } finally {
      setHistoryLoadingCustomerId(null);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await apiRequest("/customers", {
        method: "POST",
        body: JSON.stringify({
          fullName: name,
          email: email || undefined,
          phone: phone || undefined,
          tags: parseTags(tagsInput),
          notes: notes || undefined,
        }),
      });
      setName("");
      setEmail("");
      setPhone("");
      setTagsInput("");
      setNotes("");
      await loadCustomers();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to create customer");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCustomerHistory = async (customerId: string) => {
    if (expandedCustomerId === customerId) {
      setExpandedCustomerId(null);
      return;
    }

    const selectedCustomer = customers.find((customer) => customer.id === customerId);
    if (selectedCustomer && !editStateByCustomer[customerId]) {
      initializeEditState(selectedCustomer);
    }

    setExpandedCustomerId(customerId);

    if (!historyByCustomer[customerId]) {
      await loadCustomerHistory(customerId);
    }
  };

  const initializeEditState = (customer: Customer) => {
    setEditStateByCustomer((current) => ({
      ...current,
      [customer.id]: {
        fullName: customer.fullName,
        email: customer.email ?? "",
        phone: customer.phone ?? "",
        tagsInput: (customer.tags ?? []).join(", "),
        notes: customer.notes ?? "",
      },
    }));
  };

  const handleEditFieldChange = (
    customerId: string,
    field: "fullName" | "email" | "phone" | "tagsInput" | "notes",
    value: string,
  ) => {
    setEditStateByCustomer((current) => ({
      ...current,
      [customerId]: {
        ...(current[customerId] ?? { fullName: "", email: "", phone: "", tagsInput: "", notes: "" }),
        [field]: value,
      },
    }));
  };

  const updateCustomerInState = (updatedCustomer: Customer) => {
    setCustomers((current) => current.map((customer) => (customer.id === updatedCustomer.id ? { ...customer, ...updatedCustomer } : customer)));
    setHistoryByCustomer((current) =>
      current[updatedCustomer.id]
        ? {
            ...current,
            [updatedCustomer.id]: {
              ...current[updatedCustomer.id],
              customer: {
                ...current[updatedCustomer.id].customer,
                ...updatedCustomer,
              },
            },
          }
        : current,
    );
  };

  const saveCustomerProfile = async (customerId: string) => {
    const draft = editStateByCustomer[customerId];
    if (!draft) {
      return;
    }

    setSavingCustomerId(customerId);
    setError(null);

    const payload: CustomerUpdatePayload = {
      fullName: draft.fullName,
      email: draft.email.trim() ? draft.email.trim() : null,
      phone: draft.phone.trim() ? draft.phone.trim() : null,
      tags: parseTags(draft.tagsInput),
      notes: draft.notes.trim() ? draft.notes.trim() : null,
    };

    try {
      const updated = await apiRequest<Customer>(`/customers/${customerId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      updateCustomerInState(updated);
      initializeEditState(updated);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update customer");
    } finally {
      setSavingCustomerId(null);
    }
  };

  return (
    <>
      <div className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Create customer</CardTitle>
              <CardDescription>Add a customer directly into the active workspace.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={handleCreate}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="customer-name">Full name</FieldLabel>
                    <Input
                      id="customer-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Riya Mehta"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="customer-email">Email</FieldLabel>
                    <Input
                      id="customer-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="riya@acme.com"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="customer-phone">Phone</FieldLabel>
                    <Input
                      id="customer-phone"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="customer-tags">Tags</FieldLabel>
                    <Input
                      id="customer-tags"
                      value={tagsInput}
                      onChange={(event) => setTagsInput(event.target.value)}
                      placeholder="vip, renewals, north"
                    />
                    <FieldDescription>Comma-separated tags are stored on the customer profile.</FieldDescription>
                  </Field>
                </FieldGroup>
                <Field>
                  <FieldLabel htmlFor="customer-notes">Notes</FieldLabel>
                  <Textarea
                    id="customer-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Account context, preferences, handoff notes..."
                    className="min-h-28"
                  />
                </Field>
                <Button disabled={submitting} type="submit" className="w-fit">
                  {submitting ? "Creating..." : "Create customer"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Customer list</CardTitle>
              <CardDescription>Search the directory and open history per customer.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 rounded-xl border bg-muted/30 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <Field>
                  <FieldLabel htmlFor="customer-search">Search</FieldLabel>
                  <Input
                    id="customer-search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by customer name"
                  />
                </Field>
                <div className="flex items-end">
                  <Button type="button" variant="outline" onClick={() => void loadCustomers()}>
                    Apply filter
                  </Button>
                </div>
              </div>

              {loading ? <div className="text-sm text-muted-foreground">Loading customers...</div> : null}

              {!loading ? (
                <div className="grid gap-3">
                  {customers.map((customer) => {
                    const history = historyByCustomer[customer.id];
                    const isExpanded = expandedCustomerId === customer.id;
                    const editState = editStateByCustomer[customer.id];

                    return (
                      <Card key={customer.id} size="sm">
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between gap-3">
                            <span>{customer.fullName}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => void toggleCustomerHistory(customer.id)}
                            >
                              {isExpanded ? "Hide history" : "View history"}
                            </Button>
                          </CardTitle>
                          <CardDescription>
                            {customer.email ?? "No email"}{customer.phone ? ` • ${customer.phone}` : ""}
                          </CardDescription>
                          <div className="flex flex-wrap gap-2">
                            {(customer.tags ?? []).map((tag) => (
                              <Badge key={tag} variant="secondary">{tag}</Badge>
                            ))}
                            {customer.tags?.length ? null : <Badge variant="outline">No tags</Badge>}
                          </div>
                        </CardHeader>
                        {isExpanded ? (
                          <CardContent className="grid gap-4">
                            {historyLoadingCustomerId === customer.id ? (
                              <div className="text-sm text-muted-foreground">Loading customer history...</div>
                            ) : null}

                            {history ? (
                              <>
                                <div className="grid gap-4 rounded-xl border bg-muted/20 p-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <div className="font-medium">Customer profile</div>
                                      <div className="text-sm text-muted-foreground">Edit notes, contact fields, and customer tags.</div>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={savingCustomerId === customer.id}
                                      onClick={() => void saveCustomerProfile(customer.id)}
                                    >
                                      {savingCustomerId === customer.id ? "Saving..." : "Save profile"}
                                    </Button>
                                  </div>

                                  <FieldGroup>
                                    <Field>
                                      <FieldLabel>Full name</FieldLabel>
                                      <Input
                                        value={editState?.fullName ?? customer.fullName}
                                        onChange={(event) => handleEditFieldChange(customer.id, "fullName", event.target.value)}
                                      />
                                    </Field>
                                    <Field>
                                      <FieldLabel>Email</FieldLabel>
                                      <Input
                                        type="email"
                                        value={editState?.email ?? (customer.email ?? "")}
                                        onChange={(event) => handleEditFieldChange(customer.id, "email", event.target.value)}
                                      />
                                    </Field>
                                    <Field>
                                      <FieldLabel>Phone</FieldLabel>
                                      <Input
                                        value={editState?.phone ?? (customer.phone ?? "")}
                                        onChange={(event) => handleEditFieldChange(customer.id, "phone", event.target.value)}
                                      />
                                    </Field>
                                    <Field>
                                      <FieldLabel>Tags</FieldLabel>
                                      <Input
                                        value={editState?.tagsInput ?? (customer.tags ?? []).join(", ")}
                                        onChange={(event) => handleEditFieldChange(customer.id, "tagsInput", event.target.value)}
                                      />
                                      <FieldDescription>Use comma-separated tags.</FieldDescription>
                                    </Field>
                                  </FieldGroup>

                                  <Field>
                                    <FieldLabel>Notes</FieldLabel>
                                    <Textarea
                                      value={editState?.notes ?? (customer.notes ?? "")}
                                      onChange={(event) => handleEditFieldChange(customer.id, "notes", event.target.value)}
                                      className="min-h-28"
                                    />
                                  </Field>
                                </div>

                                <div className="grid gap-3 md:grid-cols-5">
                                  <div className="rounded-xl border bg-muted/20 p-3">
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Open deals</div>
                                    <div className="mt-1 text-2xl font-semibold">{history.summary.openDeals}</div>
                                  </div>
                                  <div className="rounded-xl border bg-muted/20 p-3">
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Won deals</div>
                                    <div className="mt-1 text-2xl font-semibold">{history.summary.wonDeals}</div>
                                  </div>
                                  <div className="rounded-xl border bg-muted/20 p-3">
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Pending tasks</div>
                                    <div className="mt-1 text-2xl font-semibold">{history.summary.pendingTasks}</div>
                                  </div>
                                  <div className="rounded-xl border bg-muted/20 p-3">
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Completed tasks</div>
                                    <div className="mt-1 text-2xl font-semibold">{history.summary.completedTasks}</div>
                                  </div>
                                  <div className="rounded-xl border bg-muted/20 p-3">
                                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Campaigns</div>
                                    <div className="mt-1 text-2xl font-semibold">{history.summary.campaigns}</div>
                                  </div>
                                </div>

                                <Tabs defaultValue="lead" className="grid gap-4">
                                  <TabsList className="w-fit">
                                    <TabsTrigger value="lead">Lead</TabsTrigger>
                                    <TabsTrigger value="deals">Deals</TabsTrigger>
                                    <TabsTrigger value="tasks">Tasks</TabsTrigger>
                                    <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                                  </TabsList>

                                  <TabsContent value="lead">
                                    {history.lead ? (
                                      <div className="grid gap-2 rounded-xl border p-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="font-medium">{history.lead.title}</div>
                                          <Badge variant="outline">{history.lead.status}</Badge>
                                          {history.lead.source ? <Badge variant="secondary">{history.lead.source}</Badge> : null}
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                          Score {history.lead.score}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                        No linked lead on this customer.
                                      </div>
                                    )}
                                  </TabsContent>

                                  <TabsContent value="deals">
                                    <div className="grid gap-3">
                                      {history.deals.map((deal) => (
                                        <div key={deal.id} className="grid gap-2 rounded-xl border p-4">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <div className="font-medium">{deal.title}</div>
                                            <Badge variant={dealTone[deal.status]}>{deal.status}</Badge>
                                            <Badge variant="outline">{deal.pipeline}</Badge>
                                            <Badge variant="outline">{deal.stage}</Badge>
                                          </div>
                                          <div className="text-sm text-muted-foreground">Value {deal.value}</div>
                                        </div>
                                      ))}
                                      {history.deals.length === 0 ? (
                                        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                          No deal history on this customer.
                                        </div>
                                      ) : null}
                                    </div>
                                  </TabsContent>

                                  <TabsContent value="tasks">
                                    <div className="grid gap-3">
                                      {history.tasks.map((task) => (
                                        <div key={task.id} className="grid gap-2 rounded-xl border p-4">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <div className="font-medium">{task.title}</div>
                                            <Badge variant="outline">{task.status}</Badge>
                                            <Badge variant={taskTone[task.priority]}>{task.priority}</Badge>
                                          </div>
                                          <div className="text-sm text-muted-foreground">
                                            {task.dueAt ? `Due ${new Date(task.dueAt).toLocaleDateString()}` : "No due date"}
                                          </div>
                                        </div>
                                      ))}
                                      {history.tasks.length === 0 ? (
                                        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                          No task history on this customer.
                                        </div>
                                      ) : null}
                                    </div>
                                  </TabsContent>

                                  <TabsContent value="campaigns">
                                    <div className="grid gap-3">
                                      {history.campaigns.map((campaign) => (
                                        <div key={campaign.id} className="grid gap-2 rounded-xl border p-4">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <div className="font-medium">{campaign.name}</div>
                                            <Badge variant={campaignTone[campaign.status]}>{campaign.status}</Badge>
                                            <Badge variant="outline">{campaign.channel}</Badge>
                                          </div>
                                          <div className="text-sm text-muted-foreground">
                                            {campaign.scheduledAt ? `Scheduled ${new Date(campaign.scheduledAt).toLocaleString()}` : "No scheduled time"}
                                          </div>
                                        </div>
                                      ))}
                                      {history.campaigns.length === 0 ? (
                                        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                                          No campaign history on this customer.
                                        </div>
                                      ) : null}
                                    </div>
                                  </TabsContent>
                                </Tabs>

                                <Separator />
                              </>
                            ) : null}
                          </CardContent>
                        ) : null}
                      </Card>
                    );
                  })}

                  {customers.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                      No customers found.
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

