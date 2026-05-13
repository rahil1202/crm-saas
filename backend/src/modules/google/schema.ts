import { z } from "zod";

// ─── OAuth state ──────────────────────────────────────────────────────────────

/**
 * Opaque state blob encoded as base64url in the OAuth redirect.
 * Carries the authenticated user's ID so the callback can associate
 * the incoming tokens with the right profile — without relying on a
 * server-side session store.
 *
 * The state is HMAC-signed in the controller to prevent CSRF / forgery.
 */
export const oauthStateSchema = z.object({
  userId: z.string().uuid(),
  nonce: z.string().min(16),
  issuedAt: z.number().int(),
});

export type OAuthState = z.infer<typeof oauthStateSchema>;

// ─── Callback query params ────────────────────────────────────────────────────

export const googleCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export type GoogleCallbackQuery = z.infer<typeof googleCallbackQuerySchema>;

// ─── Disconnect body ──────────────────────────────────────────────────────────

export const disconnectGmailSchema = z.object({
  accountId: z.string().uuid(),
});

export type DisconnectGmailInput = z.infer<typeof disconnectGmailSchema>;
