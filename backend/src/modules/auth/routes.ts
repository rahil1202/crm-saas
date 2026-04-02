import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "@/app/router";
import { db } from "@/db/client";
import { authRefreshTokens, companies, companyInvites, companyMemberships, profiles, stores } from "@/db/schema";
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
import { requireAuth, requireRole, requireTenant } from "@/middleware/auth";
import { validateJson } from "@/middleware/common";

const ACCESS_COOKIE = "crm_access_token";
const REFRESH_COOKIE = "crm_refresh_token";
const SESSION_COOKIE = "crm_session";

const authCookieBase = {
  path: "/",
  sameSite: "Lax" as const,
  secure: env.COOKIE_SECURE,
};

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "admin", "member"]).default("member"),
  storeId: z.string().uuid().nullable().optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z
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

const exchangeSupabaseSchema = z.object({
  supabaseAccessToken: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z
  .object({
    supabaseAccessToken: z.string().min(1),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

const onboardingSchema = z.object({
  fullName: z.string().trim().min(2).max(180),
  companyName: z.string().trim().min(2).max(180),
  storeName: z.string().trim().min(2).max(180),
  timezone: z.string().trim().min(2).max(80).default("UTC"),
  currency: z.string().trim().min(3).max(8).default("USD"),
});

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

async function createSession(c: Parameters<typeof setCookie>[0], identity: { userId: string; email: string | null }, sessionId?: string) {
  await upsertProfile(identity.userId, identity.email);

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

  setAuthCookies(c, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
}

export const authRoutes = new Hono<AppEnv>().basePath("/auth");

authRoutes.get("/google/url", (c) => {
  const url = new URL(`${env.SUPABASE_URL}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", env.AUTH_CALLBACK_URL);

  return ok(c, {
    provider: "google",
    url: url.toString(),
  });
});

authRoutes.post("/register", validateJson(registerSchema), async (c) => {
  const body = c.get("validatedBody") as z.infer<typeof registerSchema>;
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
  }

  return ok(
    c,
    {
      registered: true,
      email: registration.email ?? body.email,
      emailConfirmationRequired: registration.emailConfirmationRequired,
    },
    201,
  );
});

authRoutes.post("/login", validateJson(loginSchema), async (c) => {
  const body = c.get("validatedBody") as z.infer<typeof loginSchema>;
  const identity = await loginWithSupabasePassword(body.email, body.password);

  await createSession(c, identity);

  return ok(c, {
    user: {
      id: identity.userId,
      email: identity.email,
    },
    authenticated: true,
  });
});

authRoutes.post("/exchange-supabase", validateJson(exchangeSupabaseSchema), async (c) => {
  const body = c.get("validatedBody") as z.infer<typeof exchangeSupabaseSchema>;
  const identity = await verifySupabaseAccessToken(body.supabaseAccessToken);

  await createSession(c, identity);

  return ok(c, {
    user: {
      id: identity.userId,
      email: identity.email,
    },
    authenticated: true,
  });
});

authRoutes.post("/forgot-password", validateJson(forgotPasswordSchema), async (c) => {
  const body = c.get("validatedBody") as z.infer<typeof forgotPasswordSchema>;
  await sendPasswordRecoveryEmail(body.email);

  return ok(c, {
    sent: true,
    email: body.email,
  });
});

authRoutes.post("/resend-verification", validateJson(resendVerificationSchema), async (c) => {
  const body = c.get("validatedBody") as z.infer<typeof resendVerificationSchema>;
  await resendSupabaseVerificationEmail(body.email);

  return ok(c, {
    sent: true,
    email: body.email,
  });
});

authRoutes.post("/reset-password", validateJson(resetPasswordSchema), async (c) => {
  const body = c.get("validatedBody") as z.infer<typeof resetPasswordSchema>;
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

  return ok(c, {
    reset: true,
  });
});

authRoutes.post("/change-password", requireAuth, validateJson(changePasswordSchema), async (c) => {
  const body = c.get("validatedBody") as z.infer<typeof changePasswordSchema>;
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

  return ok(c, {
    changed: true,
  });
});

authRoutes.post("/refresh", validateJson(refreshSchema), async (c) => {
  const body = c.get("validatedBody") as z.infer<typeof refreshSchema>;
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

  return ok(c, { refreshed: true });
});

authRoutes.post("/logout", async (c) => {
  const refreshToken = getCookie(c, REFRESH_COOKIE);
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await db
      .update(authRefreshTokens)
      .set({
        revokedAt: new Date(),
      })
      .where(and(eq(authRefreshTokens.tokenHash, tokenHash), isNull(authRefreshTokens.revokedAt)));
  }

  clearAuthCookies(c);
  return ok(c, { loggedOut: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
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
    },
    memberships,
    needsOnboarding: memberships.length === 0,
  });
});

authRoutes.post("/onboarding", requireAuth, validateJson(onboardingSchema), async (c) => {
  const user = c.get("user");
  const body = c.get("validatedBody") as z.infer<typeof onboardingSchema>;

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
});

authRoutes.post("/invite", requireAuth, requireTenant, requireRole("admin"), validateJson(inviteSchema), async (c) => {
  const body = c.get("validatedBody") as z.infer<typeof inviteSchema>;
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

  const [createdInvite] = await db
    .insert(companyInvites)
    .values({
      companyId: tenant.companyId,
      email: body.email,
      role: body.role,
      storeId: body.storeId ?? null,
      token,
      invitedBy: user.id,
      expiresAt,
    })
    .returning();

  return ok(
    c,
    {
      inviteId: createdInvite.id,
      token: createdInvite.token,
      expiresAt: createdInvite.expiresAt,
      role: createdInvite.role,
      email: createdInvite.email,
    },
    201,
  );
});

authRoutes.post("/accept-invite", requireAuth, validateJson(acceptInviteSchema), async (c) => {
  const body = c.get("validatedBody") as z.infer<typeof acceptInviteSchema>;
  const user = c.get("user");

  const [invite] = await db
    .select()
    .from(companyInvites)
    .where(and(eq(companyInvites.token, body.token), eq(companyInvites.status, "pending"), gt(companyInvites.expiresAt, new Date())))
    .limit(1);

  if (!invite) {
    throw AppError.notFound("Invite token is invalid or expired");
  }

  if (user.email && user.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw AppError.forbidden("Invite email does not match authenticated user");
  }

  await upsertProfile(user.id, user.email);

  await db
    .insert(companyMemberships)
    .values({
      companyId: invite.companyId,
      userId: user.id,
      role: invite.role,
      storeId: invite.storeId,
      status: "active",
    })
    .onConflictDoUpdate({
      target: [companyMemberships.companyId, companyMemberships.userId],
      set: {
        role: invite.role,
        status: "active",
        storeId: invite.storeId,
        updatedAt: new Date(),
        deletedAt: null,
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

  return ok(c, {
    accepted: true,
    companyId: invite.companyId,
    role: invite.role,
  });
});
