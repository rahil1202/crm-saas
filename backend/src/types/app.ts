export type CompanyRole = "owner" | "admin" | "member";
export type CompanyModuleKey =
  | "contacts"
  | "leads"
  | "deals"
  | "forms"
  | "templates"
  | "teams"
  | "tasks"
  | "meetings"
  | "campaigns"
  | "reports"
  | "settings"
  | "social"
  | "automation"
  | "partners"
  | "documents"
  | "notifications"
  | "integrations";

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
  customRoleId: string | null;
  customRoleModules: CompanyModuleKey[];
}

export interface AppVariables {
  requestId: string;
  clientIp: string;
  userAgent: string | null;
  user: AuthUser;
  tenant: TenantContext;
  validatedBody: unknown;
  validatedQuery: unknown;
  rawBody: string;
}
