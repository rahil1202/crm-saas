import { and, count, desc, eq, gt, ilike, isNull, lt, ne } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { companies, meetingAttendees, meetingProfiles, meetings, meetingTypeAvailability, meetingTypeBreaks, meetingTypes, profiles } from "@/db/schema";
import { ok } from "@/lib/api";
import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { queueManualMeetingInvites, queuePublicBookingEmails } from "@/modules/meetings/email";
import { meetingIdParamSchema, meetingTypeIdParamSchema, publicMeetingParamsSchema } from "@/modules/meetings/schema";
import type {
  CreateMeetingInput,
  CreateMeetingTypeInput,
  ListHostOptionsQuery,
  ListMeetingsQuery,
  PublicBookInput,
  PublicSlotsQuery,
  ReplaceAvailabilityInput,
  UpdateMeetingInput,
  UpdateMeetingTypeInput,
} from "@/modules/meetings/schema";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function slugify(value: string, fallback: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback
  );
}

function parseHostSlug(value: string) {
  const normalized = value.trim().toLowerCase();
  const separator = normalized.lastIndexOf("-");
  if (separator <= 0 || separator === normalized.length - 1) {
    throw AppError.notFound("Public meeting page not found");
  }
  return {
    usernameSlug: normalized.slice(0, separator),
    publicSuffix: normalized.slice(separator + 1),
  };
}

function getTimezoneParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

function zonedLocalToUtc(input: {
  timezone: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}) {
  const { timezone, year, month, day, hour, minute } = input;
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcMs = target;

  for (let index = 0; index < 5; index += 1) {
    const parts = getTimezoneParts(new Date(utcMs), timezone);
    const interpreted = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const delta = target - interpreted;
    utcMs += delta;
    if (Math.abs(delta) < 1000) {
      break;
    }
  }

  return new Date(utcMs);
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return hours * 60 + minutes;
}

function defaultAvailabilityRows() {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    isEnabled: dayOfWeek >= 1 && dayOfWeek <= 5,
    startTime: "09:00",
    endTime: "17:00",
  }));
}

function normalizeAttendees(attendees: Array<{ email: string; fullName?: string | null }>) {
  const seen = new Set<string>();
  const deduped: Array<{ email: string; fullName: string | null }> = [];
  for (const attendee of attendees) {
    const email = attendee.email.trim().toLowerCase();
    if (!email || seen.has(email)) {
      continue;
    }
    seen.add(email);
    deduped.push({
      email,
      fullName: attendee.fullName?.trim() || null,
    });
  }
  return deduped;
}

function computeUtcOffsetLabel(timezone: string, date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const value = formatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "UTC";
  return value.replace("GMT", "UTC");
}

async function ensureMeetingProfile(input: {
  companyId: string;
  userId: string;
  requestedTimezone?: string;
}) {
  const [existing] = await db
    .select()
    .from(meetingProfiles)
    .where(and(eq(meetingProfiles.companyId, input.companyId), eq(meetingProfiles.userId, input.userId), isNull(meetingProfiles.deletedAt)))
    .limit(1);

  if (existing) {
    if (input.requestedTimezone && input.requestedTimezone !== existing.timezone) {
      const [updated] = await db
        .update(meetingProfiles)
        .set({ timezone: input.requestedTimezone, updatedAt: new Date() })
        .where(eq(meetingProfiles.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  const [host] = await db
    .select({
      fullName: profiles.fullName,
      email: profiles.email,
      companyTimezone: companies.timezone,
    })
    .from(profiles)
    .innerJoin(companies, eq(companies.id, input.companyId))
    .where(eq(profiles.id, input.userId))
    .limit(1);

  if (!host) {
    throw AppError.notFound("Host profile not found");
  }

  const fallbackName = host.fullName?.trim() || host.email;
  const usernameSlug = slugify(fallbackName, "host");
  const publicSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);

  const [created] = await db
    .insert(meetingProfiles)
    .values({
      companyId: input.companyId,
      userId: input.userId,
      usernameSlug,
      publicSuffix,
      displayName: fallbackName,
      timezone: input.requestedTimezone ?? host.companyTimezone ?? "UTC",
    })
    .returning();

  return created;
}

async function getMeetingTypeForHostOrThrow(input: { companyId: string; userId: string; meetingTypeId: string }) {
  const [item] = await db
    .select()
    .from(meetingTypes)
    .where(
      and(
        eq(meetingTypes.companyId, input.companyId),
        eq(meetingTypes.hostUserId, input.userId),
        eq(meetingTypes.id, input.meetingTypeId),
        isNull(meetingTypes.deletedAt),
      ),
    )
    .limit(1);

  if (!item) {
    throw AppError.notFound("Meeting type not found");
  }

  return item;
}

async function ensureNoOverlap(input: {
  companyId: string;
  hostUserId: string;
  startsAt: Date;
  endsAt: Date;
  excludeMeetingId?: string;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
}) {
  if (input.endsAt <= input.startsAt) {
    throw AppError.badRequest("Meeting end time must be after start time");
  }

  const startWithBuffer = new Date(input.startsAt.getTime() - (input.bufferBeforeMinutes ?? 0) * 60_000);
  const endWithBuffer = new Date(input.endsAt.getTime() + (input.bufferAfterMinutes ?? 0) * 60_000);

  const [existing] = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(
      and(
        eq(meetings.companyId, input.companyId),
        eq(meetings.hostUserId, input.hostUserId),
        eq(meetings.status, "scheduled"),
        isNull(meetings.deletedAt),
        lt(meetings.startsAt, endWithBuffer),
        gt(meetings.endsAt, startWithBuffer),
        input.excludeMeetingId ? ne(meetings.id, input.excludeMeetingId) : undefined,
      ),
    )
    .limit(1);

  if (existing) {
    throw AppError.conflict("Selected time overlaps with an existing booking");
  }
}

function buildHostPublicSlug(profile: { usernameSlug: string; publicSuffix: string }) {
  return `${profile.usernameSlug}-${profile.publicSuffix}`;
}

export async function listMeetings(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const query = c.get("validatedQuery") as ListMeetingsQuery;

  const conditions = [
    eq(meetings.companyId, tenant.companyId),
    eq(meetings.hostUserId, user.id),
    isNull(meetings.deletedAt),
  ];

  if (query.q) {
    conditions.push(ilike(meetings.title, `%${query.q}%`));
  }

  if (query.scope === "instant") {
    conditions.push(eq(meetings.source, "manual"));
  }

  if (query.scope === "link") {
    conditions.push(eq(meetings.source, "public_link"));
  }

  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: meetings.id,
        title: meetings.title,
        description: meetings.description,
        startsAt: meetings.startsAt,
        endsAt: meetings.endsAt,
        timezone: meetings.timezone,
        status: meetings.status,
        source: meetings.source,
        organizerName: meetings.organizerName,
        organizerEmail: meetings.organizerEmail,
        guestCount: meetings.guestCount,
        locationDetails: meetings.locationDetails,
        createdAt: meetings.createdAt,
      })
      .from(meetings)
      .where(where)
      .orderBy(desc(meetings.startsAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ count: count() }).from(meetings).where(where),
  ]);

  return ok(c, {
    items: items.map((item) => ({
      ...item,
      durationMinutes: Math.max(1, Math.round((item.endsAt.getTime() - item.startsAt.getTime()) / 60000)),
      utcOffset: computeUtcOffsetLabel(item.timezone, item.startsAt),
    })),
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function createMeeting(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateMeetingInput;

  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);

  const profile = await ensureMeetingProfile({
    companyId: tenant.companyId,
    userId: user.id,
    requestedTimezone: body.timezone,
  });

  await ensureNoOverlap({
    companyId: tenant.companyId,
    hostUserId: user.id,
    startsAt,
    endsAt,
    bufferBeforeMinutes: profile.bufferBeforeMinutes,
    bufferAfterMinutes: profile.bufferAfterMinutes,
  });

  const attendees = normalizeAttendees(body.attendees);

  const [meeting] = await db
    .insert(meetings)
    .values({
      companyId: tenant.companyId,
      hostUserId: user.id,
      source: "manual",
      title: body.title,
      description: body.description ?? null,
      startsAt,
      endsAt,
      timezone: body.timezone,
      organizerName: body.organizerName,
      organizerEmail: body.organizerEmail,
      guestCount: attendees.length,
      locationDetails: body.locationDetails ?? null,
      createdBy: user.id,
    })
    .returning();

  if (attendees.length) {
    await db.insert(meetingAttendees).values(
      attendees.map((attendee) => ({
        companyId: tenant.companyId,
        meetingId: meeting.id,
        email: attendee.email,
        fullName: attendee.fullName,
      })),
    );
  }

  await queueManualMeetingInvites({
    companyId: tenant.companyId,
    createdBy: user.id,
    attendees,
    title: meeting.title,
    startsAt,
    endsAt,
    timezone: body.timezone,
    locationDetails: body.locationDetails,
    hostName: body.organizerName,
    hostEmail: body.organizerEmail,
    notes: body.description,
  });

  return ok(c, { meeting }, 201);
}

export async function updateMeeting(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = meetingIdParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateMeetingInput;

  const [current] = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.id, params.meetingId), eq(meetings.companyId, tenant.companyId), eq(meetings.hostUserId, user.id), isNull(meetings.deletedAt)))
    .limit(1);

  if (!current) {
    throw AppError.notFound("Meeting not found");
  }

  const startsAt = body.startsAt ? new Date(body.startsAt) : current.startsAt;
  const endsAt = body.endsAt ? new Date(body.endsAt) : current.endsAt;
  const timezone = body.timezone ?? current.timezone;

  if (body.startsAt || body.endsAt) {
    const profile = await ensureMeetingProfile({
      companyId: tenant.companyId,
      userId: user.id,
    });
    await ensureNoOverlap({
      companyId: tenant.companyId,
      hostUserId: user.id,
      startsAt,
      endsAt,
      excludeMeetingId: current.id,
      bufferBeforeMinutes: profile.bufferBeforeMinutes,
      bufferAfterMinutes: profile.bufferAfterMinutes,
    });
  }

  const [meeting] = await db
    .update(meetings)
    .set({
      title: body.title ?? current.title,
      description: body.description ?? current.description,
      startsAt,
      endsAt,
      timezone,
      status: body.status ?? current.status,
      locationDetails: body.locationDetails ?? current.locationDetails,
      updatedAt: new Date(),
    })
    .where(eq(meetings.id, current.id))
    .returning();

  return ok(c, { meeting });
}

export async function deleteMeeting(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = meetingIdParamSchema.parse(c.req.param());

  const [meeting] = await db
    .update(meetings)
    .set({
      status: "cancelled",
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(meetings.id, params.meetingId), eq(meetings.companyId, tenant.companyId), eq(meetings.hostUserId, user.id), isNull(meetings.deletedAt)))
    .returning({ id: meetings.id });

  if (!meeting) {
    throw AppError.notFound("Meeting not found");
  }

  return ok(c, { deleted: true });
}

export async function listMeetingTypes(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");

  const profile = await ensureMeetingProfile({ companyId: tenant.companyId, userId: user.id });
  const items = await db
    .select({
      id: meetingTypes.id,
      title: meetingTypes.title,
      slug: meetingTypes.slug,
      description: meetingTypes.description,
      durationMinutes: meetingTypes.durationMinutes,
      locationType: meetingTypes.locationType,
      locationDetails: meetingTypes.locationDetails,
      isActive: meetingTypes.isActive,
      isPublic: meetingTypes.isPublic,
      color: meetingTypes.color,
      createdAt: meetingTypes.createdAt,
      updatedAt: meetingTypes.updatedAt,
    })
    .from(meetingTypes)
    .where(
      and(
        eq(meetingTypes.companyId, tenant.companyId),
        eq(meetingTypes.hostUserId, user.id),
        isNull(meetingTypes.deletedAt),
      ),
    )
    .orderBy(desc(meetingTypes.createdAt));

  const hostSlug = buildHostPublicSlug(profile);
  const base = env.FRONTEND_URL.replace(/\/$/, "");

  return ok(c, {
    profile: {
      id: profile.id,
      timezone: profile.timezone,
      displayName: profile.displayName,
      hostSlug,
    },
    items: items.map((item) => ({
      ...item,
      publicUrl: `${base}/meeting/${item.slug}/${hostSlug}`,
    })),
  });
}

async function ensureMeetingTypeSlug(input: {
  companyId: string;
  hostUserId: string;
  title: string;
  requestedSlug?: string;
  excludeMeetingTypeId?: string;
}) {
  const base = slugify(input.requestedSlug?.trim() || input.title, "meeting");
  let candidate = base;
  let attempt = 1;

  while (true) {
    const [existing] = await db
      .select({ id: meetingTypes.id })
      .from(meetingTypes)
      .where(
        and(
          eq(meetingTypes.companyId, input.companyId),
          eq(meetingTypes.hostUserId, input.hostUserId),
          eq(meetingTypes.slug, candidate),
          isNull(meetingTypes.deletedAt),
          input.excludeMeetingTypeId ? ne(meetingTypes.id, input.excludeMeetingTypeId) : undefined,
        ),
      )
      .limit(1);

    if (!existing) {
      return candidate;
    }

    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
}

export async function createMeetingType(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateMeetingTypeInput;

  const profile = await ensureMeetingProfile({
    companyId: tenant.companyId,
    userId: user.id,
    requestedTimezone: body.timezone,
  });
  const slug = await ensureMeetingTypeSlug({
    companyId: tenant.companyId,
    hostUserId: user.id,
    title: body.title,
    requestedSlug: body.slug,
  });

  const [meetingType] = await db
    .insert(meetingTypes)
    .values({
      companyId: tenant.companyId,
      hostUserId: user.id,
      meetingProfileId: profile.id,
      title: body.title,
      slug,
      description: body.description ?? null,
      durationMinutes: body.durationMinutes,
      locationType: body.locationType,
      locationDetails: body.locationDetails ?? null,
      isActive: body.isActive,
      isPublic: body.isPublic,
      color: body.color,
    })
    .returning();

  await db.insert(meetingTypeAvailability).values(
    defaultAvailabilityRows().map((row) => ({
      companyId: tenant.companyId,
      meetingTypeId: meetingType.id,
      dayOfWeek: row.dayOfWeek,
      isEnabled: row.isEnabled,
      startTime: row.startTime,
      endTime: row.endTime,
    })),
  );

  return ok(c, { meetingType }, 201);
}

export async function updateMeetingType(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = meetingTypeIdParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateMeetingTypeInput;

  const current = await getMeetingTypeForHostOrThrow({
    companyId: tenant.companyId,
    userId: user.id,
    meetingTypeId: params.meetingTypeId,
  });

  const slug = body.slug || body.title
    ? await ensureMeetingTypeSlug({
        companyId: tenant.companyId,
        hostUserId: user.id,
        title: body.title ?? current.title,
        requestedSlug: body.slug,
        excludeMeetingTypeId: current.id,
      })
    : current.slug;

  if (body.timezone) {
    await ensureMeetingProfile({
      companyId: tenant.companyId,
      userId: user.id,
      requestedTimezone: body.timezone,
    });
  }

  const [meetingType] = await db
    .update(meetingTypes)
    .set({
      title: body.title ?? current.title,
      slug,
      description: body.description ?? current.description,
      durationMinutes: body.durationMinutes ?? current.durationMinutes,
      locationType: body.locationType ?? current.locationType,
      locationDetails: body.locationDetails ?? current.locationDetails,
      isActive: body.isActive ?? current.isActive,
      isPublic: body.isPublic ?? current.isPublic,
      color: body.color ?? current.color,
      updatedAt: new Date(),
    })
    .where(eq(meetingTypes.id, current.id))
    .returning();

  return ok(c, { meetingType });
}

export async function deleteMeetingType(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = meetingTypeIdParamSchema.parse(c.req.param());

  const current = await getMeetingTypeForHostOrThrow({
    companyId: tenant.companyId,
    userId: user.id,
    meetingTypeId: params.meetingTypeId,
  });

  await db
    .update(meetingTypes)
    .set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(meetingTypes.id, current.id));

  return ok(c, { deleted: true });
}

export async function getMeetingType(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = meetingTypeIdParamSchema.parse(c.req.param());

  const item = await getMeetingTypeForHostOrThrow({
    companyId: tenant.companyId,
    userId: user.id,
    meetingTypeId: params.meetingTypeId,
  });

  return ok(c, { meetingType: item });
}

export async function getMeetingTypeAvailability(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = meetingTypeIdParamSchema.parse(c.req.param());

  const type = await getMeetingTypeForHostOrThrow({
    companyId: tenant.companyId,
    userId: user.id,
    meetingTypeId: params.meetingTypeId,
  });

  const [rows, breaks] = await Promise.all([
    db
    .select({
      dayOfWeek: meetingTypeAvailability.dayOfWeek,
      isEnabled: meetingTypeAvailability.isEnabled,
      startTime: meetingTypeAvailability.startTime,
      endTime: meetingTypeAvailability.endTime,
    })
    .from(meetingTypeAvailability)
    .where(and(eq(meetingTypeAvailability.companyId, tenant.companyId), eq(meetingTypeAvailability.meetingTypeId, type.id))),
    db
      .select({
        dayOfWeek: meetingTypeBreaks.dayOfWeek,
        startTime: meetingTypeBreaks.startTime,
        endTime: meetingTypeBreaks.endTime,
      })
      .from(meetingTypeBreaks)
      .where(and(eq(meetingTypeBreaks.companyId, tenant.companyId), eq(meetingTypeBreaks.meetingTypeId, type.id))),
  ]);

  const byDay = new Map(rows.map((row) => [row.dayOfWeek, row]));
  const normalized = Array.from({ length: 7 }, (_, dayOfWeek) =>
    byDay.get(dayOfWeek) ?? { dayOfWeek, isEnabled: false, startTime: "09:00", endTime: "17:00" },
  );

  return ok(c, { rows: normalized, breaks });
}

export async function replaceMeetingTypeAvailability(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const params = meetingTypeIdParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as ReplaceAvailabilityInput;

  const type = await getMeetingTypeForHostOrThrow({
    companyId: tenant.companyId,
    userId: user.id,
    meetingTypeId: params.meetingTypeId,
  });

  for (const row of body.rows) {
    if (minutesFromTime(row.endTime) <= minutesFromTime(row.startTime)) {
      throw AppError.badRequest(`${dayNames[row.dayOfWeek]} availability end time must be after start time`);
    }
  }

  for (const breakRow of body.breaks) {
    if (minutesFromTime(breakRow.endTime) <= minutesFromTime(breakRow.startTime)) {
      throw AppError.badRequest(`${dayNames[breakRow.dayOfWeek]} break end time must be after start time`);
    }
  }

  await db.delete(meetingTypeAvailability).where(and(eq(meetingTypeAvailability.companyId, tenant.companyId), eq(meetingTypeAvailability.meetingTypeId, type.id)));
  await db.delete(meetingTypeBreaks).where(and(eq(meetingTypeBreaks.companyId, tenant.companyId), eq(meetingTypeBreaks.meetingTypeId, type.id)));
  await db.insert(meetingTypeAvailability).values(
    body.rows.map((row) => ({
      companyId: tenant.companyId,
      meetingTypeId: type.id,
      dayOfWeek: row.dayOfWeek,
      isEnabled: row.isEnabled,
      startTime: row.startTime,
      endTime: row.endTime,
    })),
  );

  if (body.breaks.length) {
    await db.insert(meetingTypeBreaks).values(
      body.breaks.map((breakRow) => ({
        companyId: tenant.companyId,
        meetingTypeId: type.id,
        dayOfWeek: breakRow.dayOfWeek,
        startTime: breakRow.startTime,
        endTime: breakRow.endTime,
      })),
    );
  }

  return ok(c, { saved: true });
}

export async function listMeetingHostOptions(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const query = c.get("validatedQuery") as ListHostOptionsQuery;

  const [profile] = await db
    .select({ fullName: profiles.fullName, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  const label = profile?.fullName?.trim() || profile?.email || "Current user";
  const email = profile?.email || "";
  const include = query.q
    ? `${label} ${email}`.toLowerCase().includes(query.q.trim().toLowerCase())
    : true;

  return ok(c, {
    items: include
      ? [
          {
            userId: user.id,
            fullName: label,
            email,
            timezone: (await ensureMeetingProfile({ companyId: tenant.companyId, userId: user.id })).timezone,
          },
        ]
      : [],
  });
}

async function getPublicMeetingContext(input: { meetingTypeSlug: string; hostSlug: string }) {
  const host = parseHostSlug(input.hostSlug);

  const [item] = await db
    .select({
      companyId: meetingTypes.companyId,
      meetingTypeId: meetingTypes.id,
      title: meetingTypes.title,
      description: meetingTypes.description,
      durationMinutes: meetingTypes.durationMinutes,
      locationDetails: meetingTypes.locationDetails,
      locationType: meetingTypes.locationType,
      hostUserId: meetingTypes.hostUserId,
      profileId: meetingProfiles.id,
      profileDisplayName: meetingProfiles.displayName,
      profileTimezone: meetingProfiles.timezone,
      profileNoticeMinutes: meetingProfiles.bookingNoticeMinutes,
      profileBufferBeforeMinutes: meetingProfiles.bufferBeforeMinutes,
      profileBufferAfterMinutes: meetingProfiles.bufferAfterMinutes,
      profilePublicEnabled: meetingProfiles.isPublicEnabled,
      hostEmail: profiles.email,
    })
    .from(meetingTypes)
    .innerJoin(
      meetingProfiles,
      and(
        eq(meetingProfiles.id, meetingTypes.meetingProfileId),
        isNull(meetingProfiles.deletedAt),
      ),
    )
    .innerJoin(profiles, eq(profiles.id, meetingTypes.hostUserId))
    .where(
      and(
        eq(meetingTypes.slug, input.meetingTypeSlug),
        eq(meetingProfiles.usernameSlug, host.usernameSlug),
        eq(meetingProfiles.publicSuffix, host.publicSuffix),
        eq(meetingTypes.hostUserId, meetingProfiles.userId),
        eq(meetingTypes.isPublic, true),
        eq(meetingTypes.isActive, true),
        eq(meetingProfiles.isPublicEnabled, true),
        isNull(meetingTypes.deletedAt),
      ),
    )
    .limit(1);

  if (!item) {
    throw AppError.notFound("Public meeting page not found");
  }

  return item;
}

export async function getPublicMeeting(c: Context<AppEnv>) {
  const params = publicMeetingParamsSchema.parse(c.req.param());
  const item = await getPublicMeetingContext({
    meetingTypeSlug: params.meetingTypeSlug,
    hostSlug: params.hostSlug,
  });

  return ok(c, {
    host: {
      displayName: item.profileDisplayName,
      timezone: item.profileTimezone,
      hostSlug: params.hostSlug,
    },
    meetingType: {
      id: item.meetingTypeId,
      slug: params.meetingTypeSlug,
      title: item.title,
      description: item.description,
      durationMinutes: item.durationMinutes,
      locationType: item.locationType,
      locationDetails: item.locationDetails,
    },
  });
}

export async function getPublicMeetingSlots(c: Context<AppEnv>) {
  const params = publicMeetingParamsSchema.parse(c.req.param());
  const query = c.get("validatedQuery") as PublicSlotsQuery;
  const context = await getPublicMeetingContext({
    meetingTypeSlug: params.meetingTypeSlug,
    hostSlug: params.hostSlug,
  });

  const [yearText, monthText, dayText] = query.date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();

  const [availabilityRows, breakRows] = await Promise.all([
    db
    .select({
      startTime: meetingTypeAvailability.startTime,
      endTime: meetingTypeAvailability.endTime,
      isEnabled: meetingTypeAvailability.isEnabled,
    })
    .from(meetingTypeAvailability)
    .where(and(eq(meetingTypeAvailability.meetingTypeId, context.meetingTypeId), eq(meetingTypeAvailability.dayOfWeek, dayOfWeek)))
    .limit(1),
    db
      .select({
        startTime: meetingTypeBreaks.startTime,
        endTime: meetingTypeBreaks.endTime,
      })
      .from(meetingTypeBreaks)
      .where(and(eq(meetingTypeBreaks.meetingTypeId, context.meetingTypeId), eq(meetingTypeBreaks.dayOfWeek, dayOfWeek))),
  ]);

  const availability = availabilityRows[0] ?? null;

  if (!availability || !availability.isEnabled) {
    return ok(c, { slots: [], timezone: context.profileTimezone, date: query.date });
  }

  const startMinutes = minutesFromTime(availability.startTime);
  const endMinutes = minutesFromTime(availability.endTime);
  const breaks = breakRows.map((breakRow) => ({
    start: minutesFromTime(breakRow.startTime),
    end: minutesFromTime(breakRow.endTime),
  }));
  const timezone = context.profileTimezone;
  const now = new Date();
  const noticeCutoff = new Date(now.getTime() + context.profileNoticeMinutes * 60_000);
  const responseTimezone = query.timezone ?? timezone;

  const slots: Array<{ startsAt: string; endsAt: string; label: string }> = [];
  for (let minute = startMinutes; minute + context.durationMinutes <= endMinutes; minute += context.durationMinutes) {
    const slotStartMinutes = minute;
    const slotEndMinutes = minute + context.durationMinutes;
    const overlapsBreak = breaks.some((breakRange) => breakRange.start < slotEndMinutes && breakRange.end > slotStartMinutes);
    if (overlapsBreak) {
      continue;
    }

    const slotStart = zonedLocalToUtc({
      timezone,
      year,
      month,
      day,
      hour: Math.floor(minute / 60),
      minute: minute % 60,
    });
    const slotEnd = new Date(slotStart.getTime() + context.durationMinutes * 60_000);

    if (slotStart <= now || slotStart < noticeCutoff) {
      continue;
    }

    const [conflict] = await db
      .select({ id: meetings.id })
      .from(meetings)
      .where(
        and(
          eq(meetings.companyId, context.companyId),
          eq(meetings.hostUserId, context.hostUserId),
          eq(meetings.status, "scheduled"),
          isNull(meetings.deletedAt),
          lt(meetings.startsAt, new Date(slotEnd.getTime() + context.profileBufferAfterMinutes * 60_000)),
          gt(meetings.endsAt, new Date(slotStart.getTime() - context.profileBufferBeforeMinutes * 60_000)),
        ),
      )
      .limit(1);

    if (conflict) {
      continue;
    }

    slots.push({
      startsAt: slotStart.toISOString(),
      endsAt: slotEnd.toISOString(),
      label: slotStart.toLocaleTimeString("en-US", {
        timeZone: responseTimezone,
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  }

  return ok(c, {
    timezone,
    date: query.date,
    slots,
  });
}

export async function bookPublicMeeting(c: Context<AppEnv>) {
  const params = publicMeetingParamsSchema.parse(c.req.param());
  const body = c.get("validatedBody") as PublicBookInput;
  const context = await getPublicMeetingContext({
    meetingTypeSlug: params.meetingTypeSlug,
    hostSlug: params.hostSlug,
  });

  const slotStart = new Date(body.slotStart);
  const slotEnd = new Date(slotStart.getTime() + context.durationMinutes * 60_000);
  const now = new Date();
  if (slotStart <= now) {
    throw AppError.badRequest("Cannot book a slot in the past");
  }

  await ensureNoOverlap({
    companyId: context.companyId,
    hostUserId: context.hostUserId,
    startsAt: slotStart,
    endsAt: slotEnd,
    bufferBeforeMinutes: context.profileBufferBeforeMinutes,
    bufferAfterMinutes: context.profileBufferAfterMinutes,
  });

  const token = crypto.randomUUID().replace(/-/g, "");
  const [meeting] = await db
    .insert(meetings)
    .values({
      companyId: context.companyId,
      hostUserId: context.hostUserId,
      meetingTypeId: context.meetingTypeId,
      source: "public_link",
      title: context.title,
      description: body.notes ?? context.description,
      startsAt: slotStart,
      endsAt: slotEnd,
      timezone: context.profileTimezone,
      status: "scheduled",
      organizerName: body.guestName,
      organizerEmail: body.guestEmail.trim().toLowerCase(),
      guestCount: 1,
      locationDetails: context.locationDetails,
      bookingPublicToken: token,
      createdBy: context.hostUserId,
    })
    .returning();

  await db.insert(meetingAttendees).values({
    companyId: context.companyId,
    meetingId: meeting.id,
    email: body.guestEmail.trim().toLowerCase(),
    fullName: body.guestName,
  });

  if (context.hostEmail) {
    await queuePublicBookingEmails({
      companyId: context.companyId,
      createdBy: context.hostUserId,
      host: { name: context.profileDisplayName, email: context.hostEmail },
      guest: { name: body.guestName, email: body.guestEmail.trim().toLowerCase() },
      title: context.title,
      startsAt: slotStart,
      endsAt: slotEnd,
      timezone: context.profileTimezone,
      locationDetails: context.locationDetails,
      notes: body.notes,
    });
  }

  return ok(c, {
    booking: {
      id: meeting.id,
      token,
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      timezone: meeting.timezone,
    },
  }, 201);
}
