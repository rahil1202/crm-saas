import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  acceptInvite,
  changePassword,
  createReferralLink,
  deleteInvite,
  createGoogleAuthUrl,
  enrollMfaFactor,
  exchangeSupabaseSession,
  listMfaFactors,
  forgotPassword,
  getInviteLookup,
  getCurrentUser,
  inviteMember,
  listInvites,
  listReferralLinks,
  login,
  logout,
  onboarding,
  refreshSession,
  register,
  resendVerification,
  resendInvite,
  resetPassword,
  unenrollMfaFactor,
  verifyMfaEnrollment,
} from "@/modules/auth/controller";
import {
  acceptInviteSchema,
  changePasswordSchema,
  createReferralSchema,
  exchangeSupabaseSchema,
  forgotPasswordSchema,
  inviteSchema,
  mfaEnrollSchema,
  mfaListSchema,
  mfaUnenrollSchema,
  mfaVerifyEnrollSchema,
  loginSchema,
  onboardingSchema,
  refreshSchema,
  registerSchema,
  resendVerificationSchema,
  resendInviteSchema,
  resetPasswordSchema,
} from "@/modules/auth/schema";
import { requireAuth, requireModuleAccess, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";
import { enforceBodyLimit, rateLimit } from "@/middleware/security";
import { bodyLimits, routePolicies } from "@/lib/security";

export const authRoutes = new Hono<AppEnv>().basePath("/auth");

authRoutes.get("/google/url", createGoogleAuthUrl);
authRoutes.post("/register", enforceBodyLimit(bodyLimits.authSensitive), rateLimit(routePolicies.authSensitive), validateJson(registerSchema), register);
authRoutes.post("/login", enforceBodyLimit(bodyLimits.authSensitive), rateLimit(routePolicies.authSensitive), validateJson(loginSchema), login);
authRoutes.post("/exchange-supabase", enforceBodyLimit(bodyLimits.authSensitive), rateLimit(routePolicies.authSensitive), validateJson(exchangeSupabaseSchema), exchangeSupabaseSession);
authRoutes.post("/forgot-password", enforceBodyLimit(bodyLimits.authSensitive), rateLimit(routePolicies.authSensitive), validateJson(forgotPasswordSchema), forgotPassword);
authRoutes.post("/resend-verification", validateJson(resendVerificationSchema), resendVerification);
authRoutes.post("/reset-password", enforceBodyLimit(bodyLimits.authSensitive), rateLimit(routePolicies.authSensitive), validateJson(resetPasswordSchema), resetPassword);
authRoutes.post("/change-password", requireAuth, enforceBodyLimit(bodyLimits.authSensitive), rateLimit(routePolicies.authSensitive), validateJson(changePasswordSchema), changePassword);
authRoutes.post("/mfa/factors", requireAuth, validateJson(mfaListSchema), listMfaFactors);
authRoutes.post("/mfa/enroll", requireAuth, validateJson(mfaEnrollSchema), enrollMfaFactor);
authRoutes.post("/mfa/verify-enrollment", requireAuth, validateJson(mfaVerifyEnrollSchema), verifyMfaEnrollment);
authRoutes.post("/mfa/unenroll", requireAuth, validateJson(mfaUnenrollSchema), unenrollMfaFactor);
authRoutes.post("/refresh", enforceBodyLimit(bodyLimits.authSensitive), rateLimit(routePolicies.authSensitive), validateJson(refreshSchema), refreshSession);
authRoutes.post("/logout", logout);
authRoutes.get("/me", requireAuth, getCurrentUser);
authRoutes.post("/onboarding", requireAuth, validateJson(onboardingSchema), onboarding);
authRoutes.post("/invite", requireAuth, requireTenant, requireModuleAccess("teams"), validateJson(inviteSchema), inviteMember);
authRoutes.get("/invites", requireAuth, requireTenant, requireModuleAccess("teams"), listInvites);
authRoutes.post("/invites/:inviteId/resend", requireAuth, requireTenant, requireModuleAccess("teams"), validateJson(resendInviteSchema), resendInvite);
authRoutes.delete("/invites/:inviteId", requireAuth, requireTenant, requireModuleAccess("teams"), deleteInvite);
authRoutes.get("/invite/:token", getInviteLookup);
authRoutes.post("/accept-invite", requireAuth, validateJson(acceptInviteSchema), acceptInvite);
authRoutes.post("/referrals", requireAuth, requireTenant, requireRole("admin"), requireModuleAccess("teams"), validateJson(createReferralSchema), createReferralLink);
authRoutes.get("/referrals", requireAuth, requireTenant, requireRole("admin"), requireModuleAccess("teams"), listReferralLinks);
