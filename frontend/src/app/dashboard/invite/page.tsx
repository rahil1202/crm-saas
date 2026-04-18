"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Copy, Download, Link2, Mail, MessageCircleMore, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  CrmAppliedFiltersBar,
  CrmColumnSettings,
  CrmConfirmDialog,
  CrmDataTable,
  CrmFilterDrawer,
  CrmListPageHeader,
  CrmListToolbar,
  CrmModalShell,
  CrmPaginationBar,
} from "@/components/crm/crm-list-primitives";
import type { ColumnDefinition, ColumnVisibility } from "@/components/crm/types";
import { downloadCsvFile, toCsvCell } from "@/components/crm/csv-export";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";

type InviteChannel = "email" | "whatsapp" | "link";
type InviteStatus = "pending" | "completed" | "canceled";
type InviteTab = "all" | "pending" | "completed";
type InviteSortKey = "recipient" | "channel" | "status" | "invitedBy" | "createdAt" | "completedAt";
type InviteColumnKey = InviteSortKey;

type CurrentCompanyResponse = {
  company: {
    id: string;
    name: string;
  };
  externalInvites: Array<{
    externalInviteId: string;
    channel: InviteChannel;
    status: InviteStatus;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    message: string | null;
    storeId: string | null;
    storeName: string | null;
    inviterName: string | null;
    inviterEmail: string | null;
    expiresAt: string;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
    inviteUrl: string;
  }>;
};

type InviteRow = {
  id: string;
  recipient: string;
  secondary: string;
  channel: InviteChannel;
  status: InviteStatus;
  displayStatus: InviteStatus | "expired";
  storeName: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  completedAt: string | null;
  inviteUrl: string;
};

type InviteFilters = {
  channel: string;
  status: string;
  store: string;
};

const rowsPerPageOptions = [10, 20, 50] as const;
const defaultColumnVisibility: ColumnVisibility<InviteColumnKey> = {
  recipient: true,
  channel: true,
  status: true,
  invitedBy: true,
  createdAt: true,
  completedAt: true,
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizeRecipients(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function compareValues(left: string | null, right: string | null, direction: "asc" | "desc") {
  const comparison = (left ?? "").localeCompare(right ?? "", undefined, {
    numeric: true,
    sensitivity: "base",
  });
  return direction === "asc" ? comparison : -comparison;
}

function statusBadge(status: InviteStatus) {
  if (status === "completed") {
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">{status}</Badge>;
  }

  if (status === "canceled") {
    return <Badge className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50">{status}</Badge>;
  }

  return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">{status}</Badge>;
}

function getDisplayStatus(status: InviteStatus, expiresAt: string) {
  return status === "pending" && new Date(expiresAt).getTime() <= Date.now() ? "expired" : status;
}

export default function InvitePage() {
  const [snapshot, setSnapshot] = useState<CurrentCompanyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<InviteTab>("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<InviteFilters>({ channel: "", status: "", store: "" });
  const [filterDraft, setFilterDraft] = useState<InviteFilters>({ channel: "", status: "", store: "" });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(10);
  const [sortBy, setSortBy] = useState<InviteSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [columnVisibility, setColumnVisibility] = useState(defaultColumnVisibility);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<InviteChannel>("email");
  const [recipientValue, setRecipientValue] = useState("");
  const [contactName, setContactName] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [rowPendingAction, setRowPendingAction] = useState<string | null>(null);
  const [inviteToDelete, setInviteToDelete] = useState<InviteRow | null>(null);

  const loadSnapshot = useCallback(async () => {
    const companySnapshot = await apiRequest<CurrentCompanyResponse>("/companies/current", { skipCache: true });
    setSnapshot(companySnapshot);
  }, []);

  useEffect(() => {
    let disposed = false;

    const run = async () => {
      try {
        const companySnapshot = await apiRequest<CurrentCompanyResponse>("/companies/current", { skipCache: true });
        if (!disposed) {
          setSnapshot(companySnapshot);
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      disposed = true;
    };
  }, []);

  const inviteRows = useMemo<InviteRow[]>(() => {
    return (snapshot?.externalInvites ?? []).map((invite) => ({
      id: invite.externalInviteId,
      recipient: invite.contactName?.trim() || invite.email || invite.phone || "Shareable invite",
      secondary: invite.email || invite.phone || invite.storeName || "Outside user",
      channel: invite.channel,
      status: invite.status,
      displayStatus: getDisplayStatus(invite.status, invite.expiresAt),
      storeName: invite.storeName || "All branches",
      invitedBy: invite.inviterName || invite.inviterEmail || "Unknown",
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      completedAt: invite.completedAt,
      inviteUrl: invite.inviteUrl,
    }));
  }, [snapshot?.externalInvites]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return inviteRows
      .filter((row) => {
        if (tab === "pending" && row.displayStatus !== "pending") {
          return false;
        }
        if (tab === "completed" && row.displayStatus !== "completed") {
          return false;
        }
        if (filters.channel && row.channel !== filters.channel) {
          return false;
        }
        if (filters.status && row.status !== filters.status) {
          return false;
        }
        if (filters.store && row.storeName !== filters.store) {
          return false;
        }
        if (!query) {
          return true;
        }

        return [
          row.recipient,
          row.secondary,
          row.channel,
          row.displayStatus,
          row.storeName,
          row.invitedBy,
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((left, right) => {
        switch (sortBy) {
          case "recipient":
            return compareValues(left.recipient, right.recipient, sortDir);
          case "channel":
            return compareValues(left.channel, right.channel, sortDir);
          case "status":
            return compareValues(left.status, right.status, sortDir);
          case "invitedBy":
            return compareValues(left.invitedBy, right.invitedBy, sortDir);
          case "completedAt":
            return compareValues(left.completedAt, right.completedAt, sortDir);
          case "createdAt":
          default:
            return compareValues(left.createdAt, right.createdAt, sortDir);
        }
      });
  }, [filters.channel, filters.status, filters.store, inviteRows, search, sortBy, sortDir, tab]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredRows.slice(start, start + limit);
  }, [filteredRows, limit, page]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / limit));
  const pendingCount = inviteRows.filter((row) => row.displayStatus === "pending").length;
  const completedCount = inviteRows.filter((row) => row.displayStatus === "completed").length;

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const appliedFilterChips = useMemo(() => {
    const chips: Array<{ key: keyof InviteFilters; label: string; value: string }> = [];
    if (filters.channel) {
      chips.push({ key: "channel", label: "Channel", value: filters.channel });
    }
    if (filters.status) {
      chips.push({ key: "status", label: "Status", value: filters.status });
    }
    if (filters.store) {
      chips.push({ key: "store", label: "Branch", value: filters.store });
    }
    return chips;
  }, [filters]);

  const columnDefinitions: Array<ColumnDefinition<InviteRow, InviteColumnKey, InviteSortKey>> = [
    {
      key: "recipient",
      label: "Recipient",
      sortable: true,
      sortKey: "recipient",
      renderCell: (row) => (
        <div className="grid gap-0.5">
          <div className="font-medium text-slate-900">{row.recipient}</div>
          <div className="text-xs text-muted-foreground">{row.secondary}</div>
        </div>
      ),
    },
    {
      key: "channel",
      label: "Channel",
      sortable: true,
      sortKey: "channel",
      renderCell: (row) => <span className="capitalize text-slate-700">{row.channel}</span>,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortKey: "status",
      renderCell: (row) =>
        row.displayStatus === "expired" ? (
          <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">expired</Badge>
        ) : (
          statusBadge(row.status)
        ),
    },
    {
      key: "invitedBy",
      label: "Invited By",
      sortable: true,
      sortKey: "invitedBy",
      renderCell: (row) => (
        <div className="grid gap-0.5">
          <div>{row.invitedBy}</div>
          <div className="text-xs text-muted-foreground">{row.storeName}</div>
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "Created",
      sortable: true,
      sortKey: "createdAt",
      renderCell: (row) => (
        <div className="grid gap-0.5">
          <span>{formatDateTime(row.createdAt)}</span>
          <span className="text-xs text-muted-foreground">Valid until {formatDateTime(row.expiresAt)}</span>
        </div>
      ),
    },
    {
      key: "completedAt",
      label: "Completed",
      sortable: true,
      sortKey: "completedAt",
      renderCell: (row) => <span>{formatDateTime(row.completedAt)}</span>,
    },
  ];

  const resetInviteForm = () => {
    setRecipientValue("");
    setContactName("");
    setInviteMessage("");
    setModalTab("email");
  };

  const handleRequestSort = (key: InviteSortKey) => {
    setPage(1);
    if (sortBy === key) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(key);
    setSortDir(key === "createdAt" || key === "completedAt" ? "desc" : "asc");
  };

  const handleExport = () => {
    const header = ["Recipient", "Secondary", "Channel", "Status", "Branch", "Invited By", "Created At", "Expires At", "Completed At", "Invite Url"];
    const lines = filteredRows.map((row) =>
      [
        row.recipient,
        row.secondary,
        row.channel,
        row.displayStatus,
        row.storeName,
        row.invitedBy,
        formatDateTime(row.createdAt),
        formatDateTime(row.expiresAt),
        formatDateTime(row.completedAt),
        row.inviteUrl,
      ]
        .map(toCsvCell)
        .join(","),
    );

    downloadCsvFile([header.join(","), ...lines].join("\n"), `external-invites-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleCreateInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const recipients = modalTab === "link" ? [""] : normalizeRecipients(recipientValue);
    if (modalTab !== "link" && recipients.length === 0) {
      toast.error("Add at least one recipient before sending the invite.");
      return;
    }

    setSubmitting(true);
    try {
      const requests =
        modalTab === "link"
          ? [
              apiRequest<{ inviteUrl: string }>("/companies/external-invites", {
                method: "POST",
                body: JSON.stringify({
                  channel: "link",
                  contactName: contactName || undefined,
                  message: inviteMessage || undefined,
                }),
              }),
            ]
          : recipients.map((recipient) =>
              apiRequest<{ inviteUrl: string }>("/companies/external-invites", {
                method: "POST",
                body: JSON.stringify({
                  channel: modalTab,
                  contactName: contactName || undefined,
                  email: modalTab === "email" ? recipient : undefined,
                  phone: modalTab === "whatsapp" ? recipient : undefined,
                  message: inviteMessage || undefined,
                }),
              }),
            );

      const created = await Promise.all(requests);
      await loadSnapshot();

      if (modalTab === "link" && created[0]?.inviteUrl) {
        await navigator.clipboard.writeText(created[0].inviteUrl);
        toast.success("Invite link created and copied.");
      } else {
        toast.success(`${created.length} invite${created.length > 1 ? "s" : ""} created.`);
      }

      setInviteModalOpen(false);
      resetInviteForm();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Unable to create invite.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = async (row: InviteRow) => {
    await navigator.clipboard.writeText(row.inviteUrl);
    toast.success("Invite link copied.");
  };

  const handleUpdateStatus = async (row: InviteRow, status: InviteStatus) => {
    setRowPendingAction(row.id);
    try {
      await apiRequest(`/companies/external-invites/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadSnapshot();
      toast.success(`Invite marked as ${status}.`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Unable to update invite.");
    } finally {
      setRowPendingAction(null);
    }
  };

  const handleDeleteInvite = async () => {
    if (!inviteToDelete) {
      return;
    }

    setRowPendingAction(inviteToDelete.id);
    try {
      await apiRequest(`/companies/external-invites/${inviteToDelete.id}`, {
        method: "DELETE",
      });
      await loadSnapshot();
      toast.success("Invite removed.");
      setInviteToDelete(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Unable to remove invite.");
    } finally {
      setRowPendingAction(null);
    }
  };

  const filterCount = Object.values(filters).filter(Boolean).length;
  const uniqueStores = Array.from(new Set(inviteRows.map((row) => row.storeName))).sort((left, right) => left.localeCompare(right));

  return (
    <div className="grid gap-5">
      <CrmListPageHeader
        title="Invites"
        actions={
          <>
            <Button type="button" variant="outline" onClick={handleExport}>
              <Download className="size-4" />
              Export
            </Button>
            <Button type="button" onClick={() => setInviteModalOpen(true)}>
              <Plus className="size-4" />
              Add New Invite
            </Button>
          </>
        }
      />

      <div className="overflow-hidden rounded-[1.5rem] border border-border/60 bg-white shadow-[0_18px_40px_-34px_rgba(15,23,42,0.18)]">
        <div className="border-b border-border/60 px-4 pt-2">
          <Tabs value={tab} onValueChange={(value) => { setTab(value as InviteTab); setPage(1); }}>
            <TabsList variant="line" className="border-b-0 p-0">
              <TabsTrigger value="all" className="rounded-none px-4 py-3 text-sm">All Invites ({inviteRows.length})</TabsTrigger>
              <TabsTrigger value="pending" className="rounded-none px-4 py-3 text-sm">Pending ({pendingCount})</TabsTrigger>
              <TabsTrigger value="completed" className="rounded-none px-4 py-3 text-sm">Completed ({completedCount})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <CrmListToolbar
          searchValue={search}
          searchPlaceholder="Search recipient, branch, inviter, or channel"
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          onOpenFilters={() => setFiltersOpen(true)}
          filterCount={filterCount}
          onOpenColumns={() => setColumnsOpen(true)}
          onRefresh={() => void loadSnapshot()}
        />

        <CrmAppliedFiltersBar
          chips={appliedFilterChips}
          onRemove={(key) => {
            setFilters((current) => ({ ...current, [key]: "" }));
            setFilterDraft((current) => ({ ...current, [key]: "" }));
            setPage(1);
          }}
          onClear={() => {
            setFilters({ channel: "", status: "", store: "" });
            setFilterDraft({ channel: "", status: "", store: "" });
            setPage(1);
          }}
          emptyLabel="No active invite filters."
        />

        <CrmDataTable
          columns={columnDefinitions}
          rows={paginatedRows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyLabel="No external invites found."
          columnVisibility={columnVisibility}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={handleRequestSort}
          actionColumn={{
            header: "Actions",
            renderCell: (row) => (
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 rounded-xl px-3" onClick={() => void handleCopyLink(row)}>
                  <Copy className="size-3.5" />
                  Link
                </Button>
                {row.displayStatus === "pending" ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-xl px-3"
                    disabled={rowPendingAction === row.id}
                    onClick={() => void handleUpdateStatus(row, "completed")}
                  >
                    <CheckCircle2 className="size-3.5" />
                    Complete
                  </Button>
                ) : null}
                <Button type="button" variant="destructive" size="sm" className="h-8 rounded-xl px-3" onClick={() => setInviteToDelete(row)}>
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </div>
            ),
          }}
        />

        <CrmPaginationBar
          limit={limit}
          onLimitChange={(value) => {
            setLimit(value);
            setPage(1);
          }}
          rowsPerPageOptions={rowsPerPageOptions}
          total={filteredRows.length}
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          summary={`Showing ${paginatedRows.length} of ${filteredRows.length} invite records`}
        />
      </div>

      <CrmFilterDrawer
        open={filtersOpen}
        title="Filter invites"
        description="Narrow down outside-user invites by channel, status, or branch."
        onClose={() => setFiltersOpen(false)}
        onClear={() => setFilterDraft({ channel: "", status: "", store: "" })}
        applyFormId="invite-filter-form"
      >
        <form
          id="invite-filter-form"
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters(filterDraft);
            setPage(1);
            setFiltersOpen(false);
          }}
        >
          <Field>
            <FieldLabel htmlFor="filter-channel">Channel</FieldLabel>
            <NativeSelect id="filter-channel" value={filterDraft.channel} onChange={(event) => setFilterDraft((current) => ({ ...current, channel: event.target.value }))}>
              <option value="">All channels</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="link">Invite via link</option>
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel htmlFor="filter-status">Status</FieldLabel>
            <NativeSelect id="filter-status" value={filterDraft.status} onChange={(event) => setFilterDraft((current) => ({ ...current, status: event.target.value }))}>
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="canceled">Canceled</option>
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel htmlFor="filter-store">Branch</FieldLabel>
            <NativeSelect id="filter-store" value={filterDraft.store} onChange={(event) => setFilterDraft((current) => ({ ...current, store: event.target.value }))}>
              <option value="">All branches</option>
              {uniqueStores.map((storeName) => (
                <option key={storeName} value={storeName}>
                  {storeName}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </form>
      </CrmFilterDrawer>

      <CrmColumnSettings
        open={columnsOpen}
        description="Choose which invite columns stay visible in the table."
        columns={[
          { key: "recipient", label: "Recipient" },
          { key: "channel", label: "Channel" },
          { key: "status", label: "Status" },
          { key: "invitedBy", label: "Invited By" },
          { key: "createdAt", label: "Created" },
          { key: "completedAt", label: "Completed" },
        ]}
        columnVisibility={columnVisibility}
        onToggleColumn={(key) => setColumnVisibility((current) => ({ ...current, [key]: !current[key] }))}
        onReset={() => setColumnVisibility(defaultColumnVisibility)}
        onClose={() => setColumnsOpen(false)}
      />

      <CrmModalShell
        open={inviteModalOpen}
        onClose={() => {
          setInviteModalOpen(false);
          resetInviteForm();
        }}
        title="Send Invites"
        description="Invite users via direct email, direct WhatsApp number, or a shareable link."
        maxWidthClassName="max-w-5xl"
      >
        <form className="grid gap-5" onSubmit={handleCreateInvite}>
          <Tabs value={modalTab} onValueChange={(value) => setModalTab(value as InviteChannel)}>
            <TabsList variant="line" className="w-full justify-start border-b border-border/60 p-0">
              <TabsTrigger value="email" className="rounded-none px-4 py-3 text-sm">
                <Mail className="mr-2 size-4" />
                Email Invite
              </TabsTrigger>
              <TabsTrigger value="whatsapp" className="rounded-none px-4 py-3 text-sm">
                <MessageCircleMore className="mr-2 size-4" />
                Whatsapp Invite
              </TabsTrigger>
              <TabsTrigger value="link" className="rounded-none px-4 py-3 text-sm">
                <Link2 className="mr-2 size-4" />
                Invite Via Link
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-4 rounded-[1.25rem] border border-border/60 bg-slate-50/40 p-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="invite-contact-name">Contact name</FieldLabel>
                <Input
                  id="invite-contact-name"
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  placeholder="John Doe"
                  className="h-11 rounded-2xl bg-white"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="invite-message">Message</FieldLabel>
                <Input
                  id="invite-message"
                  value={inviteMessage}
                  onChange={(event) => setInviteMessage(event.target.value)}
                  placeholder="Optional message for the invite"
                  className="h-11 rounded-2xl bg-white"
                />
              </Field>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">
              Each invite stays valid for 7 days. Expired links fail server-side validation automatically.
            </div>

            {modalTab === "link" ? (
              <div className="rounded-[1.25rem] border border-dashed border-sky-200 bg-white px-4 py-5 text-sm text-muted-foreground">
                Create a shareable invite link for outside users. The generated link will be copied automatically after creation.
              </div>
            ) : (
              <Field>
                <FieldLabel htmlFor="invite-recipients">
                  {modalTab === "whatsapp" ? "Phone number" : "Email address"}
                </FieldLabel>
                <Textarea
                  id="invite-recipients"
                  value={recipientValue}
                  onChange={(event) => setRecipientValue(event.target.value)}
                  placeholder={
                    modalTab === "whatsapp"
                      ? "+91 9876543210"
                      : "johndoe@gmail.com"
                  }
                  className="min-h-[160px] rounded-[1.25rem] bg-white text-base"
                />
              </Field>
            )}

            <Button type="submit" disabled={submitting} className="h-12 rounded-2xl text-base">
              {submitting ? "Inviting..." : "Invite"}
            </Button>
          </div>
        </form>
      </CrmModalShell>

      <CrmConfirmDialog
        open={Boolean(inviteToDelete)}
        title="Delete invite"
        description="This removes the outside-user invite from the dashboard."
        warning={
          inviteToDelete ? (
            <div className="grid gap-1">
              <div className="font-medium text-rose-900">{inviteToDelete.recipient}</div>
              <div className="text-xs text-rose-700">{inviteToDelete.secondary}</div>
            </div>
          ) : null
        }
        confirmLabel="Delete invite"
        submitting={rowPendingAction === inviteToDelete?.id}
        onConfirm={() => void handleDeleteInvite()}
        onCancel={() => setInviteToDelete(null)}
      />
    </div>
  );
}
