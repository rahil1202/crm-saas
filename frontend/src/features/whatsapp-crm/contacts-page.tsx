"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Search, Upload, UserCheck, UserPlus, UserX } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageSection } from "@/components/ui/page-patterns";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest, buildApiUrl } from "@/lib/api";
import { getCompanyCookie, getStoreCookie } from "@/lib/cookies";
import { engagementTone, formatPhone, formatRelativeTime, initialsFromName } from "@/features/whatsapp-crm/format";
import { tagColorClass } from "@/features/whatsapp-crm/inbox/conversation-list";
import type {
  ContactProfile,
  ConversationTag,
  EngagementStatus,
  OptInStatus,
} from "@/features/whatsapp-crm/types";

const ENGAGEMENT_OPTIONS: Array<{ value: EngagementStatus | ""; label: string }> = [
  { value: "", label: "All engagement" },
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
  { value: "dormant", label: "Dormant" },
];

const OPT_IN_OPTIONS: Array<{ value: OptInStatus | ""; label: string }> = [
  { value: "", label: "All opt-in states" },
  { value: "opted_in", label: "Opted in" },
  { value: "opted_out", label: "Opted out" },
  { value: "unknown", label: "Unknown" },
];

export function WhatsappContactsPage() {
  const [contacts, setContacts] = useState<ContactProfile[]>([]);
  const [tags, setTags] = useState<ConversationTag[]>([]);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [engagement, setEngagement] = useState<EngagementStatus | "">("");
  const [optIn, setOptIn] = useState<OptInStatus | "">("");
  const [tagId, setTagId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importBody, setImportBody] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  const [draft, setDraft] = useState({ phoneE164: "", displayName: "", optInStatus: "unknown" as OptInStatus });

  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);

  useEffect(() => {
    const id = setTimeout(() => setSearchDebounced(search.trim()), 200);
    return () => clearTimeout(id);
  }, [search]);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchDebounced) params.set("search", searchDebounced);
      if (engagement) params.set("engagementStatus", engagement);
      if (optIn) params.set("optInStatus", optIn);
      if (tagId) params.set("tagId", tagId);
      params.set("limit", "80");
      const payload = await apiRequest<{ items: ContactProfile[]; nextCursor: string | null }>(
        `/whatsapp/contacts?${params.toString()}`,
        { skipCache: true },
      );
      setContacts(payload.items);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Unable to load WhatsApp contacts.");
    } finally {
      setLoading(false);
    }
  }, [engagement, optIn, searchDebounced, tagId]);

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    (async () => {
      try {
        const payload = await apiRequest<{ items: ConversationTag[] }>("/whatsapp/tags");
        setTags(payload.items);
      } catch {
        /* non-blocking */
      }
    })();
  }, []);

  const downloadCsv = async () => {
    try {
      const res = await fetch(buildApiUrl("/whatsapp/contacts/export"), {
        credentials: "include",
        headers: {
          ...(getCompanyCookie() ? { "x-company-id": getCompanyCookie()! } : {}),
          ...(getStoreCookie() ? { "x-store-id": getStoreCookie()! } : {}),
        },
      });
      if (!res.ok) {
        throw new Error(`Export failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "whatsapp-contacts.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to export contacts.");
    }
  };

  const importContacts = async () => {
    const lines = importBody
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.error("Paste at least one row.");
      return;
    }
    const payload = lines.map((line) => {
      const [phone, name, optInStatus, tagsRaw] = line.split(",").map((cell) => cell.trim());
      return {
        phoneE164: phone,
        displayName: name || undefined,
        optInStatus: (optInStatus === "opted_in" || optInStatus === "opted_out" ? optInStatus : "unknown") as OptInStatus,
        tags: tagsRaw ? tagsRaw.split("|").map((tag) => tag.trim()).filter(Boolean) : undefined,
      };
    });
    try {
      const response = await apiRequest<{ imported: number }>("/whatsapp/contacts/bulk-import", {
        method: "POST",
        body: JSON.stringify({ contacts: payload }),
      });
      toast.success(`Imported ${response.imported} contacts.`);
      setImportOpen(false);
      setImportBody("");
      await loadContacts();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to import contacts.");
    }
  };

  const createContact = async () => {
    if (!draft.phoneE164.trim()) {
      toast.error("Phone number is required.");
      return;
    }
    setCreatingContact(true);
    try {
      await apiRequest("/whatsapp/contacts", {
        method: "POST",
        body: JSON.stringify({
          phoneE164: draft.phoneE164.trim(),
          displayName: draft.displayName.trim() || undefined,
          optInStatus: draft.optInStatus,
        }),
      });
      setDraft({ phoneE164: "", displayName: "", optInStatus: "unknown" });
      toast.success("Contact saved.");
      await loadContacts();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to save contact.");
    } finally {
      setCreatingContact(false);
    }
  };

  const updateOptIn = async (contact: ContactProfile, next: OptInStatus) => {
    try {
      await apiRequest("/whatsapp/contacts", {
        method: "POST",
        body: JSON.stringify({
          phoneE164: contact.phoneE164,
          optInStatus: next,
        }),
      });
      await loadContacts();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to update opt-in status.");
    }
  };

  const toggleTag = async (contact: ContactProfile, tag: ConversationTag) => {
    const nextTagIds = contact.tags.some((t) => t.id === tag.id)
      ? contact.tags.filter((t) => t.id !== tag.id).map((t) => t.id)
      : [...contact.tags.map((t) => t.id), tag.id];
    try {
      await apiRequest(`/whatsapp/contacts/${encodeURIComponent(contact.phoneE164)}/tags`, {
        method: "PUT",
        body: JSON.stringify({ tagIds: nextTagIds }),
      });
      await loadContacts();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to update tags.");
    }
  };

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to load contacts</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <PageSection
        title="Contacts"
        description="WhatsApp contacts synced from conversations plus any you add or import. Manage tags, opt-in, and engagement."
      >
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name or phone"
                  className="pl-9"
                />
              </div>
              <NativeSelect value={engagement} onChange={(event) => setEngagement(event.target.value as EngagementStatus | "")}>
                {ENGAGEMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect value={optIn} onChange={(event) => setOptIn(event.target.value as OptInStatus | "")}>
                {OPT_IN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect value={tagId} onChange={(event) => setTagId(event.target.value)}>
                <option value="">All tags</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </NativeSelect>
              <Button type="button" variant="outline" size="sm" onClick={() => void downloadCsv()}>
                <Download className="mr-1.5 size-3.5" /> Export CSV
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen((v) => !v)}>
                <Upload className="mr-1.5 size-3.5" /> Import
              </Button>
            </div>
            {importOpen ? (
              <div className="mt-3 grid gap-2 rounded-xl border border-border/70 bg-white/70 p-3">
                <p className="text-xs text-muted-foreground">
                  Paste CSV rows as <code>phone,name,opt_in,tag|tag</code>. Missing cells are ignored.
                </p>
                <Textarea
                  value={importBody}
                  onChange={(event) => setImportBody(event.target.value)}
                  placeholder="+15551234567,John,opted_in,VIP|Lead"
                  rows={4}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setImportOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={() => void importContacts()}>
                    Import
                  </Button>
                </div>
              </div>
            ) : null}
          </CardHeader>
        </Card>
      </PageSection>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle className="text-base">
              {contacts.length} contact{contacts.length === 1 ? "" : "s"}
            </CardTitle>
            <CardDescription>Click a contact row to edit opt-in or assign tags.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-white/40 p-4 text-sm text-muted-foreground">
                Loading contacts…
              </div>
            ) : contacts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-white/40 p-4 text-sm text-muted-foreground">
                No contacts match these filters.
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {contacts.map((contact) => (
                  <li key={contact.id} className="grid gap-2 py-3 sm:grid-cols-[auto_1fr_auto] sm:items-start">
                    <Avatar className="size-10">
                      <AvatarFallback className="bg-emerald-100 text-emerald-800">
                        {initialsFromName(contact.displayName ?? contact.phoneE164)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold text-slate-900">
                          {contact.displayName ?? formatPhone(contact.phoneE164)}
                        </span>
                        <Badge variant="outline" className={engagementTone(contact.engagementStatus).className}>
                          {engagementTone(contact.engagementStatus).label}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatPhone(contact.phoneE164)}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {contact.tags.map((tag) => (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => {
                              const full = tagsById.get(tag.id);
                              if (full) void toggleTag(contact, full);
                            }}
                            className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${tagColorClass(tag.color)}`}
                          >
                            {tag.name}
                          </button>
                        ))}
                        {tags
                          .filter((tag) => !contact.tags.some((ct) => ct.id === tag.id))
                          .slice(0, 4)
                          .map((tag) => (
                            <button
                              key={tag.id}
                              type="button"
                              onClick={() => void toggleTag(contact, tag)}
                              className="rounded-full border border-border/60 bg-white px-2 py-0.5 text-[0.62rem] font-semibold text-slate-500 hover:bg-slate-50"
                            >
                              + {tag.name}
                            </button>
                          ))}
                      </div>
                      <div className="mt-1 flex gap-3 text-[0.68rem] text-muted-foreground">
                        <span>Last inbound {formatRelativeTime(contact.lastInboundAt)}</span>
                        <span>Last outbound {formatRelativeTime(contact.lastOutboundAt)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                      <NativeSelect
                        value={contact.optInStatus}
                        onChange={(event) => void updateOptIn(contact, event.target.value as OptInStatus)}
                        className="h-8 text-xs"
                      >
                        <option value="unknown">Unknown</option>
                        <option value="opted_in">Opted in</option>
                        <option value="opted_out">Opted out</option>
                      </NativeSelect>
                      <div className="flex items-center gap-1 text-[0.62rem] text-muted-foreground">
                        {contact.optInStatus === "opted_in" ? (
                          <UserCheck className="size-3 text-emerald-600" />
                        ) : contact.optInStatus === "opted_out" ? (
                          <UserX className="size-3 text-rose-600" />
                        ) : null}
                        Score {contact.engagementScore}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle className="text-base">
              <UserPlus className="mr-1.5 inline size-4" /> Add contact
            </CardTitle>
            <CardDescription>Create a contact directly. You can also import in bulk above.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Field>
              <FieldLabel htmlFor="contact-phone">Phone (E.164)</FieldLabel>
              <Input
                id="contact-phone"
                value={draft.phoneE164}
                onChange={(event) => setDraft({ ...draft, phoneE164: event.target.value })}
                placeholder="+15551234567"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="contact-name">Display name</FieldLabel>
              <Input
                id="contact-name"
                value={draft.displayName}
                onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
                placeholder="Optional"
              />
            </Field>
            <Field>
              <FieldLabel>Opt-in status</FieldLabel>
              <NativeSelect
                value={draft.optInStatus}
                onChange={(event) => setDraft({ ...draft, optInStatus: event.target.value as OptInStatus })}
              >
                <option value="unknown">Unknown</option>
                <option value="opted_in">Opted in</option>
                <option value="opted_out">Opted out</option>
              </NativeSelect>
              <FieldDescription>Only opted-in contacts may receive marketing templates.</FieldDescription>
            </Field>
            <div className="flex justify-end">
              <Button type="button" onClick={() => void createContact()} disabled={creatingContact}>
                {creatingContact ? "Saving…" : "Save contact"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
