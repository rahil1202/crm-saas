"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Globe2, MapPin } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getFrontendEnv } from "@/lib/env";

type PublicMeetingResponse = {
  host: {
    displayName: string;
    timezone: string;
    hostSlug: string;
  };
  meetingType: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    durationMinutes: number;
    locationType: string;
    locationDetails: string | null;
  };
};

type SlotsResponse = {
  timezone: string;
  date: string;
  slots: Array<{ startsAt: string; endsAt: string; label: string }>;
};

const today = new Date().toISOString().slice(0, 10);

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
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || "Request failed");
  }
  return payload.data;
}

export default function PublicMeetingBookingPage({
  params,
}: {
  params: Promise<{ meetingType: string; host: string }>;
}) {
  const [meetingTypeSlug, setMeetingTypeSlug] = useState("");
  const [hostSlug, setHostSlug] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meetingData, setMeetingData] = useState<PublicMeetingResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState(today);
  const [slots, setSlots] = useState<SlotsResponse["slots"]>([]);
  const [slotLoading, setSlotLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [bookingName, setBookingName] = useState("");
  const [bookingEmail, setBookingEmail] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void params.then((resolved) => {
      setMeetingTypeSlug(resolved.meetingType);
      setHostSlug(resolved.host);
    });
  }, [params]);

  useEffect(() => {
    if (!meetingTypeSlug || !hostSlug) {
      return;
    }

    let ignore = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchPublicApi<PublicMeetingResponse>(`/public/meetings/${meetingTypeSlug}/${hostSlug}`);
        if (!ignore) {
          setMeetingData(response);
        }
      } catch (caughtError) {
        if (!ignore) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load meeting details.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      ignore = true;
    };
  }, [meetingTypeSlug, hostSlug]);

  useEffect(() => {
    if (!meetingData || !meetingTypeSlug || !hostSlug) {
      return;
    }

    let ignore = false;
    const loadSlots = async () => {
      setSlotLoading(true);
      setSelectedSlot(null);
      try {
        const response = await fetchPublicApi<SlotsResponse>(
          `/public/meetings/${meetingTypeSlug}/${hostSlug}/slots?date=${encodeURIComponent(selectedDate)}&timezone=${encodeURIComponent(meetingData.host.timezone)}`,
        );
        if (!ignore) {
          setSlots(response.slots);
        }
      } catch (caughtError) {
        if (!ignore) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load slots.");
        }
      } finally {
        if (!ignore) {
          setSlotLoading(false);
        }
      }
    };

    void loadSlots();
    return () => {
      ignore = true;
    };
  }, [hostSlug, meetingData, meetingTypeSlug, selectedDate]);

  const selectedSlotLabel = useMemo(
    () => slots.find((slot) => slot.startsAt === selectedSlot)?.label ?? null,
    [selectedSlot, slots],
  );

  async function handleBook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot) {
      setError("Please choose a time slot.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await fetchPublicApi(`/public/meetings/${meetingTypeSlug}/${hostSlug}/book`, {
        method: "POST",
        body: JSON.stringify({
          slotStart: selectedSlot,
          guestName: bookingName,
          guestEmail: bookingEmail,
          notes: bookingNotes || undefined,
        }),
      });
      setSuccess("Your meeting has been booked. Confirmation emails are queued.");
      setBookingNotes("");
      setSelectedSlot(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to complete booking.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-[60vh] px-4 py-12 text-center text-sm text-muted-foreground">Loading booking page...</div>;
  }

  if (!meetingData) {
    return <div className="min-h-[60vh] px-4 py-12 text-center text-sm text-red-600">{error || "Meeting link is not available."}</div>;
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e0f2fe,transparent_45%),radial-gradient(circle_at_bottom_right,#cffafe,transparent_35%),#f8fafc] px-4 py-6 sm:px-8">
      <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-[1.8rem] border border-sky-100 bg-white/95 p-6 shadow-[0_24px_60px_-40px_rgba(8,47,73,0.45)]">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Booking Profile</div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{meetingData.meetingType.title}</h1>
          <p className="mt-2 text-sm text-slate-600">{meetingData.meetingType.description || "Choose a date and time to book this meeting."}</p>

          <div className="mt-6 space-y-3 text-sm text-slate-700">
            <div className="flex items-center gap-2"><Clock3 className="size-4 text-sky-700" /> {meetingData.meetingType.durationMinutes} minutes</div>
            <div className="flex items-center gap-2"><MapPin className="size-4 text-sky-700" /> {meetingData.meetingType.locationDetails || "Location shared by host"}</div>
            <div className="flex items-center gap-2"><Globe2 className="size-4 text-sky-700" /> {meetingData.host.timezone}</div>
            <div className="flex items-center gap-2"><CalendarDays className="size-4 text-sky-700" /> Host: {meetingData.host.displayName}</div>
          </div>
        </section>

        <section className="rounded-[1.8rem] border border-sky-100 bg-white/95 p-6 shadow-[0_24px_60px_-40px_rgba(8,47,73,0.45)]">
          {error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Booking error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {success ? (
            <Alert className="mb-4 border-emerald-200 bg-emerald-50 text-emerald-900">
              <AlertTitle>Booked</AlertTitle>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
            <div>
              <Field>
                <FieldLabel>Date</FieldLabel>
                <Input type="date" min={today} value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              </Field>
              <div className="mt-2 text-xs text-muted-foreground">Timezone: {meetingData.host.timezone}</div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-slate-900">Available slots</div>
              {slotLoading ? <div className="text-sm text-muted-foreground">Loading slots...</div> : null}
              {!slotLoading && slots.length === 0 ? <div className="text-sm text-muted-foreground">No slots available for this date.</div> : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {slots.map((slot) => (
                  <Button
                    key={slot.startsAt}
                    type="button"
                    variant={selectedSlot === slot.startsAt ? "default" : "outline"}
                    onClick={() => setSelectedSlot(slot.startsAt)}
                    className="justify-start"
                  >
                    {slot.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <form className="mt-6 grid gap-4" onSubmit={handleBook}>
            <div className="text-sm font-medium text-slate-900">Booking details {selectedSlotLabel ? `• ${selectedSlotLabel}` : ""}</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field>
                <FieldLabel>Your name</FieldLabel>
                <Input value={bookingName} onChange={(event) => setBookingName(event.target.value)} required />
              </Field>
              <Field>
                <FieldLabel>Your email</FieldLabel>
                <Input type="email" value={bookingEmail} onChange={(event) => setBookingEmail(event.target.value)} required />
              </Field>
            </div>
            <Field>
              <FieldLabel>Notes (optional)</FieldLabel>
              <Textarea rows={3} value={bookingNotes} onChange={(event) => setBookingNotes(event.target.value)} />
            </Field>
            <div>
              <Button type="submit" disabled={submitting || !selectedSlot}>{submitting ? "Booking..." : "Confirm booking"}</Button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
