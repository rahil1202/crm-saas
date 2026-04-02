"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";

interface Partner {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: "active" | "inactive";
  createdAt: string;
}

interface PartnerListResponse {
  items: Partner[];
  total: number;
}

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  const loadPartners = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query.trim());
    }
    if (statusFilter) {
      params.set("status", statusFilter);
    }

    try {
      const data = await apiRequest<PartnerListResponse>(`/partners?${params.toString()}`);
      setPartners(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load partners");
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter]);

  useEffect(() => {
    void loadPartners();
  }, [loadPartners]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await apiRequest<Partner>("/partners", {
        method: "POST",
        body: JSON.stringify({
          name,
          contactName: contactName || undefined,
          email: email || undefined,
          phone: phone || undefined,
          notes: notes || undefined,
          status,
        }),
      });

      setName("");
      setContactName("");
      setEmail("");
      setPhone("");
      setNotes("");
      setStatus("active");
      await loadPartners();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to create partner");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Partners"
      description="Manage partner companies that can receive assigned leads and deals."
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        {error ? (
          <Alert variant="destructive" className="xl:col-span-2">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Create partner company</CardTitle>
            <CardDescription>Add a partner organization for shared lead and deal routing.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={handleCreate}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="partner-name">Partner company</FieldLabel>
                  <Input id="partner-name" value={name} onChange={(event) => setName(event.target.value)} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="partner-contact">Contact name</FieldLabel>
                  <Input id="partner-contact" value={contactName} onChange={(event) => setContactName(event.target.value)} />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="partner-email">Email</FieldLabel>
                    <Input id="partner-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="partner-phone">Phone</FieldLabel>
                    <Input id="partner-phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
                  </Field>
                </div>
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  <Select value={status} onValueChange={(value) => setStatus((value as "active" | "inactive") ?? "active")}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">active</SelectItem>
                      <SelectItem value="inactive">inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="partner-notes">Notes</FieldLabel>
                  <Textarea id="partner-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-28" />
                </Field>
              </FieldGroup>
              <Button disabled={submitting} type="submit" className="w-fit">
                {submitting ? "Creating..." : "Create partner"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Partner directory</CardTitle>
            <CardDescription>Filter partners available for assignment in the active company.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 rounded-xl border bg-muted/30 p-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
              <Field>
                <FieldLabel htmlFor="partner-search">Search</FieldLabel>
                <Input id="partner-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search partner companies" />
              </Field>
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Select value={statusFilter || "__all"} onValueChange={(value) => setStatusFilter(!value || value === "__all" ? "" : value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All statuses</SelectItem>
                    <SelectItem value="active">active</SelectItem>
                    <SelectItem value="inactive">inactive</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex items-end">
                <Button type="button" variant="outline" onClick={() => void loadPartners()}>
                  Apply filters
                </Button>
              </div>
            </div>

            {loading ? <div className="text-sm text-muted-foreground">Loading partners...</div> : null}

            {!loading ? (
              <div className="grid gap-3">
                {partners.map((partner) => (
                  <div key={partner.id} className="grid gap-2 rounded-xl border bg-background p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium">{partner.name}</div>
                      <Badge variant={partner.status === "active" ? "secondary" : "outline"}>{partner.status}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {partner.contactName ?? "No contact"}{partner.email ? ` • ${partner.email}` : ""}{partner.phone ? ` • ${partner.phone}` : ""}
                    </div>
                    {partner.notes ? <div className="text-sm text-muted-foreground">{partner.notes}</div> : null}
                  </div>
                ))}
                {partners.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    No partner companies found.
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
