import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import {
  authRefreshTokens,
  companies,
  companyInvites,
  companyMemberships,
  companyPlans,
  profiles,
  referralAttributions,
  referralCodes,
  stores,
  superAdmins,
} from "@/db/schema";
import {
  assertPasswordPolicy,
  hashToken,
  issueSessionTokens,
  loginWithSupabasePassword,
  loginWithSupabasePasswordSession,
  registerWithSupabase,
  resendSupabaseVerificationEmail,
  sendPasswordRecoveryEmail,
  updateSupabasePassword,
  verifyRefreshToken,
  verifySupabaseAccessToken,
} from "@/lib/auth";
import { ok } from "@/lib/api";
import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { ensureAuthSession, recordSecurityAuditLog, requireActiveAuthSession, revokeAuthSession } from "@/lib/security";
import {
  buildInviteRegistrationUrl,
  buildReferralRegistrationUrl,
  canAcceptInviteForUser,
  isInviteActive,
  resolveReferralStatusAfterInviteAcceptance,
  resolveReferralStatusAfterOnboarding,
  resolveReferralStatusAfterRegistration,
  resolveReferralStatusAfterVerification,
} from "@/modules/auth/invite-referral";
import type {
  AcceptInviteInput,
  ChangePasswordInput,
  CreateReferralInput,
  ExchangeSupabaseInput,
  ForgotPasswordInput,
  InviteInput,
  LoginInput,
  OnboardingInput,
  RefreshInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
} from "@/modules/auth/schema";

const ACCESS_COOKIE = "crm_access_token";
const REFRESH_COOKIE = "crm_refresh_token";
const SESSION_COOKIE = "crm_session";

const authCookieBase = {
  path: "/",
  sameSite: env.COOKIE_SAME_SITE as "lax" | "strict" | "none" | "Lax" | "Strict" | "None",
  secure: env.COOKIE_SECURE,
};

function generateReferralCode(seed: string) {
  const cleanSeed = seed.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const prefix = cleanSeed.slice(0, 6) || "REF";
  return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function getInviteByToken(token: string) {
  const [invite] = await db
    .select()
    .from(companyInvites)
    .where(eq(companyInvites.token, token))
    .limit(1);

  return invite ?? null;
}

async function getReferralCodeByCode(code: string) {
  const [referralCode] = await db
    .select()
    .from(referralCodes)
    .where(and(eq(referralCodes.code, code), eq(referralCodes.isActive, true)))
    .limit(1);

  return referralCode ?? null;
}

async function ensureUserReferralCode(input: { userId: string; companyId?: string | null; email?: string | null }) {
  const [existing] = await db
    .select()
    .from(referralCodes)
    .where(
      and(
        eq(referralCodes.referrerUserId, input.userId),
        input.companyId ? eq(referralCodes.companyId, input.companyId) : isNull(referralCodes.companyId),
        eq(referralCodes.isActive, true),
      ),
    )
    .orderBy(desc(referralCodes.createdAt))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(referralCodes)
    .values({
      companyId: input.companyId ?? null,
      referrerUserId: input.userId,
      code: generateReferralCode(input.email ?? input.userId),
    })
    .returning();

  return created;
}

async function createOrUpdateReferralAttribution(input: {
  referralCodeId: string;
  companyId?: string | null;
  referrerUserId: string;
  referredUserId?: string | null;
  referredEmail?: string | null;
  inviteId?: string | null;
  status: "captured" | "registered" | "verified" | "joined_company" | "completed_onboarding";
}) {
  const referredEmail = input.referredEmail?.toLowerCase() ?? null;
  let existing = null as typeof referralAttributions.$inferSelect | null;

  if (input.referredUserId) {
    [existing] = await db
      .select()
      .from(referralAttributions)
      .where(and(eq(referralAttributions.referralCodeId, input.referralCodeId), eq(referralAttributions.referredUserId, input.referredUserId)))
      .limit(1);
  }

  if (!existing && referredEmail) {
    [existing] = await db
      .select()
      .from(referralAttributions)
      .where(and(eq(referralAttributions.referralCodeId, input.referralCodeId), eq(referralAttributions.referredEmail, referredEmail)))
      .limit(1);
  }

  const timestampFields =
    input.status === "registered"
      ? { registeredAt: new Date() }
      : input.status === "verified"
        ? { verifiedAt: new Date() }
        : input.status === "joined_company"
          ? { joinedCompanyAt: new Date() }
          : input.status === "completed_onboarding"
            ? { completedOnboardingAt: new Date() }
            : {};

  if (existing) {
    const [updated] = await db
      .update(referralAttributions)
      .set({
        companyId: input.companyId ?? existing.companyId,
        referredUserId: input.referredUserId ?? existing.referredUserId,
        referredEmail: referredEmail ?? existing.referredEmail,
        inviteId: input.inviteId ?? existing.inviteId,
        status: input.status,
        ...timestampFields,
        updatedAt: new Date(),
      })
      .where(eq(referralAttributions.id, existing.id))
      .returning();

    return updated;
  }

  const [created] = await db
    .insert(referralAttributions)
    .values({
      referralCodeId: input.referralCodeId,
      companyId: input.companyId ?? null,
      referrerUserId: input.referrerUserId,
      referredUserId: input.referredUserId ?? null,
      referredEmail,
      inviteId: input.inviteId ?? null,
      status: input.status,
      capturedAt: new Date(),
      ...timestampFields,
    })
    .returning();

  return created;
}

async function acceptInviteForIdentity(input: { token: string; userId: string; email: string | null }) {
  const [invite] = await db
    .select()
    .from(companyInvites)
    .where(and(eq(companyInvites.token, input.token), eq(companyInvites.status, "pending"), gt(companyInvites.expiresAt, new Date())))
    .limit(1);

  if (!invite) {
    return {
      accepted: false as const,
      reason: "invalid_invite",
      invite: null,
    };
  }

  if (!canAcceptInviteForUser({ inviteEmail: invite.email, authenticatedEmail: input.email })) {
    throw AppError.forbidden("Invite email does not match authenticated user");
  }

  await db
    .insert(companyMemberships)
    .values({
      companyId: invite.companyId,
      userId: input.userId,
      role: invite.role,
      storeId: invite.storeId,
      status: "active",
    })
    .onConflictDoUpdate({
      target: [companyMemberships.companyId, companyMemberships.userId],
      set: {
        role: invite.role,
        storeId: invite.storeId,
        status: "active",
        deletedAt: null,
        updatedAt: new Date(),
      },
    });

  await db
    .update(companyInvites)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companyInvites.id, invite.id));

  return {
    accepted: true as const,
    reason: null,
    invite,
  };
}

function setAuthCookies(c: Parameters<typeof setCookie>[0], input: { accessToken: string; refreshToken: string }) {
  setCookie(c, ACCESS_COOKIE, input.accessToken, {
    ...authCookieBase,
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS,
    httpOnly: true,
  });

  setCookie(c, REFRESH_COOKIE, input.refreshToken, {
    ...authCookieBase,
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS,
    httpOnly: true,
  });

  setCookie(c, SESSION_COOKIE, "1", {
    ...authCookieBase,
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS,
    httpOnly: false,
  });
}

function clearAuthCookies(c: Parameters<typeof setCookie>[0]) {
  deleteCookie(c, ACCESS_COOKIE, { path: "/" });
  deleteCookie(c, REFRESH_COOKIE, { path: "/" });
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

async function upsertProfile(userId: string, email: string | null) {
  if (!email) {
    return;
  }

  await db
    .insert(profiles)
    .values({
      id: userId,
      email,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        email,
        updatedAt: new Date(),
      },
    });
}

async function syncSuperAdmin(userId: string, email: string | null) {
  if (!email) {
    return false;
  }

  const normalizedEmail = email.toLowerCase();
  const shouldBeSuperAdmin = env.SUPER_ADMIN_EMAILS.includes(normalizedEmail);

  if (!shouldBeSuperAdmin) {
    return false;
  }

  await db
    .insert(superAdmins)
    .values({
      userId,
      email: normalizedEmail,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: superAdmins.userId,
      set: {
        email: normalizedEmail,
        isActive: true,
        updatedAt: new Date(),
      },
    });

  return true;
}

async function createSession(
  c: Parameters<typeof setCookie>[0],
  identity: { userId: string; email: string | null },
  sessionId?: string,
) {
  await upsertProfile(identity.userId, identity.email);
  await syncSuperAdmin(identity.userId, identity.email);

  const effectiveSessionId = sessionId ?? crypto.randomUUID();
  const tokens = await issueSessionTokens({
    userId: identity.userId,
    email: identity.email,
    sessionId: effectiveSessionId,
  });

  await db.insert(authRefreshTokens).values({
    userId: identity.userId,
    sessionId: effectiveSessionId,
    tokenHash: hashToken(tokens.refreshToken),
    jti: tokens.refreshTokenJti,
    expiresAt: tokens.refreshTokenExpiresAt,
  });

  await ensureAuthSession({
    sessionId: effectiveSessionId,
    userId: identity.userId,
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
    expiresAt: tokens.refreshTokenExpiresAt,
  });

  setAuthCookies(c, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
}

export function createGoogleAuthUrl(c: Context<AppEnv>) {
  const url = new URL(`${env.SUPABASE_URL}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", env.AUTH_CALLBACK_URL);

  return ok(c, {
    provider: "google",
    url: url.toString(),
  });
}

export async function register(c: Context<AppEnv>) {
  const body = c.get("validatedBody") as RegisterInput;
  assertPasswordPolicy(body.password, {
    email: body.email,
    fullName: body.fullName,
  });
  const registration = await registerWithSupabase({
    email: body.email,
    password: body.password,
    fullName: body.fullName,
  });

  if (registration.userId && registration.email) {
    await upsertProfile(registration.userId, registration.email);
    await db
      .update(profiles)
      .set({
        fullName: body.fullName,
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, registration.userId));

    if (body.referralCode) {
      const referralCode = await getReferralCodeByCode(body.referralCode);
      if (referralCode) {
        await createOrUpdateReferralAttribution({
          referralCodeId: referralCode.id,
          companyId: referralCode.companyId ?? null,
          referrerUserId: referralCode.referrerUserId,
          referredUserId: registration.userId,
          referredEmail: registration.email,
          status: resolveReferralStatusAfterRegistration(),
        });
      }
    }
  }

  return ok(
    c,
    {
      registered: true,
      email: registration.email ?? body.email,
      emailConfirmationRequired: registration.emailConfirmationRequired,
      inviteCaptured: Boolean(body.inviteToken),
      referralCaptured: Boolean(body.referralCode),
    },
    201,
  );
}

export async function login(c: Context<AppEnv>) {
  const body = c.get("validatedBody") as LoginInput;
  try {
    const identity = await loginWithSupabasePassword(body.email, body.password);

    await createSession(c, identity);
    await recordSecurityAuditLog({
      requestId: c.get("requestId"),
      userId: identity.userId,
      route: c.req.path,
      action: "auth.login",
      result: "success",
      ipAddress: c.get("clientIp") ?? null,
      userAgent: c.get("userAgent") ?? null,
      metadata: {
        email: body.email.toLowerCase(),
      },
    });

    return ok(c, {
      user: {
        id: identity.userId,
        email: identity.email,
      },
      authenticated: true,
    });
  } catch (error) {
    await recordSecurityAuditLog({
      requestId: c.get("requestId"),
      route: c.req.path,
      action: "auth.login",
      result: "failed",
      ipAddress: c.get("clientIp") ?? null,
      userAgent: c.get("userAgent") ?? null,
      metadata: {
        email: body.email.toLowerCase(),
      },
    });
    throw error;
  }
}

export async function exchangeSupabaseSession(c: Context<AppEnv>) {
  const body = c.get("validatedBody") as ExchangeSupabaseInput;
  const identity = await verifySupabaseAccessToken(body.supabaseAccessToken);

  await createSession(c, identity);
  let inviteAccepted = false;
  let inviteError: string | null = null;

  if (body.inviteToken) {
    try {
      const inviteResult = await acceptInviteForIdentity({
        token: body.inviteToken,
        userId: identity.userId,
        email: identity.email,
      });
      inviteAccepted = inviteResult.accepted;
      if (inviteResult.accepted && inviteResult.invite?.referralCode) {
        const referralCode = await getReferralCodeByCode(inviteResult.invite.referralCode);
        if (referralCode) {
          await createOrUpdateReferralAttribution({
            referralCodeId: referralCode.id,
            companyId: inviteResult.invite.companyId,
            referrerUserId: referralCode.referrerUserId,
            referredUserId: identity.userId,
            referredEmail: identity.email,
            inviteId: inviteResult.invite.id,
          status: resolveReferralStatusAfterInviteAcceptance(),
          });
        }
      }
    } catch (error) {
      if (error instanceof AppError && error.status < 500) {
        inviteError = error.message;
      } else {
        throw error;
      }
    }
  }

  if (body.referralCode) {
    const referralCode = await getReferralCodeByCode(body.referralCode);
    if (referralCode) {
      const membership = referralCode.companyId
        ? await db
            .select({ id: companyMemberships.id })
            .from(companyMemberships)
            .where(and(eq(companyMemberships.userId, identity.userId), eq(companyMemberships.companyId, referralCode.companyId), isNull(companyMemberships.deletedAt)))
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : null;

      await createOrUpdateReferralAttribution({
        referralCodeId: referralCode.id,
        companyId: referralCode.companyId ?? null,
        referrerUserId: referralCode.referrerUserId,
        referredUserId: identity.userId,
        referredEmail: identity.email,
        status: resolveReferralStatusAfterVerification({
          hasCompanyMembership: Boolean(membership),
        }),
      });
    }
  }

  return ok(c, {
    user: {
      id: identity.userId,
      email: identity.email,
    },
    authenticated: true,
    inviteAccepted,
    inviteError,
  });
}

export async function forgotPassword(c: Context<AppEnv>) {
  const body = c.get("validatedBody") as ForgotPasswordInput;
  await sendPasswordRecoveryEmail(body.email);
  await recordSecurityAuditLog({
    requestId: c.get("requestId"),
    route: c.req.path,
    action: "auth.forgot_password",
    result: "success",
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
    metadata: {
      email: body.email.toLowerCase(),
    },
  });

  return ok(c, {
    sent: true,
    email: body.email,
  });
}

export async function resendVerification(c: Context<AppEnv>) {
  const body = c.get("validatedBody") as ResendVerificationInput;
  await resendSupabaseVerificationEmail(body.email);

  return ok(c, {
    sent: true,
    email: body.email,
  });
}

export async function resetPassword(c: Context<AppEnv>) {
  const body = c.get("validatedBody") as ResetPasswordInput;
  const identity = await verifySupabaseAccessToken(body.supabaseAccessToken);
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, identity.userId)).limit(1);

  assertPasswordPolicy(body.password, {
    email: identity.email,
    fullName: profile?.fullName ?? null,
  });

  await updateSupabasePassword({
    accessToken: body.supabaseAccessToken,
    password: body.password,
  });

  await recordSecurityAuditLog({
    requestId: c.get("requestId"),
    userId: identity.userId,
    route: c.req.path,
    action: "auth.reset_password",
    result: "success",
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
  });

  return ok(c, {
    reset: true,
  });
}

export async function changePassword(c: Context<AppEnv>) {
  const body = c.get("validatedBody") as ChangePasswordInput;
  const user = c.get("user");
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  const email = profile?.email ?? user.email;

  if (!email) {
    throw AppError.badRequest("A verified email is required before changing the password");
  }

  if (body.currentPassword === body.password) {
    throw AppError.conflict("New password must be different from the current password");
  }

  assertPasswordPolicy(body.password, {
    email,
    fullName: profile?.fullName ?? null,
  });

  const supabaseSession = await loginWithSupabasePasswordSession(email, body.currentPassword);

  if (supabaseSession.userId !== user.id) {
    throw AppError.unauthorized("Current password does not match the authenticated account");
  }

  await updateSupabasePassword({
    accessToken: supabaseSession.accessToken,
    password: body.password,
  });

  await recordSecurityAuditLog({
    requestId: c.get("requestId"),
    userId: user.id,
    sessionId: user.sessionId,
    route: c.req.path,
    action: "auth.change_password",
    result: "success",
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
  });

  return ok(c, {
    changed: true,
  });
}

export async function refreshSession(c: Context<AppEnv>) {
  const body = c.get("validatedBody") as RefreshInput;
  const refreshToken = body.refreshToken ?? getCookie(c, REFRESH_COOKIE);

  if (!refreshToken) {
    throw AppError.unauthorized("Missing refresh token");
  }

  const verified = await verifyRefreshToken(refreshToken);
  const tokenHash = hashToken(refreshToken);

  const [storedToken] = await db
    .select()
    .from(authRefreshTokens)
    .where(
      and(
        eq(authRefreshTokens.userId, verified.userId),
        eq(authRefreshTokens.tokenHash, tokenHash),
        eq(authRefreshTokens.jti, verified.jti),
        isNull(authRefreshTokens.revokedAt),
        gt(authRefreshTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!storedToken) {
    throw AppError.unauthorized("Refresh token is invalid or revoked");
  }

  await requireActiveAuthSession({
    sessionId: verified.sessionId,
    userId: verified.userId,
  });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, verified.userId)).limit(1);

  await createSession(
    c,
    {
      userId: verified.userId,
      email: profile?.email ?? verified.email,
    },
    verified.sessionId,
  );

  const [replacementToken] = await db
    .select({ id: authRefreshTokens.id })
    .from(authRefreshTokens)
    .where(and(eq(authRefreshTokens.userId, verified.userId), eq(authRefreshTokens.sessionId, verified.sessionId), isNull(authRefreshTokens.revokedAt)))
    .orderBy(desc(authRefreshTokens.createdAt))
    .limit(1);

  await db
    .update(authRefreshTokens)
    .set({
      revokedAt: new Date(),
      replacedByTokenId: replacementToken?.id ?? null,
    })
    .where(eq(authRefreshTokens.id, storedToken.id));

  await recordSecurityAuditLog({
    requestId: c.get("requestId"),
    userId: verified.userId,
    sessionId: verified.sessionId,
    route: c.req.path,
    action: "auth.refresh",
    result: "success",
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
  });

  return ok(c, { refreshed: true });
}

export async function logout(c: Context<AppEnv>) {
  const refreshToken = getCookie(c, REFRESH_COOKIE);
  const user = c.get("user");
  let sessionId: string | null = user?.sessionId ?? null;
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    if (!sessionId) {
      try {
        const verified = await verifyRefreshToken(refreshToken);
        sessionId = verified.sessionId;
      } catch {
        sessionId = null;
      }
    }
    await db
      .update(authRefreshTokens)
      .set({
        revokedAt: new Date(),
      })
      .where(and(eq(authRefreshTokens.tokenHash, tokenHash), isNull(authRefreshTokens.revokedAt)));
  }

  if (sessionId) {
    await revokeAuthSession({
      sessionId,
      reason: "logout",
    });
  }

  clearAuthCookies(c);
  await recordSecurityAuditLog({
    requestId: c.get("requestId"),
    userId: user?.id ?? null,
    sessionId,
    route: c.req.path,
    action: "auth.logout",
    result: "success",
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
  });
  return ok(c, { loggedOut: true });
}

export async function getCurrentUser(c: Context<AppEnv>) {
  const user = c.get("user");
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);

  const memberships = await db
    .select({
      membershipId: companyMemberships.id,
      companyId: companyMemberships.companyId,
      role: companyMemberships.role,
      status: companyMemberships.status,
      storeId: companyMemberships.storeId,
      companyName: companies.name,
      storeName: stores.name,
    })
    .from(companyMemberships)
    .innerJoin(companies, eq(companies.id, companyMemberships.companyId))
    .leftJoin(stores, eq(stores.id, companyMemberships.storeId))
    .where(
      and(
        eq(companyMemberships.userId, user.id),
        eq(companyMemberships.status, "active"),
        isNull(companyMemberships.deletedAt),
        isNull(companies.deletedAt),
      ),
    );

  return ok(c, {
    user: {
      ...user,
      fullName: profile?.fullName ?? null,
      isSuperAdmin: user.isSuperAdmin ?? false,
    },
    memberships,
    needsOnboarding: memberships.length === 0 && !user.isSuperAdmin,
    isSuperAdmin: user.isSuperAdmin ?? false,
  });
}

export async function onboarding(c: Context<AppEnv>) {
  const user = c.get("user");
  const body = c.get("validatedBody") as OnboardingInput;

  const existingMembership = await db
    .select({ id: companyMemberships.id })
    .from(companyMemberships)
    .where(and(eq(companyMemberships.userId, user.id), eq(companyMemberships.status, "active"), isNull(companyMemberships.deletedAt)))
    .limit(1);

  if (existingMembership.length > 0) {
    throw AppError.conflict("Onboarding already completed for this user");
  }

  await upsertProfile(user.id, user.email);
  await db
    .update(profiles)
    .set({
      fullName: body.fullName,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, user.id));

  const [company] = await db
    .insert(companies)
    .values({
      name: body.companyName,
      timezone: body.timezone,
      currency: body.currency.toUpperCase(),
      createdBy: user.id,
    })
    .returning();

  await db.insert(companyPlans).values({
    companyId: company.id,
    planCode: "starter",
    planName: "Starter",
    status: "trial",
    billingInterval: "monthly",
    seatLimit: 5,
    monthlyPrice: 0,
    currency: body.currency.toUpperCase(),
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });

  const storeCode = (
    body.storeName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "MAIN"
  );

  const [store] = await db
    .insert(stores)
    .values({
      companyId: company.id,
      name: body.storeName,
      code: storeCode,
      isDefault: true,
    })
    .returning();

  const [membership] = await db
    .insert(companyMemberships)
    .values({
      companyId: company.id,
      userId: user.id,
      role: "owner",
      status: "active",
      storeId: store.id,
    })
    .returning();

  const attributions = await db
    .select()
    .from(referralAttributions)
    .where(eq(referralAttributions.referredUserId, user.id));

  for (const attribution of attributions) {
    await db
      .update(referralAttributions)
      .set({
        companyId: attribution.companyId ?? company.id,
        status: resolveReferralStatusAfterOnboarding(),
        completedOnboardingAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(referralAttributions.id, attribution.id));
  }

  return ok(
    c,
    {
      onboarded: true,
      companyId: company.id,
      storeId: store.id,
      membershipId: membership.id,
    },
    201,
  );
}

export async function inviteMember(c: Context<AppEnv>) {
  const body = c.get("validatedBody") as InviteInput;
  const user = c.get("user");
  const tenant = c.get("tenant");

  const existing = await db
    .select({ id: companyInvites.id })
    .from(companyInvites)
    .where(
      and(
        eq(companyInvites.companyId, tenant.companyId),
        eq(companyInvites.email, body.email),
        eq(companyInvites.status, "pending"),
        gt(companyInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throw AppError.conflict("There is already an active invite for this email");
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000);
  const inviterReferralCode = await ensureUserReferralCode({
    userId: user.id,
    companyId: tenant.companyId,
    email: user.email,
  });

  const [createdInvite] = await db
    .insert(companyInvites)
    .values({
      companyId: tenant.companyId,
      email: body.email,
      role: body.role,
      storeId: body.storeId ?? null,
      token,
      referralCode: inviterReferralCode.code,
      inviteMessage: body.inviteMessage ?? null,
      invitedBy: user.id,
      expiresAt,
    })
    .returning();

  return ok(
    c,
    {
      inviteId: createdInvite.id,
      token: createdInvite.token,
      inviteUrl: buildInviteRegistrationUrl({
        frontendUrl: env.FRONTEND_URL,
        inviteToken: createdInvite.token,
        referralCode: inviterReferralCode.code,
      }),
      expiresAt: createdInvite.expiresAt,
      role: createdInvite.role,
      email: createdInvite.email,
      referralCode: inviterReferralCode.code,
      inviteMessage: createdInvite.inviteMessage,
    },
    201,
  );
}

export async function listInvites(c: Context<AppEnv>) {
  const tenant = c.get("tenant");

  const items = await db
    .select({
      inviteId: companyInvites.id,
      email: companyInvites.email,
      role: companyInvites.role,
      status: companyInvites.status,
      storeId: companyInvites.storeId,
      referralCode: companyInvites.referralCode,
      inviteMessage: companyInvites.inviteMessage,
      metadata: companyInvites.metadata,
      expiresAt: companyInvites.expiresAt,
      acceptedAt: companyInvites.acceptedAt,
      createdAt: companyInvites.createdAt,
      token: companyInvites.token,
    })
    .from(companyInvites)
    .where(eq(companyInvites.companyId, tenant.companyId))
    .orderBy(desc(companyInvites.createdAt));

  return ok(c, {
    items: items.map((item) => ({
      ...item,
      inviteUrl: buildInviteRegistrationUrl({
        frontendUrl: env.FRONTEND_URL,
        inviteToken: item.token,
        referralCode: item.referralCode,
      }),
    })),
  });
}

export async function getInviteLookup(c: Context<AppEnv>) {
  const token = c.req.param("token");
  if (!token) {
    return ok(c, {
      valid: false,
      invite: null,
    });
  }
  const invite = await getInviteByToken(token);

  if (!isInviteActive(invite)) {
    return ok(c, {
      valid: false,
      invite: null,
    });
  }

  return ok(c, {
    valid: true,
    invite: {
      email: invite.email,
      role: invite.role,
      storeId: invite.storeId,
      referralCode: invite.referralCode,
      inviteMessage: invite.inviteMessage,
      expiresAt: invite.expiresAt,
    },
  });
}

export async function createReferralLink(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateReferralInput;

  const referralCode = await ensureUserReferralCode({
    userId: user.id,
    companyId: tenant.companyId,
    email: user.email,
  });

  if (body.metadata && Object.keys(body.metadata).length > 0) {
    await db
      .update(referralCodes)
      .set({
        metadata: body.metadata,
        updatedAt: new Date(),
      })
      .where(eq(referralCodes.id, referralCode.id));
  }

  return ok(c, {
    referralCode: referralCode.code,
    referralUrl: buildReferralRegistrationUrl({
      frontendUrl: env.FRONTEND_URL,
      referralCode: referralCode.code,
    }),
    createdAt: referralCode.createdAt,
  }, 201);
}

export async function listReferralLinks(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const tenantIsAdmin = c.get("tenant")?.role === "admin" || c.get("tenant")?.role === "owner";
  const codeConditions = [eq(referralCodes.companyId, tenant.companyId)];
  const attributionConditions = [eq(referralAttributions.companyId, tenant.companyId)];
  if (!tenantIsAdmin) {
    codeConditions.push(eq(referralCodes.referrerUserId, user.id));
    attributionConditions.push(eq(referralAttributions.referrerUserId, user.id));
  }

  const codeRows = await db
    .select()
    .from(referralCodes)
    .where(and(...codeConditions));

  const attributionRows = await db
    .select()
    .from(referralAttributions)
    .where(and(...attributionConditions))
    .orderBy(desc(referralAttributions.createdAt));

  return ok(c, {
    codes: codeRows.map((item) => ({
      ...item,
      referralUrl: buildReferralRegistrationUrl({
        frontendUrl: env.FRONTEND_URL,
        referralCode: item.code,
      }),
    })),
    attributions: attributionRows,
  });
}

export async function acceptInvite(c: Context<AppEnv>) {
  const body = c.get("validatedBody") as AcceptInviteInput;
  const user = c.get("user");
  const result = await acceptInviteForIdentity({
    token: body.token,
    userId: user.id,
    email: user.email,
  });

  if (!result.accepted || !result.invite) {
    throw AppError.notFound("Invite token is invalid or expired");
  }
  const invite = result.invite;

  if (invite.referralCode) {
    const referralCode = await getReferralCodeByCode(invite.referralCode);
    if (referralCode) {
      await createOrUpdateReferralAttribution({
        referralCodeId: referralCode.id,
        companyId: invite.companyId,
        referrerUserId: referralCode.referrerUserId,
        referredUserId: user.id,
        referredEmail: user.email,
        inviteId: invite.id,
        status: resolveReferralStatusAfterInviteAcceptance(),
      });
    }
  }

  await recordSecurityAuditLog({
    requestId: c.get("requestId"),
    companyId: invite.companyId,
    userId: user.id,
    sessionId: user.sessionId,
    route: c.req.path,
    action: "auth.accept_invite",
    result: "success",
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
    metadata: {
      role: invite.role,
    },
  });

  return ok(c, {
    accepted: true,
    companyId: invite.companyId,
    role: invite.role,
  });
}
