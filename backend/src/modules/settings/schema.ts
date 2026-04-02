import { z } from "zod";

export const pipelineStageSchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
});

export const dealPipelineSchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
  stages: z.array(pipelineStageSchema).min(1).max(20),
});

export const leadSourceSchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(120),
});

export const businessHourSchema = z.object({
  day: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
  enabled: z.boolean(),
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
});

export const brandingSchema = z.object({
  companyLabel: z.string().trim().max(120).default(""),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  logoUrl: z.string().url().nullable().optional(),
});

export const updatePipelineSettingsSchema = z.object({
  defaultDealPipeline: z.string().trim().min(1).max(100),
  dealPipelines: z.array(dealPipelineSchema).min(1).max(10),
});

export const updateLeadSourcesSchema = z.object({
  leadSources: z.array(leadSourceSchema).min(1).max(20),
});

export const updateCompanyPreferencesSchema = z.object({
  businessHours: z.array(businessHourSchema).length(7),
  branding: brandingSchema,
});

export type UpdatePipelineSettingsInput = z.infer<typeof updatePipelineSettingsSchema>;
export type UpdateLeadSourcesInput = z.infer<typeof updateLeadSourcesSchema>;
export type UpdateCompanyPreferencesInput = z.infer<typeof updateCompanyPreferencesSchema>;
