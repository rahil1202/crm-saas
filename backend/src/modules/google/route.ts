import { Hono } from "hono";

import type { AppEnv } from "@/app/route";
import {
  disconnectGmailAccount,
  handleGmailCallback,
  initiateGmailConnect,
  listConnectedGmailAccounts,
} from "@/modules/google/controller";
import { googleCallbackQuerySchema } from "@/modules/google/schema";
import { requireAuth } from "@/middleware/auth";
import { validateQuery } from "@/middleware/common";
import { rateLimit } from "@/middleware/security";
import { routePolicies } from "@/lib/security";

export const googleRoutes = new Hono<AppEnv>().basePath("/google");

/**
 * GET /api/v1/google/connect
 * Returns the Google OAuth authorization URL for Gmail access.
 * The frontend should redirect the user to this URL.
 */
googleRoutes.get("/connect", requireAuth, rateLimit(routePolicies.tenantWrite), initiateGmailConnect);

/**
 * GET /api/v1/google/callback
 * OAuth redirect target registered in the Google Cloud Console.
 * Exchanges the authorization code, stores encrypted tokens, then
 * redirects the browser back to the frontend.
 *
 * NOTE: This route does NOT use requireAuth — the user identity is
 * carried in the HMAC-signed `state` parameter instead, because the
 * browser arrives here directly from Google (no cookie / Bearer token).
 */
googleRoutes.get(
  "/callback",
  validateQuery(googleCallbackQuerySchema),
  handleGmailCallback,
);

/**
 * GET /api/v1/google/accounts
 * Lists connected Gmail accounts for the authenticated user (no tokens returned).
 */
googleRoutes.get("/accounts", requireAuth, listConnectedGmailAccounts);

/**
 * DELETE /api/v1/google/accounts/:accountId
 * Revokes and disconnects a Gmail account.
 */
googleRoutes.delete(
  "/accounts/:accountId",
  requireAuth,
  rateLimit(routePolicies.tenantWrite),
  disconnectGmailAccount,
);
