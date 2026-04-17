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

interface SupabasePasswordSession extends SupabaseIdentity {
  accessToken: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  refreshTokenJti: string;
}

export interface PasswordPolicyCheck {
  key: string;
  label: string;
  passed: boolean;
}

export interface PasswordPolicyResult {
  valid: boolean;
  score: number;
  checks: PasswordPolicyCheck[];
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

export function evaluatePasswordPolicy(
  password: string,
  context?: {
    email?: string | null;
    fullName?: string | null;
  },
): PasswordPolicyResult {
  const emailLocalPart = context?.email?.split("@")[0]?.toLowerCase() ?? "";
  const fullNameTokens =
    context?.fullName
      ?.toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((token) => token.length >= 3) ?? [];
  const loweredPassword = password.toLowerCase();

  const checks: PasswordPolicyCheck[] = [
    {
      key: "length",
      label: "At least 8 characters",
      passed: password.length >= 8,
    },
    {
      key: "lowercase",
      label: "One lowercase letter",
      passed: /[a-z]/.test(password),
    },
    {
      key: "uppercase",
      label: "One uppercase letter",
      passed: /[A-Z]/.test(password),
    },
    {
      key: "number",
      label: "One number",
      passed: /\d/.test(password),
    },
    {
      key: "special",
      label: "One special character",
      passed: /[^A-Za-z0-9]/.test(password),
    },
    {
      key: "email",
      label: "Does not contain your email name",
      passed: emailLocalPart.length < 3 || !loweredPassword.includes(emailLocalPart),
    },
    {
      key: "name",
      label: "Does not contain your name",
      passed: !fullNameTokens.some((token) => loweredPassword.includes(token)),
    },
  ];

  const passedChecks = checks.filter((check) => check.passed).length;

  return {
    valid: checks.every((check) => check.passed),
    score: Math.round((passedChecks / checks.length) * 100),
    checks,
  };
}

export function assertPasswordPolicy(
  password: string,
  context?: {
    email?: string | null;
    fullName?: string | null;
  },
) {
  const policy = evaluatePasswordPolicy(password, context);

  if (!policy.valid) {
    throw AppError.badRequest("Password does not meet security requirements", {
      checks: policy.checks,
      score: policy.score,
    });
  }

  return policy;
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

async function createSupabasePasswordSession(email: string, password: string): Promise<SupabasePasswordSession> {
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
    access_token?: string;
    user?: {
      id?: string;
      email?: string | null;
    };
  };

  if (!payload.user?.id || !payload.access_token) {
    throw AppError.unauthorized("Unable to resolve Supabase user");
  }

  return {
    accessToken: payload.access_token,
    userId: payload.user.id,
    email: payload.user.email ?? null,
  };
}

export async function loginWithSupabasePassword(email: string, password: string): Promise<SupabaseIdentity> {
  const session = await createSupabasePasswordSession(email, password);

  return {
    userId: session.userId,
    email: session.email,
  };
}

export async function loginWithSupabasePasswordSession(email: string, password: string): Promise<SupabasePasswordSession> {
  return createSupabasePasswordSession(email, password);
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

export async function createManagedSupabaseUser(input: {
  email: string;
  password: string;
  fullName: string;
  emailConfirm?: boolean;
}): Promise<{
  userId: string;
  email: string | null;
}> {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: input.emailConfirm ?? true,
      user_metadata: {
        full_name: input.fullName,
      },
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { msg?: string; error_description?: string; message?: string } | null;
    throw AppError.conflict(payload?.msg ?? payload?.message ?? payload?.error_description ?? "Unable to create managed account");
  }

  const payload = (await response.json()) as {
    id?: string;
    email?: string | null;
  };

  if (!payload.id) {
    throw AppError.conflict("Supabase did not return the created user");
  }

  return {
    userId: payload.id,
    email: payload.email ?? null,
  };
}

export async function findManagedSupabaseUserByEmail(email: string): Promise<{
  userId: string;
  email: string | null;
} | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const perPage = 200;
  let page = 1;

  for (;;) {
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      method: "GET",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { msg?: string; error_description?: string; message?: string } | null;
      throw AppError.badRequest(payload?.msg ?? payload?.message ?? payload?.error_description ?? "Unable to load managed accounts");
    }

    const payload = (await response.json()) as {
      users?: Array<{
        id?: string;
        email?: string | null;
      }>;
    };

    const users = payload.users ?? [];
    const matchedUser = users.find((user) => user.id && user.email?.toLowerCase() === normalizedEmail);

    if (matchedUser?.id) {
      return {
        userId: matchedUser.id,
        email: matchedUser.email ?? null,
      };
    }

    if (users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

export async function updateManagedSupabaseUser(input: {
  userId: string;
  email?: string;
  password?: string;
  fullName?: string;
}) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${input.userId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      ...(input.email ? { email: input.email } : {}),
      ...(input.password ? { password: input.password } : {}),
      ...(input.fullName ? { user_metadata: { full_name: input.fullName } } : {}),
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { msg?: string; error_description?: string; message?: string } | null;
    throw AppError.badRequest(payload?.msg ?? payload?.message ?? payload?.error_description ?? "Unable to update managed account");
  }
}

export async function sendPasswordRecoveryEmail(email: string) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/recover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      options: {
        redirectTo: env.AUTH_CALLBACK_URL,
      },
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { msg?: string; error_description?: string } | null;
    throw AppError.badRequest(payload?.msg ?? payload?.error_description ?? "Unable to send password reset email");
  }
}

export async function resendSupabaseVerificationEmail(email: string) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/resend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      type: "signup",
      email,
      options: {
        emailRedirectTo: env.AUTH_CALLBACK_URL,
      },
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { msg?: string; error_description?: string } | null;
    throw AppError.badRequest(payload?.msg ?? payload?.error_description ?? "Unable to resend verification email");
  }
}

export async function updateSupabasePassword(input: { accessToken: string; password: string }) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      password: input.password,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { msg?: string; error_description?: string } | null;
    throw AppError.badRequest(payload?.msg ?? payload?.error_description ?? "Unable to update password");
  }
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
