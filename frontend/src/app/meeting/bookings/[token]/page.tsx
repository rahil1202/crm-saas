"use client";

import { FormEvent, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getFrontendEnv } from "@/lib/env";

type BookingDetail = {
  booking: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    status: string;
    locationType: string;
    locationDetails: string | null;
    guestName: string;
    guestEmail: string;
    hostDisplayName: string;
    meetingTypeSlug: string;
    hostSlug: string;
    token: string;
  };
};

type SlotsResponse = {
  slots: Array<{ startsAt: string; endsAt: string; label: string }>;
};

async function fetchPublicApi<T>(path: string, init?: RequestInit): Promise<T> {
  const apiUrl = getFrontendEnv().apiUrl.replace(/\/$/, "");
  const response = await fetch(`${apiUrl}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as { success: boolean; data?: T; error?: { message?: string } };
  if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message || "Request failed");
  return payload.data;
}

type RescheduleResponse = {
  booking: {
    id: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    token: string;
  };
};

export default function PublicBookingReschedulePage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [detail, setDetail] = useState<BookingDetail["booking"] | null>(null);
  const [slots, setSlots] = useState<SlotsResponse["slots"]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void params.then((resolved) => setToken(resolved.token)); }, [params]);

  useEffect(() => {
    if (!token) return;
    void fetchPublicApi<BookingDetail>(`/public/meetings/bookings/${token}`).then((res) => setDetail(res.booking)).catch((err) => setError(err instanceof Error ? err.message : "Unable to load booking"));
  }, [token]);

  useEffect(() => {
    if (!detail) return;
    const viewerTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    void fetchPublicApi<SlotsResponse>(`/public/meetings/${detail.meetingTypeSlug}/${detail.hostSlug}/slots?date=${encodeURIComponent(selectedDate)}&timezone=${encodeURIComponent(viewerTimezone)}`)
      .then((res) => setSlots(res.slots))
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load slots"));
  }, [detail, selectedDate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot || !detail) return;
    try {
      const response = await fetchPublicApi<RescheduleResponse>(`/public/meetings/bookings/${detail.token}/reschedule`, { method: "POST", body: JSON.stringify({ slotStart: selectedSlot }) });
      setDetail((current) => (current ? { ...current, startsAt: response.booking.startsAt, endsAt: response.booking.endsAt } : current));
      setSelectedSlot(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reschedule");
    }
  }

  if (!detail) return <div className="min-h-[50vh] p-8 text-sm text-muted-foreground">Loading booking...</div>;

  return (
    <main className="mx-auto grid max-w-3xl gap-4 p-6">
      {error ? <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="rounded-xl border p-4">
        <h1 className="text-xl font-semibold">Reschedule booking</h1>
        <div className="mt-2 text-sm text-slate-700">{detail.title} with {detail.hostDisplayName}</div>
        <div className="text-sm text-slate-700">Current: {new Date(detail.startsAt).toLocaleString()}</div>
      </div>
      <form className="grid gap-3 rounded-xl border p-4" onSubmit={handleSubmit}>
        <Field><FieldLabel>Date</FieldLabel><Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></Field>
        <div className="grid gap-2 sm:grid-cols-2">
          {slots.map((slot) => <Button key={slot.startsAt} type="button" variant={selectedSlot === slot.startsAt ? "default" : "outline"} onClick={() => setSelectedSlot(slot.startsAt)}>{slot.label}</Button>)}
        </div>
        <div><Button type="submit" disabled={!selectedSlot}>Reschedule</Button></div>
      </form>
    </main>
  );
}
