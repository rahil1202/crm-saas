import { getFrontendEnv } from "@/lib/env";
import { resolveAuthenticatedRouteFromMe } from "@/lib/partner-access";

export interface AuthMePayload {
  needsOnboarding: boolean;
  isSuperAdmin: boolean;
  user: {
    id: string;
    email: string | null;
    fullName: string | null;
    isSuperAdmin?: boolean;
  };
  memberships?: Array<{
    membershipId: string;
    companyId: string;
    role: string;
    status: string;
    storeId: string | null;
    customRoleId?: string | null;
    customRoleName?: string | null;
    customRoleModules?: string[];
    isPartnerAccess?: boolean;
    partnerCompanyId?: string | null;
    partnerCompanyName?: string | null;
    companyName: string;
    storeName: string | null;
  }>;
}

export async function readApiError(response: Response, fallback: string) {
  try {
    const json = (await response.json()) as { error?: { message?: string } };
    return json.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Fetch the current authenticated user from the backend.
 * Returns null on any error — network failure, 401, 5xx, etc.
 * Never throws.
 */
export async function fetchAuthMe(): Promise<AuthMePayload | null> {
  try {
    const env = getFrontendEnv();
    const response = await fetch(`${env.apiUrl}/api/v1/auth/me`, {
      credentials: "include",
      signal: AbortSignal.timeout(8000), // 8s timeout — don't hang the login page
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { data?: AuthMePayload };
    return payload.data ?? null;
  } catch {
    // Network error, backend down, CORS, timeout — treat as unauthenticated
    return null;
  }
}

export async function resolveAuthenticatedRoute() {
  const me = await fetchAuthMe();
  if (!me) {
    return "/dashboard";
  }

  return resolveAuthenticatedRouteFromMe(me);
}
