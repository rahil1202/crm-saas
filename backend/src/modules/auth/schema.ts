import { z } from "zod";

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member"]).default("member"),
  customRoleId: z.string().uuid().nullable().optional(),
  storeId: z.string().uuid().nullable().optional(),
  fullName: z.string().trim().min(2).max(180).optional(),
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
});

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(180),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    inviteToken: z.string().trim().min(1).optional(),
    referralCode: z.string().trim().min(1).optional(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const exchangeSupabaseSchema = z.object({
  supabaseAccessToken: z.string().min(1),
  inviteToken: z.string().trim().min(1).optional(),
  referralCode: z.string().trim().min(1).optional(),
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
  fullName: z.string().trim().min(2).max(180),
  companyName: z.string().trim().min(2).max(180),
  storeName: z.string().trim().min(2).max(180),
  timezone: z.string().trim().min(2).max(80).default("UTC"),
  currency: z.string().trim().min(3).max(8).default("USD"),
});

export type InviteInput = z.infer<typeof inviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type InviteLookupInput = z.infer<typeof inviteLookupSchema>;
export type InviteParamInput = z.infer<typeof inviteParamSchema>;
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
