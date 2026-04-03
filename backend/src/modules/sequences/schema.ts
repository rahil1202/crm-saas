import { z } from "zod";

export const sequenceSchema = z.object({
  name: z.string().trim().min(1).max(180),
  status: z.enum(["draft", "active", "paused", "archived"]).default("draft"),
  description: z.string().trim().max(4000).optional(),
  triggerConfig: z.record(z.string(), z.unknown()).default({}),
  steps: z
    .array(
      z.object({
        stepIndex: z.number().int().min(0),
        channel: z.enum(["email", "whatsapp"]),
        stepType: z.string().trim().min(1).max(80),
        delayMinutes: z.number().int().min(0).default(0),
        conditions: z.record(z.string(), z.unknown()).default({}),
        config: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .default([]),
});

export const sequenceParamSchema = z.object({
  sequenceId: z.string().uuid(),
});

export const sequenceEnrollSchema = z.object({
  leadId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type CreateSequenceInput = z.infer<typeof sequenceSchema>;
export type EnrollSequenceInput = z.infer<typeof sequenceEnrollSchema>;
