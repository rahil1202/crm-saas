import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  acceptInvite,
  changePassword,
  createGoogleAuthUrl,
  exchangeSupabaseSession,
  forgotPassword,
  getCurrentUser,
  inviteMember,
  login,
  logout,
  onboarding,
  refreshSession,
  register,
  resendVerification,
  resetPassword,
} from "@/modules/auth/controller";
import {
  acceptInviteSchema,
  changePasswordSchema,
  exchangeSupabaseSchema,
  forgotPasswordSchema,
  inviteSchema,
  loginSchema,
  onboardingSchema,
  refreshSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
} from "@/modules/auth/schema";
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";

export const authRoutes = new Hono<AppEnv>().basePath("/auth");

authRoutes.get("/google/url", createGoogleAuthUrl);
authRoutes.post("/register", validateJson(registerSchema), register);
authRoutes.post("/login", validateJson(loginSchema), login);
authRoutes.post("/exchange-supabase", validateJson(exchangeSupabaseSchema), exchangeSupabaseSession);
authRoutes.post("/forgot-password", validateJson(forgotPasswordSchema), forgotPassword);
authRoutes.post("/resend-verification", validateJson(resendVerificationSchema), resendVerification);
authRoutes.post("/reset-password", validateJson(resetPasswordSchema), resetPassword);
authRoutes.post("/change-password", requireAuth, validateJson(changePasswordSchema), changePassword);
authRoutes.post("/refresh", validateJson(refreshSchema), refreshSession);
authRoutes.post("/logout", logout);
authRoutes.get("/me", requireAuth, getCurrentUser);
authRoutes.post("/onboarding", requireAuth, validateJson(onboardingSchema), onboarding);
authRoutes.post("/invite", requireAuth, requireTenant, requireRole("admin"), validateJson(inviteSchema), inviteMember);
authRoutes.post("/accept-invite", requireAuth, validateJson(acceptInviteSchema), acceptInvite);
