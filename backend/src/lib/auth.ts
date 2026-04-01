import { createRemoteJWKSet, jwtVerify } from "jose";

import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";

const jwks = createRemoteJWKSet(new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

export interface VerifiedAccessToken {
  userId: string;
  email: string | null;
  rawToken: string;
}

export async function verifySupabaseAccessToken(token: string): Promise<VerifiedAccessToken> {
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
      rawToken: token,
    };
  } catch {
    throw AppError.unauthorized("Invalid or expired access token");
  }
}
