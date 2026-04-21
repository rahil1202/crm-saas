import { queueEmailMessage } from "@/lib/email-runtime";

function formatMeetingDate(value: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(value);
}

function buildMeetingSummary(input: {
  title: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  locationDetails?: string | null;
  notes?: string | null;
  hostName: string;
}) {
  const starts = formatMeetingDate(input.startsAt, input.timezone);
  const ends = formatMeetingDate(input.endsAt, input.timezone);
  const location = input.locationDetails?.trim() ? input.locationDetails.trim() : "To be shared by host";
  const notesBlock = input.notes?.trim() ? `<p><strong>Notes:</strong> ${input.notes.trim()}</p>` : "";

  return {
    text: [
      `${input.title}`,
      `Host: ${input.hostName}`,
      `Starts: ${starts}`,
      `Ends: ${ends}`,
      `Timezone: ${input.timezone}`,
      `Location: ${location}`,
      input.notes?.trim() ? `Notes: ${input.notes.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
    html: [
      `<p><strong>${input.title}</strong></p>`,
      `<p><strong>Host:</strong> ${input.hostName}</p>`,
      `<p><strong>Starts:</strong> ${starts}</p>`,
      `<p><strong>Ends:</strong> ${ends}</p>`,
      `<p><strong>Timezone:</strong> ${input.timezone}</p>`,
      `<p><strong>Location:</strong> ${location}</p>`,
      notesBlock,
    ].join(""),
  };
}

export async function queueManualMeetingInvites(input: {
  companyId: string;
  createdBy: string;
  attendees: Array<{ email: string; fullName?: string | null }>;
  title: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  locationDetails?: string | null;
  hostName: string;
  hostEmail: string;
  notes?: string | null;
}) {
  const summary = buildMeetingSummary(input);
  await Promise.all(
    input.attendees.map((attendee) =>
      queueEmailMessage({
        companyId: input.companyId,
        createdBy: input.createdBy,
        recipientEmail: attendee.email,
        recipientName: attendee.fullName ?? null,
        subject: `Invite: ${input.title}`,
        htmlContent: `${summary.html}<p><strong>Organizer:</strong> ${input.hostName} (${input.hostEmail})</p>`,
        textContent: `${summary.text}\nOrganizer: ${input.hostName} (${input.hostEmail})`,
        metadata: {
          source: "meetings_manual",
        },
      }),
    ),
  );
}

export async function queuePublicBookingEmails(input: {
  companyId: string;
  createdBy: string;
  host: { name: string; email: string };
  guest: { name: string; email: string };
  title: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  locationDetails?: string | null;
  notes?: string | null;
}) {
  const summary = buildMeetingSummary({
    title: input.title,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone,
    locationDetails: input.locationDetails,
    notes: input.notes,
    hostName: input.host.name,
  });

  await Promise.all([
    queueEmailMessage({
      companyId: input.companyId,
      createdBy: input.createdBy,
      recipientEmail: input.guest.email,
      recipientName: input.guest.name,
      subject: `Confirmed: ${input.title}`,
      htmlContent: `${summary.html}<p>Booked with ${input.host.name}.</p>`,
      textContent: `${summary.text}\nBooked with ${input.host.name}.`,
      metadata: {
        source: "meetings_public_guest",
      },
    }),
    queueEmailMessage({
      companyId: input.companyId,
      createdBy: input.createdBy,
      recipientEmail: input.host.email,
      recipientName: input.host.name,
      subject: `New booking: ${input.title}`,
      htmlContent: `${summary.html}<p>Guest: ${input.guest.name} (${input.guest.email})</p>`,
      textContent: `${summary.text}\nGuest: ${input.guest.name} (${input.guest.email})`,
      metadata: {
        source: "meetings_public_host",
      },
    }),
  ]);
}
