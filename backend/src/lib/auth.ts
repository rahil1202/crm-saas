import { createHash, randomUUID } from "node:crypto";

import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";

import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";

const encoder = new TextEncoder();
const accessSecret = encoder.encode(env.ACCESS_TOKEN_SECRET);
const refreshSecret = encoder.encode(env.REFRESH_TOKEN_SECRET);
const jwks = createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

export interface SupabaseIdentity {
  userId: string;
  email: string | null;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  refreshTokenJti: string;
}

interface AccessTokenPayload {
  sub: string;
  email?: string;
  sid: string;
  typ: "access";
}

interface RefreshTokenPayload {
  sub: string;
  email?: string;
  sid: string;
  jti: string;
  typ: "refresh";
}

export async function issueSessionTokens(input: {
  userId: string;
  email: string | null;
  sessionId: string;
}): Promise<SessionTokens> {
  const now = Math.floor(Date.now() / 1000);
  const accessExp = now + env.ACCESS_TOKEN_TTL_SECONDS;
  const refreshExp = now + env.REFRESH_TOKEN_TTL_SECONDS;
  const jti = randomUUID();

  const accessToken = await new SignJWT({
    email: input.email ?? undefined,
    sid: input.sessionId,
    typ: "access",
  } satisfies Omit<AccessTokenPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setIssuedAt(now)
    .setExpirationTime(accessExp)
    .setJti(randomUUID())
    .sign(accessSecret);

  const refreshToken = await new SignJWT({
    email: input.email ?? undefined,
    sid: input.sessionId,
    jti,
    typ: "refresh",
  } satisfies Omit<RefreshTokenPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.userId)
    .setIssuedAt(now)
    .setExpirationTime(refreshExp)
    .setJti(jti)
    .sign(refreshSecret);

  return {
    accessToken,
    refreshToken,
    refreshTokenExpiresAt: new Date(refreshExp * 1000),
    refreshTokenJti: jti,
  };
}

export async function verifyAccessToken(token: string): Promise<{
  userId: string;
  email: string | null;
  sessionId: string;
}> {
  try {
    const { payload } = await jwtVerify(token, accessSecret);

    if (payload.typ !== "access") {
      throw AppError.unauthorized("Invalid access token type");
    }

    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") {
      throw AppError.unauthorized("Invalid access token payload");
    }

    return {
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      sessionId: payload.sid,
    };
  } catch {
    throw AppError.unauthorized("Invalid or expired access token");
  }
}

export async function verifyRefreshToken(token: string): Promise<{
  userId: string;
  email: string | null;
  sessionId: string;
  jti: string;
}> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret);

    if (payload.typ !== "refresh") {
      throw AppError.unauthorized("Invalid refresh token type");
    }

    if (typeof payload.sub !== "string" || typeof payload.sid !== "string" || typeof payload.jti !== "string") {
      throw AppError.unauthorized("Invalid refresh token payload");
    }

    return {
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      sessionId: payload.sid,
      jti: payload.jti,
    };
  } catch {
    throw AppError.unauthorized("Invalid or expired refresh token");
  }
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifySupabaseAccessToken(token: string): Promise<SupabaseIdentity> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
      audience: env.SUPABASE_JWT_AUDIENCE,
    });

    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw AppError.unauthorized("Invalid token subject");
    }

    return {
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
    };
  } catch {
    throw AppError.unauthorized("Invalid or expired Supabase token");
  }
}

export async function loginWithSupabasePassword(email: string, password: string): Promise<SupabaseIdentity> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw AppError.unauthorized("Invalid email or password");
  }

  const payload = (await response.json()) as {
    user?: {
      id?: string;
      email?: string | null;
    };
  };

  if (!payload.user?.id) {
    throw AppError.unauthorized("Unable to resolve Supabase user");
  }

  return {
    userId: payload.user.id,
    email: payload.user.email ?? null,
  };
}

export async function registerWithSupabase(input: {
  email: string;
  password: string;
  fullName: string;
}): Promise<{
  userId: string | null;
  email: string | null;
  emailConfirmationRequired: boolean;
}> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      data: {
        full_name: input.fullName,
      },
      options: {
        emailRedirectTo: env.AUTH_CALLBACK_URL,
        data: {
          full_name: input.fullName,
        },
      },
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { msg?: string; error_description?: string } | null;
    throw AppError.conflict(payload?.msg ?? payload?.error_description ?? "Unable to create account");
  }

  const payload = (await response.json()) as {
    user?: {
      id?: string;
      email?: string | null;
    };
    session?: unknown;
  };

  return {
    userId: payload.user?.id ?? null,
    email: payload.user?.email ?? null,
    emailConfirmationRequired: payload.session == null,
  };
}

export async function checkSupabaseConnection() {
  try {
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/settings`, {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
      };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
