"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Search, UserPlus, Users, Briefcase, Upload, Mail, AlertTriangle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ApiError, apiRequest } from "@/lib/api";
import { OutreachTopNav } from "@/features/outreach/outreach-top-nav";

type Template = { id: string; name: string };
type OutreachList = { id: string; name: string };
type EmailAccount = { id: string; label: string; fromEmail: string; status: string; isDefault: boolean };

type PreviewResponse = {
  subject: string;
  content: string;
};

type OutreachContact = {
  id: string;
  fullName: string;
  email: string | null;
  status: string;
  accountName: string;
};

type CrmContact = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  associatedCompany: string | null;
};

type CrmLead = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  associatedCompany: string | null;
  status: string | null;
};

type ActiveTab = "add" | "contacts" | "leads" | "import";

export function OutreachAddLeadPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("add");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [lists, setLists] = useState<OutreachList[]>([]);
  const [listId, setListId] = useState("");
  const [newListName, setNewListName] = useState("");

  // Add tab state
  const [accountName, setAccountName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [title, setTitle] = useState("");

  // Import CSV state
  const [csvPayload, setCsvPayload] = useState("");

  // CRM contacts/leads state
  const [crmContacts, setCrmContacts] = useState<CrmContact[]>([]);
  const [crmLeads, setCrmLeads] = useState<CrmLead[]>([]);
  const [crmSearch, setCrmSearch] = useState("");
  const [crmLoading, setCrmLoading] = useState(false);

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [outreachContacts, setOutreachContacts] = useState<OutreachContact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadOutreachContacts = async () => {
    const response = await apiRequest<{ items: OutreachContact[] }>("/outreach/contacts?limit=100&offset=0");
    setOutreachContacts(response.items);
  };

  const loadLists = async () => {
    const response = await apiRequest<{ items: OutreachList[] }>("/outreach/lists");
    setLists(response.items);
    setListId((current) => current || response.items[0]?.id || "");
  };

  const loadCrmContacts = async (q = "") => {
    setCrmLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (q.trim()) params.set("q", q.trim());
      const response = await apiRequest<{ items: CrmContact[] }>(`/customers?${params.toString()}`);
      setCrmContacts(response.items);
    } catch {
      // silently fail
    } finally {
      setCrmLoading(false);
    }
  };

  const loadCrmLeads = async (q = "") => {
    setCrmLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (q.trim()) params.set("q", q.trim());
      const response = await apiRequest<{ items: CrmLead[] }>(`/leads?${params.toString()}`);
      setCrmLeads(response.items);
    } catch {
      // silently fail
    } finally {
      setCrmLoading(false);
    }
  };

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      setLoading(true);
      try {
        const [response, accountsResponse] = await Promise.all([
          apiRequest<{ items: Array<{ id: string; name: string; type: string }> }>("/templates/list?type=email&limit=100"),
          apiRequest<{ items: EmailAccount[] }>("/campaigns/email-accounts"),
        ]);
        if (disposed) return;
        const nextTemplates = response.items.map((item) => ({ id: item.id, name: item.name }));
        setTemplates(nextTemplates);
        setEmailAccounts(accountsResponse.items);
        setTemplateId(nextTemplates[0]?.id ?? "");
        await Promise.all([loadOutreachContacts(), loadLists()]);
      } catch (caughtError) {
        if (!disposed) setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load outreach data");
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, []);

  // Load CRM data when switching tabs
  useEffect(() => {
    if (activeTab === "contacts") void loadCrmContacts(crmSearch);
    if (activeTab === "leads") void loadCrmLeads(crmSearch);
  }, [activeTab]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (activeTab === "contacts") void loadCrmContacts(crmSearch);
      if (activeTab === "leads") void loadCrmLeads(crmSearch);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [crmSearch, activeTab]);

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await apiRequest("/outreach/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: accountName,
          contacts: [{ fullName: contactName, email: contactEmail, title }],
        }),
      });
      setAccountName("");
      setContactName("");
      setContactEmail("");
      setTitle("");
      await loadOutreachContacts();
      setSuccess("Lead added successfully.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to add outreach lead");
    }
  };

  const handleImportCsv = async () => {
    if (!csvPayload.trim()) {
      setError("Paste CSV content first.");
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const response = await apiRequest<{ importedAccounts: number; importedContacts: number }>("/outreach/import-csv", {
        method: "POST",
        body: JSON.stringify({ csv: csvPayload }),
      });
      await loadOutreachContacts();
      setSuccess(`Imported ${response.importedAccounts} accounts and ${response.importedContacts} contacts.`);
      setCsvPayload("");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to import CSV");
    }
  };

  const handleAddCrmContactToOutreach = async (contact: CrmContact) => {
    if (!contact.email) {
      setError("This contact has no email address.");
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await apiRequest("/outreach/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: contact.associatedCompany || contact.fullName,
          contacts: [{ fullName: contact.fullName, email: contact.email }],
        }),
      });
      await loadOutreachContacts();
      setSuccess(`${contact.fullName} added to outreach.`);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to add contact to outreach");
    }
  };

  const handleAddCrmLeadToOutreach = async (lead: CrmLead) => {
    if (!lead.email) {
      setError("This lead has no email address.");
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await apiRequest("/outreach/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: lead.associatedCompany || lead.fullName,
          contacts: [{ fullName: lead.fullName, email: lead.email }],
        }),
      });
      await loadOutreachContacts();
      setSuccess(`${lead.fullName} added to outreach.`);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to add lead to outreach");
    }
  };

  const handlePreview = async () => {
    if (!templateId) return;
    setError(null);
    try {
      const response = await apiRequest<PreviewResponse>("/outreach/templates/preview", {
        method: "POST",
        body: JSON.stringify({
          templateId,
          variables: {
            outreach: {
              contact: { fullName: contactName || "Jordan", email: contactEmail || "jordan@example.com" },
            },
          },
        }),
      });
      setPreview(response);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to preview template");
    }
  };

  const handleSend = async () => {
    if (!templateId || selectedContactIds.length === 0) {
      setError("Select a template and at least one contact to send.");
      return;
    }
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      await apiRequest("/outreach/templates/send", {
        method: "POST",
        body: JSON.stringify({ templateId, contactIds: selectedContactIds }),
      });
      await loadOutreachContacts();
      setSelectedContactIds([]);
      setSuccess("Outreach emails queued for selected contacts.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to send outreach emails");
    } finally {
      setSending(false);
    }
  };

  const handleSendList = async () => {
    if (!templateId || !listId) {
      setError("Select template and list first.");
      return;
    }
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      await apiRequest("/outreach/templates/send-list", {
        method: "POST",
        body: JSON.stringify({ templateId, listId }),
      });
      await loadOutreachContacts();
      setSuccess("Outreach emails queued for selected list.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to send list outreach emails");
    } finally {
      setSending(false);
    }
  };

  const handleCreateListFromSelected = async () => {
    if (!newListName.trim() || selectedContactIds.length === 0) {
      setError("Provide list name and select contacts.");
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const created = await apiRequest<{ id: string }>("/outreach/lists", {
        method: "POST",
        body: JSON.stringify({ name: newListName.trim(), entityType: "contact" }),
      });
      await apiRequest(`/outreach/lists/${created.id}/members`, {
        method: "POST",
        body: JSON.stringify({ contactIds: selectedContactIds, accountIds: [] }),
      });
      await loadLists();
      setListId(created.id);
      setNewListName("");
      setSuccess("List created from selected contacts.");
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to create outreach list");
    }
  };

  const selectedCount = selectedContactIds.length;
  const selectedLabel = useMemo(() => `${selectedCount} contact${selectedCount === 1 ? "" : "s"} selected`, [selectedCount]);
  const connectedEmailAccountCount = emailAccounts.filter((account) => account.status === "connected").length;

  const tabs: Array<{ key: ActiveTab; label: string; icon: ReactNode }> = [
    { key: "add", label: "Add Lead", icon: <UserPlus className="size-4" /> },
    { key: "contacts", label: "Contacts", icon: <Users className="size-4" /> },
    { key: "leads", label: "Leads", icon: <Briefcase className="size-4" /> },
    { key: "import", label: "Import CSV", icon: <Upload className="size-4" /> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Email Outreach Agent</h1>
        <p className="mt-1 text-sm text-slate-600">AI-driven discovery and automated email campaigns</p>
      </div>

      <OutreachTopNav />

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}
      {loading ? <div className="rounded-xl border border-border/60 bg-white px-4 py-3 text-sm text-slate-500">Loading templates, contacts, and sending accounts...</div> : null}

      {!loading && connectedEmailAccountCount === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>No email account connected. </span>
            <Link href="/dashboard/integrations/email" className="font-semibold underline">
              Connect email account →
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <Card className="border-border/70">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              {tabs.map((tab) => (
                <Button
                  key={tab.key}
                  type="button"
                  size="sm"
                  variant={activeTab === tab.key ? "default" : "outline"}
                  onClick={() => setActiveTab(tab.key)}
                  className="gap-1.5"
                >
                  {tab.icon}
                  {tab.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {/* ADD TAB */}
            {activeTab === "add" ? (
              <form className="grid gap-3" onSubmit={handleAdd}>
                <Field>
                  <FieldLabel>Company</FieldLabel>
                  <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Example Corp" required />
                </Field>
                <Field>
                  <FieldLabel>Contact Name</FieldLabel>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Jordan Lee" required />
                </Field>
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} type="email" placeholder="jordan@company.com" required />
                </Field>
                <Field>
                  <FieldLabel>Title</FieldLabel>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VP Sales" />
                </Field>
                <Button type="submit" className="w-fit">Add lead</Button>
              </form>
            ) : null}

            {/* CONTACTS TAB - from CRM */}
            {activeTab === "contacts" ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={crmSearch}
                    onChange={(e) => setCrmSearch(e.target.value)}
                    placeholder="Search CRM contacts..."
                    className="pl-9"
                  />
                </div>
                {crmLoading ? <div className="text-sm text-slate-500">Loading contacts...</div> : null}
                <div className="max-h-96 overflow-auto rounded-xl border border-border/60">
                  {crmContacts.map((contact) => (
                    <div key={contact.id} className="flex items-center justify-between border-b border-border/40 px-3 py-2.5 text-sm last:border-0">
                      <div>
                        <div className="font-medium text-slate-900">{contact.fullName}</div>
                        <div className="text-slate-500">
                          {contact.associatedCompany ? `${contact.associatedCompany} · ` : ""}
                          {contact.email ?? <span className="text-rose-500">No email</span>}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!contact.email}
                        onClick={() => void handleAddCrmContactToOutreach(contact)}
                        className="shrink-0"
                      >
                        Add to outreach
                      </Button>
                    </div>
                  ))}
                  {!crmLoading && crmContacts.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-slate-500">
                      No contacts found.{" "}
                      <Link href="/dashboard/contacts" className="text-sky-600 underline">
                        Go to Contacts
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* LEADS TAB - from CRM */}
            {activeTab === "leads" ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={crmSearch}
                    onChange={(e) => setCrmSearch(e.target.value)}
                    placeholder="Search CRM leads..."
                    className="pl-9"
                  />
                </div>
                {crmLoading ? <div className="text-sm text-slate-500">Loading leads...</div> : null}
                <div className="max-h-96 overflow-auto rounded-xl border border-border/60">
                  {crmLeads.map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between border-b border-border/40 px-3 py-2.5 text-sm last:border-0">
                      <div>
                        <div className="font-medium text-slate-900">{lead.fullName}</div>
                        <div className="flex items-center gap-2 text-slate-500">
                          {lead.associatedCompany ? <span>{lead.associatedCompany}</span> : null}
                          {lead.status ? <Badge variant="outline" className="text-xs">{lead.status}</Badge> : null}
                          <span>{lead.email ?? <span className="text-rose-500">No email</span>}</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!lead.email}
                        onClick={() => void handleAddCrmLeadToOutreach(lead)}
                        className="shrink-0"
                      >
                        Add to outreach
                      </Button>
                    </div>
                  ))}
                  {!crmLoading && crmLeads.length === 0 ? (
                    <div className="px-3 py-8 text-center text-sm text-slate-500">
                      No leads found.{" "}
                      <Link href="/dashboard/leads" className="text-sky-600 underline">
                        Go to Leads
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* IMPORT CSV TAB */}
            {activeTab === "import" ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-border/60 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <strong>CSV format:</strong> company, full_name, email, title (header row required)
                </div>
                <Field>
                  <FieldLabel>Paste CSV</FieldLabel>
                  <Textarea
                    value={csvPayload}
                    onChange={(e) => setCsvPayload(e.target.value)}
                    className="min-h-44 font-mono text-xs"
                    placeholder={"company,full_name,email,title\nExample Corp,Jordan Lee,jordan@example.com,VP Sales\nAcme Inc,Alex Smith,alex@acme.com,CEO"}
                  />
                </Field>
                <Button type="button" onClick={handleImportCsv} disabled={!csvPayload.trim()}>
                  Import CSV
                </Button>
              </div>
            ) : null}

            {/* Outreach contacts list (shown on add + import tabs) */}
            {(activeTab === "add" || activeTab === "import") ? (
              <div className="mt-5 rounded-xl border border-border/60">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-800">Outreach Contacts</span>
                  <span className="text-slate-500">{selectedLabel}</span>
                </div>
                <div className="max-h-64 overflow-auto">
                  {outreachContacts.map((contact) => {
                    const checked = selectedContactIds.includes(contact.id);
                    return (
                      <label key={contact.id} className="flex cursor-pointer items-center justify-between border-b border-border/40 px-3 py-2 text-sm">
                        <div>
                          <div className="font-medium text-slate-900">{contact.fullName}</div>
                          <div className="text-slate-500">{contact.accountName} · {contact.email ?? "No email"}</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelectedContactIds((current) =>
                              e.target.checked ? [...current, contact.id] : current.filter((item) => item !== contact.id),
                            );
                          }}
                        />
                      </label>
                    );
                  })}
                  {outreachContacts.length === 0 ? <div className="px-3 py-6 text-sm text-slate-500">No contacts available yet.</div> : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Right panel: template + send */}
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-4" />
              Template & Send
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field>
              <FieldLabel>Template</FieldLabel>
              <NativeSelect value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="h-10 rounded-xl px-3 text-sm">
                {templates.length === 0 ? <option value="">No templates — create one first</option> : null}
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Send using list</FieldLabel>
              <NativeSelect value={listId} onChange={(e) => setListId(e.target.value)} className="h-10 rounded-xl px-3 text-sm">
                <option value="">Select list</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>{list.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>New list from selected contacts</FieldLabel>
              <div className="flex gap-2">
                <Input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="Prospects - April" />
                <Button type="button" variant="outline" onClick={handleCreateListFromSelected} disabled={selectedContactIds.length === 0}>
                  Create
                </Button>
              </div>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handlePreview} disabled={!templateId}>Preview</Button>
              <Button
                type="button"
                onClick={handleSend}
                disabled={sending || selectedContactIds.length === 0 || !templateId || connectedEmailAccountCount === 0}
              >
                {sending ? "Sending..." : "Send to selected"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSendList}
                disabled={sending || !listId || !templateId || connectedEmailAccountCount === 0}
              >
                Send list
              </Button>
            </div>
            <div className="rounded-xl border border-border/60 bg-slate-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{preview?.subject ?? "Preview a template"}</div>
              <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Body</div>
              <Textarea value={preview?.content ?? ""} readOnly className="mt-1 min-h-52 bg-white" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
