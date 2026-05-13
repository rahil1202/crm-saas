import crypto from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { connectedEmailAccounts } from "@/db/schema";
import { ok } from "@/lib/api";
import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from "@/lib/integration-crypto";
import type { DisconnectGmailInput, GoogleCallbackQuery } from "@/modules/google/schema";

// ─── Constants ────────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.send",
];

/** State tokens expire after 10 minutes. */
const STATE_TTL_MS = 10 * 60 * 1000;

// ─── HMAC state helpers ───────────────────────────────────────────────────────

/**
 * Derive a signing key from the ACCESS_TOKEN_SECRET so we don't need a
 * separate env var just for OAuth state signing.
 */
function getStateSigningKey(): Buffer {
  return crypto
    .createHash("sha256")
    .update(`gmail-oauth-state:${env.ACCESS_TOKEN_SECRET}`)
    .digest();
}

function signState(payload: string): string {
  const sig = crypto
    .createHmac("sha256", getStateSigningKey())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

function verifyAndExtractState(raw: string): string {
  const lastDot = raw.lastIndexOf(".");
  if (lastDot === -1) {
    throw AppError.badRequest("Invalid OAuth state format");
  }
  const payload = raw.slice(0, lastDot);
  const sig = raw.slice(lastDot + 1);
  const expected = crypto
    .createHmac("sha256", getStateSigningKey())
    .update(payload)
    .digest("base64url");

  // Constant-time comparison to prevent timing attacks
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    throw AppError.badRequest("OAuth state signature mismatch — possible CSRF");
  }
  return payload;
}

// ─── GET /google/connect ──────────────────────────────────────────────────────

/**
 * Generates the Google OAuth authorization URL for Gmail access.
 * Requires the user to be authenticated (requireAuth middleware).
 *
 * Returns: { url: string } — the frontend should redirect the user there.
 */
export async function initiateGmailConnect(c: Context<AppEnv>) {
  const user = c.get("user");

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw AppError.internal(
      "Google OAuth is not configured on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    );
  }

  // Build signed state: base64url(JSON) + HMAC signature
  const statePayload = Buffer.from(
    JSON.stringify({
      userId: user.id,
      nonce: crypto.randomBytes(16).toString("hex"),
      issuedAt: Date.now(),
    }),
  ).toString("base64url");

  const signedState = signState(statePayload);

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", env.GOOGLE_GMAIL_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent"); // force refresh_token on every connect
  authUrl.searchParams.set("state", signedState);

  return ok(c, { url: authUrl.toString() });
}

// ─── GET /google/callback ─────────────────────────────────────────────────────

/**
 * Handles the OAuth callback from Google.
 * Exchanges the authorization code for tokens, fetches the Gmail address,
 * encrypts and upserts the account record, then redirects the user back
 * to the frontend with a success or error indicator.
 */
export async function handleGmailCallback(c: Context<AppEnv>) {
  const query = c.get("validatedQuery") as GoogleCallbackQuery;

  // ── 1. Handle user-denied or error responses from Google ──────────────────
  if (query.error) {
    const reason = encodeURIComponent(query.error_description ?? query.error);
    return c.redirect(`${env.FRONTEND_URL}/settings/integrations?gmail_error=${reason}`);
  }

  if (!query.code || !query.state) {
    return c.redirect(
      `${env.FRONTEND_URL}/settings/integrations?gmail_error=missing_code_or_state`,
    );
  }

  // ── 2. Verify HMAC-signed state ───────────────────────────────────────────
  let stateData: { userId: string; nonce: string; issuedAt: number };
  try {
    const payloadB64 = verifyAndExtractState(query.state);
    stateData = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return c.redirect(
      `${env.FRONTEND_URL}/settings/integrations?gmail_error=invalid_state`,
    );
  }

  // ── 3. Check state TTL ────────────────────────────────────────────────────
  if (Date.now() - stateData.issuedAt > STATE_TTL_MS) {
    return c.redirect(
      `${env.FRONTEND_URL}/settings/integrations?gmail_error=state_expired`,
    );
  }

  const userId = stateData.userId;

  // ── 4. Exchange authorization code for tokens ─────────────────────────────
  let tokenPayload: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: query.code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_GMAIL_REDIRECT_URI,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errBody = (await tokenResponse.json().catch(() => null)) as {
        error?: string;
        error_description?: string;
      } | null;
      console.error("[gmail-oauth] token exchange failed", errBody);
      return c.redirect(
        `${env.FRONTEND_URL}/settings/integrations?gmail_error=token_exchange_failed`,
      );
    }

    tokenPayload = (await tokenResponse.json()) as typeof tokenPayload;
  } catch (err) {
    console.error("[gmail-oauth] token exchange network error", err);
    return c.redirect(
      `${env.FRONTEND_URL}/settings/integrations?gmail_error=token_exchange_failed`,
    );
  }

  if (!tokenPayload.access_token) {
    return c.redirect(
      `${env.FRONTEND_URL}/settings/integrations?gmail_error=no_access_token`,
    );
  }

  // refresh_token is only returned on the first authorization or when
  // prompt=consent is used. We always use prompt=consent so it should
  // always be present, but guard defensively.
  if (!tokenPayload.refresh_token) {
    return c.redirect(
      `${env.FRONTEND_URL}/settings/integrations?gmail_error=no_refresh_token`,
    );
  }

  // ── 5. Fetch the Gmail address from Google userinfo ───────────────────────
  let gmailAddress: string;
  try {
    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
    });

    if (!userInfoResponse.ok) {
      return c.redirect(
        `${env.FRONTEND_URL}/settings/integrations?gmail_error=userinfo_failed`,
      );
    }

    const userInfo = (await userInfoResponse.json()) as { email?: string };
    if (!userInfo.email) {
      return c.redirect(
        `${env.FRONTEND_URL}/settings/integrations?gmail_error=no_email_in_userinfo`,
      );
    }
    gmailAddress = userInfo.email.toLowerCase().trim();
  } catch (err) {
    console.error("[gmail-oauth] userinfo fetch error", err);
    return c.redirect(
      `${env.FRONTEND_URL}/settings/integrations?gmail_error=userinfo_failed`,
    );
  }

  // ── 6. Encrypt tokens and upsert the connected account ───────────────────
  const accessTokenEnc = encryptIntegrationSecret(tokenPayload.access_token);
  const refreshTokenEnc = encryptIntegrationSecret(tokenPayload.refresh_token);
  const tokenExpiry = new Date(Date.now() + tokenPayload.expires_in * 1000);
  const scopes = tokenPayload.scope.split(" ").filter(Boolean);

  try {
    await db
      .insert(connectedEmailAccounts)
      .values({
        userId,
        provider: "google",
        email: gmailAddress,
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiry,
        scopes,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [
          connectedEmailAccounts.userId,
          connectedEmailAccounts.provider,
          connectedEmailAccounts.email,
        ],
        set: {
          accessTokenEnc,
          refreshTokenEnc,
          tokenExpiry,
          scopes,
          isActive: true,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error("[gmail-oauth] db upsert error", err);
    return c.redirect(
      `${env.FRONTEND_URL}/settings/integrations?gmail_error=db_error`,
    );
  }

  // ── 7. Redirect back to the frontend with success ─────────────────────────
  const successEmail = encodeURIComponent(gmailAddress);
  return c.redirect(
    `${env.FRONTEND_URL}/settings/integrations?gmail_connected=${successEmail}`,
  );
}

// ─── GET /google/accounts ─────────────────────────────────────────────────────

/**
 * Lists all connected Gmail accounts for the authenticated user.
 * Tokens are NOT returned — only metadata.
 */
export async function listConnectedGmailAccounts(c: Context<AppEnv>) {
  const user = c.get("user");

  const accounts = await db
    .select({
      id: connectedEmailAccounts.id,
      provider: connectedEmailAccounts.provider,
      email: connectedEmailAccounts.email,
      scopes: connectedEmailAccounts.scopes,
      isActive: connectedEmailAccounts.isActive,
      tokenExpiry: connectedEmailAccounts.tokenExpiry,
      createdAt: connectedEmailAccounts.createdAt,
      updatedAt: connectedEmailAccounts.updatedAt,
    })
    .from(connectedEmailAccounts)
    .where(
      and(
        eq(connectedEmailAccounts.userId, user.id),
        eq(connectedEmailAccounts.provider, "google"),
      ),
    );

  return ok(c, { accounts });
}

// ─── DELETE /google/accounts/:accountId ──────────────────────────────────────

/**
 * Disconnects a Gmail account.
 * Revokes the token at Google and marks the record as inactive.
 */
export async function disconnectGmailAccount(c: Context<AppEnv>) {
  const user = c.get("user");
  const { accountId } = c.req.param();

  const [account] = await db
    .select()
    .from(connectedEmailAccounts)
    .where(
      and(
        eq(connectedEmailAccounts.id, accountId),
        eq(connectedEmailAccounts.userId, user.id),
        eq(connectedEmailAccounts.provider, "google"),
      ),
    )
    .limit(1);

  if (!account) {
    throw AppError.notFound("Connected Gmail account not found");
  }

  // Best-effort token revocation at Google — don't fail if it errors
  try {
    const refreshToken = decryptIntegrationSecret(account.refreshTokenEnc);
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, {
      method: "POST",
    });
  } catch (err) {
    console.warn("[gmail-oauth] token revocation failed (non-fatal)", err);
  }

  // Soft-deactivate the record (preserves audit trail)
  await db
    .update(connectedEmailAccounts)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(connectedEmailAccounts.id, accountId));

  return ok(c, { disconnected: true, accountId });
}
