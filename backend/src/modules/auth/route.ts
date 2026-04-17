import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  acceptInvite,
  changePassword,
  createReferralLink,
  createGoogleAuthUrl,
  exchangeSupabaseSession,
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
  resetPassword,
} from "@/modules/auth/controller";
import {
  acceptInviteSchema,
  changePasswordSchema,
  createReferralSchema,
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
authRoutes.post("/refresh", enforceBodyLimit(bodyLimits.authSensitive), rateLimit(routePolicies.authSensitive), validateJson(refreshSchema), refreshSession);
authRoutes.post("/logout", logout);
authRoutes.get("/me", requireAuth, getCurrentUser);
authRoutes.post("/onboarding", requireAuth, validateJson(onboardingSchema), onboarding);
authRoutes.post("/invite", requireAuth, requireTenant, requireModuleAccess("teams"), validateJson(inviteSchema), inviteMember);
authRoutes.get("/invites", requireAuth, requireTenant, requireModuleAccess("teams"), listInvites);
authRoutes.get("/invite/:token", getInviteLookup);
authRoutes.post("/accept-invite", requireAuth, validateJson(acceptInviteSchema), acceptInvite);
authRoutes.post("/referrals", requireAuth, requireTenant, requireRole("admin"), requireModuleAccess("teams"), validateJson(createReferralSchema), createReferralLink);
authRoutes.get("/referrals", requireAuth, requireTenant, requireRole("admin"), requireModuleAccess("teams"), listReferralLinks);
