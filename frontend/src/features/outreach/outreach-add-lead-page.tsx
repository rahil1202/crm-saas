"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { OutreachTopNav } from "@/features/outreach/outreach-top-nav";

type Template = { id: string; name: string };
type OutreachList = { id: string; name: string };

type PreviewResponse = {
  subject: string;
  content: string;
};

type Contact = {
  id: string;
  fullName: string;
  email: string | null;
  status: string;
  accountName: string;
};

export function OutreachAddLeadPage() {
  const [activeTab, setActiveTab] = useState<"add" | "import">("add");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [lists, setLists] = useState<OutreachList[]>([]);
  const [listId, setListId] = useState("");
  const [newListName, setNewListName] = useState("");

  const [accountName, setAccountName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [title, setTitle] = useState("");
  const [csvPayload, setCsvPayload] = useState("");

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadContacts = async () => {
    const response = await apiRequest<{ items: Contact[] }>("/outreach/contacts?limit=100&offset=0");
    setContacts(response.items);
  };

  const loadLists = async () => {
    const response = await apiRequest<{ items: OutreachList[] }>("/outreach/lists");
    setLists(response.items);
    setListId((current) => current || response.items[0]?.id || "");
  };

  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const response = await apiRequest<{ items: Array<{ id: string; name: string; type: string }> }>("/templates/list?type=email&limit=100");
        if (disposed) return;
        const nextTemplates = response.items.map((item) => ({ id: item.id, name: item.name }));
        setTemplates(nextTemplates);
        setTemplateId(nextTemplates[0]?.id ?? "");
        await Promise.all([loadContacts(), loadLists()]);
      } catch (caughtError) {
        if (!disposed) setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load outreach data");
      }
    };
    void load();
    return () => {
      disposed = true;
    };
  }, []);

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await apiRequest("/outreach/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: accountName,
          contacts: [
            {
              fullName: contactName,
              email: contactEmail,
              title,
            },
          ],
        }),
      });
      setAccountName("");
      setContactName("");
      setContactEmail("");
      setTitle("");
      await loadContacts();
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
      await loadContacts();
      setSuccess(`Imported ${response.importedAccounts} accounts and ${response.importedContacts} contacts.`);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to import CSV");
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
              contact: {
                fullName: contactName || "Jordan",
                email: contactEmail || "jordan@example.com",
              },
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
        body: JSON.stringify({
          templateId,
          contactIds: selectedContactIds,
        }),
      });
      await loadContacts();
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
        body: JSON.stringify({
          templateId,
          listId,
        }),
      });
      await loadContacts();
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Email Outreach Agent</h1>
        <p className="mt-1 text-sm text-slate-600">AI-driven discovery and automated email campaigns</p>
      </div>

      <OutreachTopNav />

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <Card className="border-border/70">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant={activeTab === "add" ? "default" : "outline"} onClick={() => setActiveTab("add")}>Add via List</Button>
              <Button type="button" size="sm" variant={activeTab === "import" ? "default" : "outline"} onClick={() => setActiveTab("import")}>Import CSV</Button>
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === "add" ? (
              <form className="grid gap-3" onSubmit={handleAdd}>
                <Field>
                  <FieldLabel>Company</FieldLabel>
                  <Input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Example Corp" required />
                </Field>
                <Field>
                  <FieldLabel>Contact Name</FieldLabel>
                  <Input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Jordan Lee" required />
                </Field>
                <Field>
                  <FieldLabel>Email</FieldLabel>
                  <Input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} type="email" placeholder="jordan@company.com" required />
                </Field>
                <Field>
                  <FieldLabel>Title</FieldLabel>
                  <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="VP Sales" />
                </Field>
                <Button type="submit" className="w-fit">Add lead</Button>
              </form>
            ) : (
              <div className="space-y-3">
                <Field>
                  <FieldLabel>Paste CSV</FieldLabel>
                  <Textarea
                    value={csvPayload}
                    onChange={(event) => setCsvPayload(event.target.value)}
                    className="min-h-44"
                    placeholder="company,full_name,email,title\nExample Corp,Jordan Lee,jordan@example.com,VP Sales"
                  />
                </Field>
                <Button type="button" onClick={handleImportCsv}>Import CSV</Button>
              </div>
            )}

            <div className="mt-5 rounded-xl border border-border/60">
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-sm">
                <span className="font-semibold text-slate-800">All Contacts</span>
                <span className="text-slate-500">{selectedLabel}</span>
              </div>
              <div className="max-h-64 overflow-auto">
                {contacts.map((contact) => {
                  const checked = selectedContactIds.includes(contact.id);
                  return (
                    <label key={contact.id} className="flex cursor-pointer items-center justify-between border-b border-border/40 px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium text-slate-900">{contact.fullName}</div>
                        <div className="text-slate-500">{contact.accountName} - {contact.email ?? "No email"}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelectedContactIds((current) =>
                            event.target.checked ? [...current, contact.id] : current.filter((item) => item !== contact.id),
                          );
                        }}
                      />
                    </label>
                  );
                })}
                {contacts.length === 0 ? <div className="px-3 py-6 text-sm text-slate-500">No contacts available yet.</div> : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Template Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field>
              <FieldLabel>Template</FieldLabel>
              <NativeSelect value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="h-10 rounded-xl px-3 text-sm">
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>Send using list</FieldLabel>
              <NativeSelect value={listId} onChange={(event) => setListId(event.target.value)} className="h-10 rounded-xl px-3 text-sm">
                <option value="">Select list</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>{list.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>New list from selected contacts</FieldLabel>
              <div className="flex gap-2">
                <Input value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="Prospects - April" />
                <Button type="button" variant="outline" onClick={handleCreateListFromSelected} disabled={selectedContactIds.length === 0}>
                  Create
                </Button>
              </div>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={handlePreview}>Preview</Button>
              <Button type="button" onClick={handleSend} disabled={sending || selectedContactIds.length === 0 || !templateId}>
                {sending ? "Sending..." : "Send to selected"}
              </Button>
              <Button type="button" variant="outline" onClick={handleSendList} disabled={sending || !listId || !templateId}>
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
