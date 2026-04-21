import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const listMeetingsSchema = z.object({
  q: z.string().trim().optional(),
  scope: z.enum(["all", "instant", "link"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createMeetingSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(4000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string().trim().min(2).max(80).default("UTC"),
  organizerName: z.string().trim().min(1).max(180),
  organizerEmail: z.string().trim().email(),
  locationDetails: z.string().trim().max(400).optional(),
  attendees: z
    .array(
      z.object({
        email: z.string().trim().email(),
        fullName: z.string().trim().max(180).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const updateMeetingSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(4000).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  timezone: z.string().trim().min(2).max(80).optional(),
  status: z.enum(["scheduled", "cancelled", "completed", "no_show"]).optional(),
  locationDetails: z.string().trim().max(400).optional(),
});

export const meetingIdParamSchema = z.object({
  meetingId: z.string().uuid(),
});

export const meetingTypeIdParamSchema = z.object({
  meetingTypeId: z.string().uuid(),
});

export const createMeetingTypeSchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  durationMinutes: z.coerce.number().int().min(5).max(480).default(30),
  locationType: z.string().trim().min(2).max(40).default("custom"),
  locationDetails: z.string().trim().max(400).optional(),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
  color: z.string().trim().max(24).default("#1d4ed8"),
  timezone: z.string().trim().min(2).max(80).optional(),
});

export const updateMeetingTypeSchema = createMeetingTypeSchema.partial();

export const availabilityRowSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  isEnabled: z.boolean().default(false),
  startTime: z.string().trim().regex(timeRegex).default("09:00"),
  endTime: z.string().trim().regex(timeRegex).default("17:00"),
});

export const replaceAvailabilitySchema = z.object({
  rows: z.array(availabilityRowSchema).length(7),
  breaks: z
    .array(
      z.object({
        dayOfWeek: z.coerce.number().int().min(0).max(6),
        startTime: z.string().trim().regex(timeRegex),
        endTime: z.string().trim().regex(timeRegex),
      }),
    )
    .max(100)
    .default([]),
});

export const listHostOptionsSchema = z.object({
  q: z.string().trim().max(120).optional(),
});

export const publicMeetingParamsSchema = z.object({
  meetingTypeSlug: z.string().trim().min(1).max(160),
  hostSlug: z.string().trim().min(1).max(200),
});

export const publicSlotsQuerySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().trim().min(2).max(80).optional(),
});

export const publicBookSchema = z.object({
  slotStart: z.string().datetime(),
  guestName: z.string().trim().min(1).max(180),
  guestEmail: z.string().trim().email(),
  notes: z.string().trim().max(2000).optional(),
});

export type ListMeetingsQuery = z.infer<typeof listMeetingsSchema>;
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;
export type CreateMeetingTypeInput = z.infer<typeof createMeetingTypeSchema>;
export type UpdateMeetingTypeInput = z.infer<typeof updateMeetingTypeSchema>;
export type ReplaceAvailabilityInput = z.infer<typeof replaceAvailabilitySchema>;
export type ListHostOptionsQuery = z.infer<typeof listHostOptionsSchema>;
export type PublicSlotsQuery = z.infer<typeof publicSlotsQuerySchema>;
export type PublicBookInput = z.infer<typeof publicBookSchema>;
