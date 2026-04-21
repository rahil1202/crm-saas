"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Download, PencilLine, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CrmDataTable, CrmListPageHeader, CrmListToolbar, CrmModalShell, CrmPaginationBar } from "@/components/crm/crm-list-primitives";
import type { ColumnDefinition } from "@/components/crm/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";

type MeetingScope = "all" | "instant" | "link";
type MeetingStatus = "scheduled" | "cancelled" | "completed" | "no_show";

type MeetingItem = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: MeetingStatus;
  source: "manual" | "public_link" | "internal";
  organizerName: string;
  organizerEmail: string;
  guestCount: number;
  locationDetails: string | null;
  createdAt: string;
  durationMinutes: number;
  utcOffset: string;
};

type MeetingListResponse = {
  items: MeetingItem[];
  total: number;
  limit: number;
  offset: number;
};

type MeetingType = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  locationType: string;
  locationDetails: string | null;
  isActive: boolean;
  isPublic: boolean;
  color: string;
  publicUrl: string;
};

type AvailabilityRow = {
  dayOfWeek: number;
  isEnabled: boolean;
  startTime: string;
  endTime: string;
};

type BreakRow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

type MeetingTypesResponse = {
  profile: {
    timezone: string;
    displayName: string;
    hostSlug: string;
  };
  items: MeetingType[];
};

const rowsPerPageOptions = [10, 20, 50, 100] as const;
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const defaultAvailability: AvailabilityRow[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  isEnabled: dayOfWeek >= 1 && dayOfWeek <= 5,
  startTime: "09:00",
  endTime: "17:00",
}));

const initialManualForm = {
  title: "",
  description: "",
  date: "",
  startTime: "09:00",
  endTime: "09:30",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  organizerName: "",
  organizerEmail: "",
  locationDetails: "",
  attendeeEmails: "",
};

const initialTypeForm = {
  title: "",
  slug: "",
  description: "",
  durationMinutes: "30",
  locationType: "custom",
  locationDetails: "",
  isPublic: true,
  isActive: true,
  color: "#1d4ed8",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
};

function sourceLabel(value: MeetingItem["source"]) {
  if (value === "manual") return "Instant";
  if (value === "public_link") return "Schedule via link";
  return "Internal";
}

export default function MeetingsListPage() {
  const [scope, setScope] = useState<MeetingScope>("all");
  const [search, setSearch] = useState("");
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typesLoading, setTypesLoading] = useState(false);
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[]>([]);
  const [hostTimezone, setHostTimezone] = useState("UTC");

  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState(initialManualForm);
  const [manualSaving, setManualSaving] = useState(false);
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);

  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [typeSaving, setTypeSaving] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [typeForm, setTypeForm] = useState(initialTypeForm);
  const [availabilityRows, setAvailabilityRows] = useState<AvailabilityRow[]>(defaultAvailability);
  const [breakRows, setBreakRows] = useState<BreakRow[]>([]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("scope", scope);
      params.set("limit", String(limit));
      params.set("offset", String((page - 1) * limit));
      if (search.trim()) {
        params.set("q", search.trim());
      }
      const response = await apiRequest<MeetingListResponse>(`/meetings?${params.toString()}`);
      setMeetings(response.items);
      setTotal(response.total);
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to load meetings.");
    } finally {
      setLoading(false);
    }
  }, [limit, page, scope, search]);

  const loadTypes = useCallback(async () => {
    setTypesLoading(true);
    try {
      const response = await apiRequest<MeetingTypesResponse>("/meetings/types");
      setMeetingTypes(response.items);
      setHostTimezone(response.profile.timezone);
      setTypeForm((current) => ({ ...current, timezone: response.profile.timezone }));
      setManualForm((current) => ({ ...current, timezone: response.profile.timezone }));
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to load booking links.");
    } finally {
      setTypesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  useEffect(() => {
    void loadTypes();
  }, [loadTypes]);

  const columns = useMemo<ColumnDefinition<MeetingItem, string, never>[]>(
    () => [
      { key: "title", label: "Event", renderCell: (row) => <div className="font-medium text-slate-900">{row.title}</div> },
      {
        key: "organizer",
        label: "Organizer",
        renderCell: (row) => (
          <div>
            <div className="font-medium text-slate-900">{row.organizerName}</div>
            <div className="text-xs text-muted-foreground">{row.organizerEmail}</div>
          </div>
        ),
      },
      { key: "scheduleType", label: "Schedule Type", renderCell: (row) => <Badge variant="outline">{sourceLabel(row.source)}</Badge> },
      { key: "description", label: "Description", renderCell: (row) => row.description || "-" },
      { key: "guestCount", label: "Guests", renderCell: (row) => String(row.guestCount) },
      { key: "duration", label: "Duration", renderCell: (row) => `${row.durationMinutes} min` },
      { key: "timezone", label: "Time Zone", renderCell: (row) => row.timezone },
      { key: "offset", label: "UTC", renderCell: (row) => row.utcOffset },
      { key: "date", label: "Date", renderCell: (row) => new Date(row.startsAt).toLocaleString() },
    ],
    [],
  );

  function resetTypeEditor() {
    setSelectedTypeId(null);
    setTypeForm({ ...initialTypeForm, timezone: hostTimezone });
    setAvailabilityRows(defaultAvailability);
    setBreakRows([]);
  }

  async function openTypeEditor(typeId: string) {
    const item = meetingTypes.find((type) => type.id === typeId);
    if (!item) return;

    setSelectedTypeId(item.id);
    setTypeForm({
      title: item.title,
      slug: item.slug,
      description: item.description ?? "",
      durationMinutes: String(item.durationMinutes),
      locationType: item.locationType,
      locationDetails: item.locationDetails ?? "",
      isPublic: item.isPublic,
      isActive: item.isActive,
      color: item.color,
      timezone: hostTimezone,
    });

    try {
      const response = await apiRequest<{ rows: AvailabilityRow[]; breaks?: BreakRow[] }>(`/meetings/types/${typeId}/availability`);
      setAvailabilityRows(response.rows);
      setBreakRows(response.breaks ?? []);
    } catch {
      toast.error("Unable to load availability.");
    }
  }

  function formatBreakLabel(row: BreakRow) {
    return `${weekdays[row.dayOfWeek]} ${row.startTime}-${row.endTime}`;
  }

  async function handleDeleteMeetingType(typeId: string) {
    try {
      await apiRequest(`/meetings/types/${typeId}`, { method: "DELETE" });
      if (selectedTypeId === typeId) {
        resetTypeEditor();
      }
      toast.success("Booking link deleted.");
      await loadTypes();
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to delete booking link.");
    }
  }

  async function copyToClipboard(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Booking link copied.");
    } catch {
      toast.error("Unable to copy link.");
    }
  }

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualSaving(true);

    try {
      const startsAt = new Date(`${manualForm.date}T${manualForm.startTime}:00`).toISOString();
      const endsAt = new Date(`${manualForm.date}T${manualForm.endTime}:00`).toISOString();
      const attendees = manualForm.attendeeEmails
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean)
        .map((email) => ({ email }));

      if (editingMeetingId) {
        await apiRequest(`/meetings/${editingMeetingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: manualForm.title,
            description: manualForm.description || undefined,
            startsAt,
            endsAt,
            timezone: manualForm.timezone,
            locationDetails: manualForm.locationDetails || undefined,
          }),
        });
      } else {
        await apiRequest("/meetings", {
          method: "POST",
          body: JSON.stringify({
            title: manualForm.title,
            description: manualForm.description || undefined,
            startsAt,
            endsAt,
            timezone: manualForm.timezone,
            organizerName: manualForm.organizerName,
            organizerEmail: manualForm.organizerEmail,
            locationDetails: manualForm.locationDetails || undefined,
            attendees,
          }),
        });
      }

      toast.success(editingMeetingId ? "Meeting updated." : "Meeting created.");
      setManualModalOpen(false);
      setManualForm({ ...initialManualForm, timezone: hostTimezone });
      setEditingMeetingId(null);
      await loadMeetings();
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to save meeting.");
    } finally {
      setManualSaving(false);
    }
  }

  async function handleSaveMeetingType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTypeSaving(true);

    try {
      const payload = {
        title: typeForm.title,
        slug: typeForm.slug || undefined,
        description: typeForm.description || undefined,
        durationMinutes: Number(typeForm.durationMinutes),
        locationType: typeForm.locationType,
        locationDetails: typeForm.locationDetails || undefined,
        isPublic: typeForm.isPublic,
        isActive: typeForm.isActive,
        color: typeForm.color,
        timezone: typeForm.timezone,
      };

      const response = selectedTypeId
        ? await apiRequest<{ meetingType: { id: string } }>(`/meetings/types/${selectedTypeId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ meetingType: { id: string } }>("/meetings/types", {
            method: "POST",
            body: JSON.stringify(payload),
          });

      const targetId = response.meetingType.id;
      await apiRequest(`/meetings/types/${targetId}/availability`, {
        method: "PUT",
        body: JSON.stringify({ rows: availabilityRows, breaks: breakRows }),
      });

      toast.success(selectedTypeId ? "Booking link updated." : "Booking link created.");
      await loadTypes();
      setSelectedTypeId(targetId);
    } catch (caughtError) {
      toast.error(caughtError instanceof ApiError ? caughtError.message : "Unable to save booking link.");
    } finally {
      setTypeSaving(false);
    }
  }

  function handleExport() {
    const rows = [
      ["Title", "Organizer", "Type", "Date", "Duration", "Timezone", "Guests"].join(","),
      ...meetings.map((meeting) =>
        [meeting.title, meeting.organizerEmail, sourceLabel(meeting.source), new Date(meeting.startsAt).toISOString(), String(meeting.durationMinutes), meeting.timezone, String(meeting.guestCount)]
          .map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`)
          .join(","),
      ),
    ];

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "meetings.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <CrmListPageHeader
        title="Meetings"
        actions={
          <>
            <Button type="button" variant="outline" onClick={handleExport}>
              <Download className="size-4" />
              Export
            </Button>
            <Button
              type="button"
              onClick={() => {
                setManualModalOpen(true);
                setEditingMeetingId(null);
                setManualForm({ ...initialManualForm, timezone: hostTimezone });
              }}
            >
              <Plus className="size-4" />
              Add New
            </Button>
          </>
        }
      />

      <div className="rounded-[1.25rem] border border-border/60 bg-white px-4 py-3 shadow-[0_18px_38px_-30px_rgba(15,23,42,0.18)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Booking Links</div>
            <div className="text-xs text-muted-foreground">{meetingTypes.length} active link type(s)</div>
          </div>
          <Button type="button" variant="outline" onClick={() => { setTypeModalOpen(true); resetTypeEditor(); }}>
            Create New Booking Link
          </Button>
        </div>
        {meetingTypes.length ? (
          <div className="mt-3 grid gap-2">
            {meetingTypes.map((type) => (
              <div key={type.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-slate-50/70 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{type.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{type.publicUrl}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => void copyToClipboard(type.publicUrl)}>
                    <Copy className="size-4" />
                    Copy
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { setTypeModalOpen(true); void openTypeEditor(type.id); }}>
                    Edit
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => void handleDeleteMeetingType(type.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-xs text-muted-foreground">No booking links created yet.</div>
        )}
      </div>

      <div className="rounded-[1.35rem] border border-border/60 bg-white shadow-[0_18px_40px_-34px_rgba(15,23,42,0.18)]">
        <div className="border-b border-border/60 px-4">
          <Tabs value={scope} onValueChange={(value) => { setScope(value as MeetingScope); setPage(1); }}>
            <TabsList variant="line" className="border-b border-border/60 p-0">
              <TabsTrigger value="all" className="rounded-none px-4 py-3 text-sm">All Meetings</TabsTrigger>
              <TabsTrigger value="instant" className="rounded-none px-4 py-3 text-sm">Instant Meetings</TabsTrigger>
              <TabsTrigger value="link" className="rounded-none px-4 py-3 text-sm">Schedule Via Link</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <CrmListToolbar
          searchValue={search}
          searchPlaceholder="Search meeting title"
          onSearchChange={(value) => { setSearch(value); setPage(1); }}
          onOpenFilters={() => {}}
          filterCount={0}
          onOpenColumns={() => {}}
          onRefresh={() => { void loadMeetings(); }}
          extraContent={<Badge variant="outline">Host timezone: {hostTimezone}</Badge>}
        />

        {error ? <div className="border-b border-border/60 px-4 py-3 text-sm text-red-600">{error}</div> : null}

        <CrmDataTable
          columns={columns}
          rows={meetings}
          rowKey={(row) => row.id}
          loading={loading}
          emptyLabel="No meetings found."
          columnVisibility={{ title: true, organizer: true, scheduleType: true, description: true, guestCount: true, duration: true, timezone: true, offset: true, date: true }}
          actionColumn={{
            header: "Actions",
            renderCell: (row) => (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    setEditingMeetingId(row.id);
                    const startsAt = new Date(row.startsAt);
                    const endsAt = new Date(row.endsAt);
                    setManualForm({
                      title: row.title,
                      description: row.description ?? "",
                      date: startsAt.toISOString().slice(0, 10),
                      startTime: startsAt.toISOString().slice(11, 16),
                      endTime: endsAt.toISOString().slice(11, 16),
                      timezone: row.timezone,
                      organizerName: row.organizerName,
                      organizerEmail: row.organizerEmail,
                      locationDetails: row.locationDetails ?? "",
                      attendeeEmails: "",
                    });
                    setManualModalOpen(true);
                  }}
                >
                  <PencilLine className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  onClick={async () => {
                    try {
                      await apiRequest(`/meetings/${row.id}`, { method: "DELETE" });
                      toast.success("Meeting cancelled.");
                      await loadMeetings();
                    } catch {
                      toast.error("Unable to cancel meeting.");
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ),
          }}
        />

        <CrmPaginationBar
          limit={limit}
          onLimitChange={(value) => { setLimit(value); setPage(1); }}
          rowsPerPageOptions={rowsPerPageOptions}
          total={total}
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
        />
      </div>

      <CrmModalShell
        open={manualModalOpen}
        title={editingMeetingId ? "Edit meeting" : "Create meeting manually"}
        description="Create an instant meeting and notify attendees by email."
        onClose={() => { setManualModalOpen(false); setEditingMeetingId(null); }}
      >
        <form className="grid gap-4" onSubmit={handleManualSubmit}>
          <Field>
            <FieldLabel>Title</FieldLabel>
            <Input value={manualForm.title} onChange={(event) => setManualForm((current) => ({ ...current, title: event.target.value }))} required />
          </Field>
          <Field>
            <FieldLabel>Description</FieldLabel>
            <Textarea value={manualForm.description} onChange={(event) => setManualForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
          </Field>
          <div className="grid gap-3 md:grid-cols-3">
            <Field>
              <FieldLabel>Date</FieldLabel>
              <Input type="date" value={manualForm.date} onChange={(event) => setManualForm((current) => ({ ...current, date: event.target.value }))} required />
            </Field>
            <Field>
              <FieldLabel>Start</FieldLabel>
              <Input type="time" value={manualForm.startTime} onChange={(event) => setManualForm((current) => ({ ...current, startTime: event.target.value }))} required />
            </Field>
            <Field>
              <FieldLabel>End</FieldLabel>
              <Input type="time" value={manualForm.endTime} onChange={(event) => setManualForm((current) => ({ ...current, endTime: event.target.value }))} required />
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field>
              <FieldLabel>Timezone</FieldLabel>
              <Input value={manualForm.timezone} onChange={(event) => setManualForm((current) => ({ ...current, timezone: event.target.value }))} required />
            </Field>
            <Field>
              <FieldLabel>Location details</FieldLabel>
              <Input value={manualForm.locationDetails} onChange={(event) => setManualForm((current) => ({ ...current, locationDetails: event.target.value }))} />
            </Field>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field>
              <FieldLabel>Organizer name</FieldLabel>
              <Input value={manualForm.organizerName} onChange={(event) => setManualForm((current) => ({ ...current, organizerName: event.target.value }))} required disabled={Boolean(editingMeetingId)} />
            </Field>
            <Field>
              <FieldLabel>Organizer email</FieldLabel>
              <Input type="email" value={manualForm.organizerEmail} onChange={(event) => setManualForm((current) => ({ ...current, organizerEmail: event.target.value }))} required disabled={Boolean(editingMeetingId)} />
            </Field>
          </div>
          {!editingMeetingId ? (
            <Field>
              <FieldLabel>Attendee emails (comma separated)</FieldLabel>
              <Textarea
                rows={2}
                value={manualForm.attendeeEmails}
                onChange={(event) => setManualForm((current) => ({ ...current, attendeeEmails: event.target.value }))}
                placeholder="alex@example.com, sam@example.com"
                required
              />
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setManualModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={manualSaving}>{manualSaving ? "Saving..." : editingMeetingId ? "Update meeting" : "Create meeting"}</Button>
          </div>
        </form>
      </CrmModalShell>

      <CrmModalShell
        open={typeModalOpen}
        title="Meeting links and availability"
        description="Schedule via link, manage booking links, and configure weekly availability with breaks."
        onClose={() => setTypeModalOpen(false)}
        maxWidthClassName="max-w-6xl"
      >
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border/60 bg-slate-50/60 p-3">
            <Tabs defaultValue="link">
              <TabsList className="w-full">
                <TabsTrigger value="link">Schedule via link</TabsTrigger>
                <TabsTrigger value="manual">Create meeting manually</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Event types</div>
              <Button type="button" size="sm" variant="outline" onClick={resetTypeEditor}>
                Create New Booking Link
              </Button>
            </div>
            <div className="mt-3 space-y-2">
              {typesLoading ? <div className="text-sm text-muted-foreground">Loading...</div> : null}
              {meetingTypes.map((type) => (
                <div key={type.id} className={`rounded-xl border px-3 py-2 ${selectedTypeId === type.id ? "border-primary bg-primary/5" : "border-border/60 bg-white"}`}>
                  <button
                    type="button"
                    onClick={() => { void openTypeEditor(type.id); }}
                    className="w-full text-left text-sm"
                  >
                    <div className="font-medium text-slate-900">{type.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{type.publicUrl}</div>
                  </button>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void copyToClipboard(type.publicUrl)}>
                      <Copy className="size-4" />
                      Copy
                    </Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => void handleDeleteMeetingType(type.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form className="grid gap-4" onSubmit={handleSaveMeetingType}>
            <div className="grid gap-3 md:grid-cols-2">
              <Field>
                <FieldLabel>Title</FieldLabel>
                <Input value={typeForm.title} onChange={(event) => setTypeForm((current) => ({ ...current, title: event.target.value }))} required />
              </Field>
              <Field>
                <FieldLabel>Slug</FieldLabel>
                <Input value={typeForm.slug} onChange={(event) => setTypeForm((current) => ({ ...current, slug: event.target.value }))} placeholder="15-min-intro" />
              </Field>
            </div>
            <Field>
              <FieldLabel>Description</FieldLabel>
              <Textarea rows={3} value={typeForm.description} onChange={(event) => setTypeForm((current) => ({ ...current, description: event.target.value }))} />
            </Field>
            <div className="grid gap-3 md:grid-cols-3">
              <Field>
                <FieldLabel>Duration (minutes)</FieldLabel>
                <Input type="number" min={5} max={480} value={typeForm.durationMinutes} onChange={(event) => setTypeForm((current) => ({ ...current, durationMinutes: event.target.value }))} required />
              </Field>
              <Field>
                <FieldLabel>Location type</FieldLabel>
                <NativeSelect value={typeForm.locationType} onChange={(event) => setTypeForm((current) => ({ ...current, locationType: event.target.value }))}>
                  <option value="custom">Custom</option>
                  <option value="phone">Phone</option>
                  <option value="video_pending">Video (future integration)</option>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Timezone</FieldLabel>
                <Input value={typeForm.timezone} onChange={(event) => setTypeForm((current) => ({ ...current, timezone: event.target.value }))} required />
              </Field>
            </div>
            <Field>
              <FieldLabel>Location details</FieldLabel>
              <Input value={typeForm.locationDetails} onChange={(event) => setTypeForm((current) => ({ ...current, locationDetails: event.target.value }))} placeholder="Call me at +1... or share venue address" />
            </Field>
            <div className="grid gap-2 rounded-xl border border-border/60 p-3">
              <div className="text-sm font-semibold">Weekly availability</div>
              {availabilityRows.map((row, index) => (
                <div key={row.dayOfWeek} className="grid items-center gap-2 sm:grid-cols-[140px_80px_1fr_1fr]">
                  <div className="text-sm">{weekdays[row.dayOfWeek]}</div>
                  <div className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={row.isEnabled}
                      onCheckedChange={(checked) =>
                        setAvailabilityRows((current) =>
                          current.map((item, itemIndex) => (itemIndex === index ? { ...item, isEnabled: checked === true } : item)),
                        )
                      }
                    />
                    {row.isEnabled ? "On" : "Off"}
                  </div>
                  <Input
                    type="time"
                    value={row.startTime}
                    disabled={!row.isEnabled}
                    onChange={(event) =>
                      setAvailabilityRows((current) =>
                        current.map((item, itemIndex) => (itemIndex === index ? { ...item, startTime: event.target.value } : item)),
                      )
                    }
                  />
                  <Input
                    type="time"
                    value={row.endTime}
                    disabled={!row.isEnabled}
                    onChange={(event) =>
                      setAvailabilityRows((current) =>
                        current.map((item, itemIndex) => (itemIndex === index ? { ...item, endTime: event.target.value } : item)),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-2 rounded-xl border border-border/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">Break times</div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setBreakRows((current) => [...current, { dayOfWeek: 1, startTime: "12:00", endTime: "13:00" }])}
                >
                  <Plus className="size-4" />
                  Add Break
                </Button>
              </div>
              {breakRows.length === 0 ? <div className="text-xs text-muted-foreground">No breaks configured.</div> : null}
              {breakRows.map((row, index) => (
                <div key={`${row.dayOfWeek}-${row.startTime}-${index}`} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <NativeSelect
                    value={String(row.dayOfWeek)}
                    onChange={(event) =>
                      setBreakRows((current) =>
                        current.map((item, itemIndex) => (itemIndex === index ? { ...item, dayOfWeek: Number(event.target.value) } : item)),
                      )
                    }
                  >
                    {weekdays.map((weekday, weekdayIndex) => (
                      <option key={weekday} value={weekdayIndex}>
                        {weekday}
                      </option>
                    ))}
                  </NativeSelect>
                  <Input
                    type="time"
                    value={row.startTime}
                    onChange={(event) =>
                      setBreakRows((current) =>
                        current.map((item, itemIndex) => (itemIndex === index ? { ...item, startTime: event.target.value } : item)),
                      )
                    }
                  />
                  <Input
                    type="time"
                    value={row.endTime}
                    onChange={(event) =>
                      setBreakRows((current) =>
                        current.map((item, itemIndex) => (itemIndex === index ? { ...item, endTime: event.target.value } : item)),
                      )
                    }
                  />
                  <Button type="button" size="sm" variant="destructive" onClick={() => setBreakRows((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                    Remove
                  </Button>
                </div>
              ))}
              {breakRows.length ? (
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {breakRows.map((row, index) => (
                    <Badge key={`break-chip-${index}`} variant="outline">{formatBreakLabel(row)}</Badge>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={typeForm.isPublic} onCheckedChange={(checked) => setTypeForm((current) => ({ ...current, isPublic: checked === true }))} />
                Public enabled
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={typeForm.isActive} onCheckedChange={(checked) => setTypeForm((current) => ({ ...current, isActive: checked === true }))} />
                Active
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTypeModalOpen(false)}>Close</Button>
              <Button type="submit" disabled={typeSaving}>{typeSaving ? "Saving..." : "Save event type"}</Button>
            </div>
          </form>
        </div>
      </CrmModalShell>
    </div>
  );
}
