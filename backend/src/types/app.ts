export type CompanyRole = "owner" | "admin" | "member";

export interface AuthUser {
  id: string;
  email: string | null;
  sessionId: string;
  isSuperAdmin?: boolean;
}

export interface TenantContext {
  companyId: string;
  membershipId: string;
  role: CompanyRole;
  storeId: string | null;
}

export interface AppVariables {
  requestId: string;
  user: AuthUser;
  tenant: TenantContext;
  validatedBody: unknown;
  validatedQuery: unknown;
}
