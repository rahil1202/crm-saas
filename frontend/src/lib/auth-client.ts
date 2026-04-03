import { getFrontendEnv } from "@/lib/env";

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

export async function fetchAuthMe() {
  const env = getFrontendEnv();
  const response = await fetch(`${env.apiUrl}/api/v1/auth/me`, {
    credentials: "include",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { data?: AuthMePayload };
  return payload.data ?? null;
}

export async function resolveAuthenticatedRoute() {
  const me = await fetchAuthMe();
  if (!me) {
    return "/dashboard";
  }

  return me.needsOnboarding && !me.isSuperAdmin ? "/onboarding" : "/dashboard";
}
