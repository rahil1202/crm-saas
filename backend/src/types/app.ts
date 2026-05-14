export type CompanyRole = "owner" | "admin" | "member";
export type CompanyModuleKey =
  | "outreach"
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
  | "integrations"
  | "whatsapp-crm"
  | "whatsapp-integrations"
  | "whatsapp-inbox"
  | "whatsapp-contacts"
  | "whatsapp-campaigns"
  | "whatsapp-templates"
  | "whatsapp-flow-builder"
  | "whatsapp-analytics"
  | "whatsapp-settings";

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
