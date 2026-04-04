import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";

import { app } from "@/app/route";
import { db } from "@/db/client";
import { authSessions, companies, companyInvites, companyMemberships, profiles, referralAttributions, referralCodes, securityAuditLogs, stores } from "@/db/schema";
import { issueSessionTokens } from "@/lib/auth";
import { env } from "@/lib/config";
import { ensureAuthSession } from "@/lib/security";

const cleanupCompanyIds = new Set<string>();
const cleanupUserIds = new Set<string>();
const cleanupSessionIds = new Set<string>();
const originalFetch = globalThis.fetch;
let supabasePublicJwk: JWK | null = null;
let supabasePrivateKey: CryptoKey | null = null;

interface ApiSuccess<T> {
  success: true;
  data: T;
}

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const exported = await exportJWK(publicKey);
  supabasePublicJwk = {
    ...exported,
    alg: "RS256",
    use: "sig",
    kid: "test-supabase-kid",
  };
  supabasePrivateKey = privateKey;
});

function installSupabaseFetchMock(handlers: {
  signup?: (request: Request) => Promise<Response> | Response;
  jwks?: () => Promise<Response> | Response;
}) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = request.url;

    if (url === `${env.SUPABASE_URL}/auth/v1/signup` && handlers.signup) {
      return handlers.signup(request);
    }

    if (url === `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json` && handlers.jwks) {
      return handlers.jwks();
    }

    throw new Error(`Unexpected fetch in test: ${url}`);
  }) as typeof fetch;
}

async function createSupabaseAccessToken(input: { userId: string; email: string }) {
  if (!supabasePrivateKey) {
    throw new Error("Supabase test signing key was not initialized");
  }

  return new SignJWT({
    email: input.email,
    aud: env.SUPABASE_JWT_AUDIENCE,
  })
    .setProtectedHeader({
      alg: "RS256",
      kid: "test-supabase-kid",
    })
    .setIssuer(`${env.SUPABASE_URL}/auth/v1`)
    .setSubject(input.userId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(supabasePrivateKey);
}

async function createAuthedMembership(input: { role: "owner" | "admin" | "member"; emailPrefix: string; email?: string; companyId?: string; storeId?: string | null }) {
  const userId = crypto.randomUUID();
  const email = input.email ?? `${input.emailPrefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  cleanupUserIds.add(userId);

  await db.insert(profiles).values({
    id: userId,
    email,
    fullName: `${input.role} user`,
  });

  let companyId = input.companyId ?? null;
  let storeId = input.storeId ?? null;

  if (!companyId) {
    const [company] = await db
      .insert(companies)
      .values({
        name: `Company ${input.emailPrefix}`,
        timezone: "UTC",
        currency: "USD",
        createdBy: userId,
      })
      .returning();

    companyId = company.id;
    cleanupCompanyIds.add(companyId);

    const [store] = await db
      .insert(stores)
      .values({
        companyId,
        name: `Store ${input.emailPrefix}`,
        code: `S${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        isDefault: true,
      })
      .returning();

    storeId = store.id;
  }

  const [membership] = await db
    .insert(companyMemberships)
    .values({
      companyId,
      userId,
      role: input.role,
      status: "active",
      storeId,
    })
    .returning();

  const sessionId = crypto.randomUUID();
  cleanupSessionIds.add(sessionId);
  const tokens = await issueSessionTokens({
    userId,
    email,
    sessionId,
  });
  await ensureAuthSession({
    sessionId,
    userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ipAddress: "127.0.0.1",
    userAgent: "bun-test",
  });

  return {
    userId,
    email,
    companyId,
    storeId,
    membershipId: membership.id,
    accessToken: tokens.accessToken,
  };
}

afterEach(async () => {
  globalThis.fetch = originalFetch;

  for (const companyId of cleanupCompanyIds) {
    await db.delete(securityAuditLogs).where(eq(securityAuditLogs.companyId, companyId));
  }
  for (const userId of cleanupUserIds) {
    await db.delete(securityAuditLogs).where(eq(securityAuditLogs.userId, userId));
  }

  if (cleanupSessionIds.size > 0) {
    for (const sessionId of cleanupSessionIds) {
      await db.delete(authSessions).where(eq(authSessions.id, sessionId));
    }
  }

  for (const userId of cleanupUserIds) {
    await db.delete(authSessions).where(eq(authSessions.userId, userId));
  }

  for (const companyId of cleanupCompanyIds) {
    await db.delete(companies).where(eq(companies.id, companyId));
  }

  for (const userId of cleanupUserIds) {
    await db.delete(profiles).where(eq(profiles.id, userId));
  }

  cleanupCompanyIds.clear();
  cleanupUserIds.clear();
  cleanupSessionIds.clear();
});

describe("invite + referral route integrations", () => {
  test("admin can create and list invites with referral context, while invite lookup stays public", async () => {
    const admin = await createAuthedMembership({
      role: "admin",
      emailPrefix: "invite-admin",
    });

    const inviteResponse = await app.request("http://localhost/api/v1/auth/invite", {
      method: "POST",
      headers: {
        authorization: `Bearer ${admin.accessToken}`,
        "content-type": "application/json",
        "x-company-id": admin.companyId,
      },
      body: JSON.stringify({
        email: "new.teammate@example.com",
        role: "member",
        storeId: admin.storeId,
        expiresInDays: 7,
        inviteMessage: "Join the workspace",
      }),
    });

    expect(inviteResponse.status).toBe(201);
    const invitePayload = (await inviteResponse.json()) as ApiSuccess<{
      token: string;
      inviteUrl: string;
      referralCode: string;
    }>;
    expect(invitePayload.data.inviteUrl).toContain("inviteToken=");
    expect(invitePayload.data.inviteUrl).toContain("referralCode=");
    expect(invitePayload.data.referralCode).toBeTruthy();

    const inviteLookupResponse = await app.request(`http://localhost/api/v1/auth/invite/${invitePayload.data.token}`);
    expect(inviteLookupResponse.status).toBe(200);
    const inviteLookupPayload = (await inviteLookupResponse.json()) as ApiSuccess<{
      valid: boolean;
      invite: { referralCode: string | null; inviteMessage: string | null } | null;
    }>;
    expect(inviteLookupPayload.data.valid).toBe(true);
    expect(inviteLookupPayload.data.invite?.referralCode).toBe(invitePayload.data.referralCode);
    expect(inviteLookupPayload.data.invite?.inviteMessage).toBe("Join the workspace");

    const listResponse = await app.request("http://localhost/api/v1/auth/invites", {
      headers: {
        authorization: `Bearer ${admin.accessToken}`,
        "x-company-id": admin.companyId,
      },
    });
    expect(listResponse.status).toBe(200);
    const listPayload = (await listResponse.json()) as ApiSuccess<{
      items: Array<{ email: string; referralCode: string | null; inviteUrl: string }>;
    }>;
    expect(listPayload.data.items).toHaveLength(1);
    expect(listPayload.data.items[0]?.email).toBe("new.teammate@example.com");
    expect(listPayload.data.items[0]?.referralCode).toBe(invitePayload.data.referralCode);
    expect(listPayload.data.items[0]?.inviteUrl).toContain(invitePayload.data.token);

    const [storedReferralCode] = await db.select().from(referralCodes).where(eq(referralCodes.code, invitePayload.data.referralCode)).limit(1);
    expect(storedReferralCode?.companyId).toBe(admin.companyId);
  });

  test("admin referral endpoints are tenant-scoped and reject non-admin users", async () => {
    const admin = await createAuthedMembership({
      role: "admin",
      emailPrefix: "ref-admin",
    });
    const member = await createAuthedMembership({
      role: "member",
      emailPrefix: "ref-member",
      companyId: admin.companyId,
      storeId: admin.storeId,
    });

    const createReferralResponse = await app.request("http://localhost/api/v1/auth/referrals", {
      method: "POST",
      headers: {
        authorization: `Bearer ${admin.accessToken}`,
        "content-type": "application/json",
        "x-company-id": admin.companyId,
      },
      body: JSON.stringify({}),
    });

    expect(createReferralResponse.status).toBe(201);
    const createReferralPayload = (await createReferralResponse.json()) as ApiSuccess<{
      referralCode: string;
      referralUrl: string;
    }>;
    expect(createReferralPayload.data.referralUrl).toContain(createReferralPayload.data.referralCode);

    const listReferralResponse = await app.request("http://localhost/api/v1/auth/referrals", {
      headers: {
        authorization: `Bearer ${admin.accessToken}`,
        "x-company-id": admin.companyId,
      },
    });
    expect(listReferralResponse.status).toBe(200);
    const listReferralPayload = (await listReferralResponse.json()) as ApiSuccess<{
      codes: Array<{ code: string }>;
      attributions: Array<unknown>;
    }>;
    expect(listReferralPayload.data.codes.some((item) => item.code === createReferralPayload.data.referralCode)).toBe(true);
    expect(Array.isArray(listReferralPayload.data.attributions)).toBe(true);

    const forbiddenResponse = await app.request("http://localhost/api/v1/auth/referrals", {
      method: "POST",
      headers: {
        authorization: `Bearer ${member.accessToken}`,
        "content-type": "application/json",
        "x-company-id": admin.companyId,
      },
      body: JSON.stringify({}),
    });

    expect(forbiddenResponse.status).toBe(403);
  });

  test("accepting an invite creates membership and joined_company attribution for the invited user", async () => {
    const admin = await createAuthedMembership({
      role: "admin",
      emailPrefix: "accept-admin",
    });

    const invitedEmail = `invited-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const inviteResponse = await app.request("http://localhost/api/v1/auth/invite", {
      method: "POST",
      headers: {
        authorization: `Bearer ${admin.accessToken}`,
        "content-type": "application/json",
        "x-company-id": admin.companyId,
      },
      body: JSON.stringify({
        email: invitedEmail,
        role: "member",
        storeId: admin.storeId,
        expiresInDays: 7,
      }),
    });
    const invitePayload = (await inviteResponse.json()) as ApiSuccess<{ token: string; referralCode: string }>;

    const invited = await createAuthedMembership({
      role: "member",
      emailPrefix: "placeholder",
      email: invitedEmail,
    });

    await db.delete(companyMemberships).where(eq(companyMemberships.id, invited.membershipId));

    const acceptResponse = await app.request("http://localhost/api/v1/auth/accept-invite", {
      method: "POST",
      headers: {
        authorization: `Bearer ${invited.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        token: invitePayload.data.token,
      }),
    });

    expect(acceptResponse.status).toBe(200);

    const [membership] = await db
      .select()
      .from(companyMemberships)
      .where(and(eq(companyMemberships.companyId, admin.companyId), eq(companyMemberships.userId, invited.userId)))
      .limit(1);
    expect(membership?.role).toBe("member");

    const [attribution] = await db
      .select()
      .from(referralAttributions)
      .where(eq(referralAttributions.referredUserId, invited.userId))
      .limit(1);
    expect(attribution?.status).toBe("joined_company");

    const [auditLog] = await db
      .select()
      .from(securityAuditLogs)
      .where(and(eq(securityAuditLogs.companyId, admin.companyId), eq(securityAuditLogs.userId, invited.userId)))
      .limit(1);
    expect(auditLog?.action).toBe("auth.accept_invite");
  });

  test("register route records referral attribution after mocked Supabase signup", async () => {
    const admin = await createAuthedMembership({
      role: "admin",
      emailPrefix: "register-admin",
    });

    const referredUserId = crypto.randomUUID();
    const referredEmail = `register-${crypto.randomUUID().slice(0, 8)}@example.com`;
    cleanupUserIds.add(referredUserId);
    const [referralCode] = await db
      .insert(referralCodes)
      .values({
        companyId: admin.companyId,
        referrerUserId: admin.userId,
        code: `REG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      })
      .returning();

    installSupabaseFetchMock({
      signup: async () =>
        new Response(
          JSON.stringify({
            user: {
              id: referredUserId,
              email: referredEmail,
            },
            session: null,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
    });

    const registerResponse = await app.request("http://localhost/api/v1/auth/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fullName: "Referred Person",
        email: referredEmail,
        password: "ValidPass123!",
        confirmPassword: "ValidPass123!",
        referralCode: referralCode.code,
      }),
    });

    expect(registerResponse.status).toBe(201);
    const registerPayload = (await registerResponse.json()) as ApiSuccess<{
      registered: boolean;
      referralCaptured: boolean;
      emailConfirmationRequired: boolean;
    }>;
    expect(registerPayload.data.registered).toBe(true);
    expect(registerPayload.data.referralCaptured).toBe(true);
    expect(registerPayload.data.emailConfirmationRequired).toBe(true);

    const [attribution] = await db
      .select()
      .from(referralAttributions)
      .where(eq(referralAttributions.referredUserId, referredUserId))
      .limit(1);
    expect(attribution?.status).toBe("registered");
    expect(attribution?.companyId).toBe(admin.companyId);
  });

  test("exchange-supabase accepts invite and upgrades referral attribution after mocked token verification", async () => {
    const admin = await createAuthedMembership({
      role: "admin",
      emailPrefix: "exchange-admin",
    });

    const invitedUserId = crypto.randomUUID();
    const invitedEmail = `exchange-${crypto.randomUUID().slice(0, 8)}@example.com`;
    cleanupUserIds.add(invitedUserId);

    const inviteResponse = await app.request("http://localhost/api/v1/auth/invite", {
      method: "POST",
      headers: {
        authorization: `Bearer ${admin.accessToken}`,
        "content-type": "application/json",
        "x-company-id": admin.companyId,
      },
      body: JSON.stringify({
        email: invitedEmail,
        role: "member",
        storeId: admin.storeId,
        expiresInDays: 7,
      }),
    });
    const invitePayload = (await inviteResponse.json()) as ApiSuccess<{ token: string; referralCode: string }>;
    const supabaseAccessToken = await createSupabaseAccessToken({
      userId: invitedUserId,
      email: invitedEmail,
    });

    installSupabaseFetchMock({
      jwks: async () =>
        new Response(
          JSON.stringify({
            keys: supabasePublicJwk ? [supabasePublicJwk] : [],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
    });

    const exchangeResponse = await app.request("http://localhost/api/v1/auth/exchange-supabase", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        supabaseAccessToken,
        inviteToken: invitePayload.data.token,
        referralCode: invitePayload.data.referralCode,
      }),
    });

    expect(exchangeResponse.status).toBe(200);
    const exchangePayload = (await exchangeResponse.json()) as ApiSuccess<{
      authenticated: boolean;
      inviteAccepted: boolean;
      inviteError: string | null;
    }>;
    expect(exchangePayload.data.authenticated).toBe(true);
    expect(exchangePayload.data.inviteAccepted).toBe(true);
    expect(exchangePayload.data.inviteError).toBeNull();

    const [membership] = await db
      .select()
      .from(companyMemberships)
      .where(and(eq(companyMemberships.companyId, admin.companyId), eq(companyMemberships.userId, invitedUserId)))
      .limit(1);
    expect(membership?.role).toBe("member");

    const [attribution] = await db
      .select()
      .from(referralAttributions)
      .where(eq(referralAttributions.referredUserId, invitedUserId))
      .limit(1);
    expect(attribution?.status).toBe("joined_company");

    const [session] = await db
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, invitedUserId))
      .limit(1);
    expect(session?.status).toBe("active");
  });
});
