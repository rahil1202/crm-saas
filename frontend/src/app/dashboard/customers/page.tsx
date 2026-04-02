"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
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
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface ListResponse {
  items: Customer[];
}

interface CustomerHistoryResponse {
  customer: Customer;
  lead: LeadHistory | null;
  deals: DealHistory[];
  tasks: TaskHistory[];
  summary: {
    openDeals: number;
    wonDeals: number;
    pendingTasks: number;
    completedTasks: number;
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

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [historyByCustomer, setHistoryByCustomer] = useState<Record<string, CustomerHistoryResponse>>({});
  const [historyLoadingCustomerId, setHistoryLoadingCustomerId] = useState<string | null>(null);

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
        body: JSON.stringify({ fullName: name, email: email || undefined }),
      });
      setName("");
      setEmail("");
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

    setExpandedCustomerId(customerId);

    if (!historyByCustomer[customerId]) {
      await loadCustomerHistory(customerId);
    }
  };

  return (
    <AppShell
      title="Customers"
      description="Customer directory with linked lead, deal, and task history."
    >
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
                </FieldGroup>
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
                        </CardHeader>
                        {isExpanded ? (
                          <CardContent className="grid gap-4">
                            {historyLoadingCustomerId === customer.id ? (
                              <div className="text-sm text-muted-foreground">Loading customer history...</div>
                            ) : null}

                            {history ? (
                              <>
                                <div className="grid gap-3 md:grid-cols-4">
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
                                </div>

                                <Tabs defaultValue="lead" className="grid gap-4">
                                  <TabsList className="w-fit">
                                    <TabsTrigger value="lead">Lead</TabsTrigger>
                                    <TabsTrigger value="deals">Deals</TabsTrigger>
                                    <TabsTrigger value="tasks">Tasks</TabsTrigger>
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
    </AppShell>
  );
}
