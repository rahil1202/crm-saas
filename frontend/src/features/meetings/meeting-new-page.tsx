"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

const initialForm = {
  title: "",
  description: "",
  date: "",
  startTime: "09:00",
  endTime: "09:30",
  timezone: "UTC",
  organizerName: "",
  organizerEmail: "",
  locationDetails: "",
  attendeeEmails: "",
};

function zonedDateTimeToUtcIso(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcMs = target;

  for (let index = 0; index < 5; index += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(utcMs));
    const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
    const interpreted = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
    const delta = target - interpreted;
    utcMs += delta;
    if (Math.abs(delta) < 1000) break;
  }

  return new Date(utcMs).toISOString();
}

export default function MeetingNewPage() {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void apiRequest<{ profile: { timezone: string; displayName: string }; items: unknown[] }>("/meetings/types")
      .then((response) => {
        setForm((current) => ({ ...current, timezone: response.profile.timezone, organizerName: response.profile.displayName }));
      })
      .catch(() => undefined);
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const attendees = form.attendeeEmails
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean)
        .map((email) => ({ email }));

      await apiRequest("/meetings", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          startsAt: zonedDateTimeToUtcIso(form.date, form.startTime, form.timezone),
          endsAt: zonedDateTimeToUtcIso(form.date, form.endTime, form.timezone),
          timezone: form.timezone,
          organizerName: form.organizerName,
          organizerEmail: form.organizerEmail,
          locationDetails: form.locationDetails || undefined,
          attendees,
        }),
      });
      toast.success("Meeting created.");
      window.location.href = "/dashboard/meetings";
    } catch (caughtError) {
      setError(caughtError instanceof ApiError ? caughtError.message : "Unable to create meeting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <Link href="/dashboard/meetings" className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}>
        <ArrowLeft className="size-4" />
        Back to meetings
      </Link>
      {error ? <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Create meeting manually</CardTitle>
          <CardDescription>Create an instant meeting and notify attendees by email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <Field><FieldLabel>Title</FieldLabel><Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required /></Field>
            <Field><FieldLabel>Description</FieldLabel><Textarea rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field>
            <div className="grid gap-3 md:grid-cols-3">
              <Field><FieldLabel>Date</FieldLabel><Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} required /></Field>
              <Field><FieldLabel>Start</FieldLabel><Input type="time" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} required /></Field>
              <Field><FieldLabel>End</FieldLabel><Input type="time" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} required /></Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field><FieldLabel>Timezone</FieldLabel><Input value={form.timezone} onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} required /></Field>
              <Field><FieldLabel>Location details</FieldLabel><Input value={form.locationDetails} onChange={(event) => setForm((current) => ({ ...current, locationDetails: event.target.value }))} /></Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field><FieldLabel>Organizer name</FieldLabel><Input value={form.organizerName} onChange={(event) => setForm((current) => ({ ...current, organizerName: event.target.value }))} required /></Field>
              <Field><FieldLabel>Organizer email</FieldLabel><Input type="email" value={form.organizerEmail} onChange={(event) => setForm((current) => ({ ...current, organizerEmail: event.target.value }))} required /></Field>
            </div>
            <Field><FieldLabel>Attendee emails (comma separated)</FieldLabel><Textarea rows={2} value={form.attendeeEmails} onChange={(event) => setForm((current) => ({ ...current, attendeeEmails: event.target.value }))} required /></Field>
            <div><Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create meeting"}</Button></div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
