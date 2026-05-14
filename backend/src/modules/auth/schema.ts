import { z } from "zod";

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member"]).default("member"),
  customRoleId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
  fullName: z.string().trim().min(2).max(180),
  phoneNumber: z.string().trim().max(60).optional(),
  address: z.string().trim().max(240).optional(),
  governmentId: z.string().trim().max(120).optional(),
  remark: z.string().trim().max(2000).optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  inviteMessage: z.string().trim().max(2000).nullable().optional(),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

export const inviteLookupSchema = z.object({
  token: z.string().min(1),
});

export const inviteParamSchema = z.object({
  inviteId: z.string().uuid(),
});

export const resendInviteSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).default(7).optional(),
  inviteMessage: z.string().trim().max(2000).nullable().optional(),
});

const mfaSessionSchema = z.object({
  currentPassword: z.string().min(1),
  signInFactorId: z.string().uuid().optional(),
  signInCode: z.string().trim().min(6).max(12).optional(),
});

export const mfaListSchema = mfaSessionSchema;

export const mfaEnrollSchema = mfaSessionSchema.extend({
  friendlyName: z.string().trim().min(2).max(80).optional(),
});

export const mfaVerifyEnrollSchema = mfaSessionSchema.extend({
  factorId: z.string().uuid(),
  code: z.string().trim().min(6).max(12),
});

export const mfaUnenrollSchema = mfaSessionSchema.extend({
  factorId: z.string().uuid(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  inviteToken: z.string().trim().min(1).nullable().optional(),
  referralCode: z.string().trim().min(1).nullable().optional(),
});

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(180),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    inviteToken: z.string().trim().min(1).nullable().optional(),
    referralCode: z.string().trim().min(1).nullable().optional(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const exchangeSupabaseSchema = z.object({
  supabaseAccessToken: z.string().min(1),
  inviteToken: z.string().trim().min(1).nullable().optional(),
  referralCode: z.string().trim().min(1).nullable().optional(),
});

export const createReferralSchema = z.object({
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z
  .object({
    supabaseAccessToken: z.string().min(1),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

export const onboardingSchema = z.object({
  companyName: z.string().trim().min(2).max(180),
  companyWebsite: z.string().trim().url().max(255).optional().or(z.literal("")),
  companyAddress: z.string().trim().min(2).max(500),
  country: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(2).max(80).default("UTC"),
  currency: z.string().trim().min(3).max(8).default("USD"),
  firstName: z.string().trim().min(1).max(90),
  lastName: z.string().trim().min(1).max(90),
  mobileNumber: z.string().trim().min(6).max(40),
  secondaryContact: z.string().trim().max(320).optional().or(z.literal("")),
  branchName: z.string().trim().max(180).optional().or(z.literal("")),
  branchAddress: z.string().trim().max(500).optional().or(z.literal("")),
  branchCountry: z.string().trim().max(120).optional().or(z.literal("")),
  branchState: z.string().trim().max(120).optional().or(z.literal("")),
  branchCity: z.string().trim().max(120).optional().or(z.literal("")),
});

export type InviteInput = z.infer<typeof inviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type InviteLookupInput = z.infer<typeof inviteLookupSchema>;
export type InviteParamInput = z.infer<typeof inviteParamSchema>;
export type ResendInviteInput = z.infer<typeof resendInviteSchema>;
export type MfaListInput = z.infer<typeof mfaListSchema>;
export type MfaEnrollInput = z.infer<typeof mfaEnrollSchema>;
export type MfaVerifyEnrollInput = z.infer<typeof mfaVerifyEnrollSchema>;
export type MfaUnenrollInput = z.infer<typeof mfaUnenrollSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ExchangeSupabaseInput = z.infer<typeof exchangeSupabaseSchema>;
export type CreateReferralInput = z.infer<typeof createReferralSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
