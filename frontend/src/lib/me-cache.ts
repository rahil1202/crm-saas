import { apiRequest } from "@/lib/api";

type CompanyRole = "owner" | "admin" | "member";

interface Membership {
  membershipId: string;
  companyId: string;
  role: CompanyRole;
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
}

export interface MeResponse {
  isSuperAdmin: boolean;
  user: {
    id: string;
    email: string | null;
    fullName: string | null;
    isSuperAdmin?: boolean;
  };
  memberships: Membership[];
  needsOnboarding: boolean;
}

let cachedMe: MeResponse | null = null;
let inFlight: Promise<MeResponse> | null = null;

export function getCachedMe() {
  return cachedMe;
}

export function clearCachedMe() {
  cachedMe = null;
  inFlight = null;
}

export async function loadMe() {
  if (cachedMe) {
    return cachedMe;
  }

  if (!inFlight) {
    inFlight = apiRequest<MeResponse>("/auth/me").then((response) => {
      cachedMe = response;
      inFlight = null;
      return response;
    });
  }

  return inFlight;
}
