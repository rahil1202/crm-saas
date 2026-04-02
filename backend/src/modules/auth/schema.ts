import { z } from "zod";

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member"]).default("member"),
  storeId: z.string().uuid().nullable().optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
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
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const exchangeSupabaseSchema = z.object({
  supabaseAccessToken: z.string().min(1),
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
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ExchangeSupabaseInput = z.infer<typeof exchangeSupabaseSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
