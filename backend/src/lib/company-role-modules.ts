export const companyRoleModules = [
  "outreach",
  "contacts",
  "leads",
  "deals",
  "forms",
  "templates",
  "teams",
  "tasks",
  "meetings",
  "campaigns",
  "reports",
  "settings",
  "social",
  "automation",
  "partners",
  "documents",
  "notifications",
  "integrations",
  "whatsapp-crm",
  "whatsapp-integrations",
  "whatsapp-inbox",
  "whatsapp-contacts",
  "whatsapp-campaigns",
  "whatsapp-templates",
  "whatsapp-flow-builder",
  "whatsapp-analytics",
  "whatsapp-settings",
] as const;

export type CompanyRoleModule = (typeof companyRoleModules)[number];

export const partnerRoleModules: CompanyRoleModule[] = [
  "outreach",
  "contacts",
  "leads",
  "deals",
  "forms",
  "tasks",
  "meetings",
  "templates",
  "campaigns",
  "reports",
  "documents",
  "integrations",
  "whatsapp-crm",
  "whatsapp-inbox",
  "whatsapp-contacts",
];

export function mergeCompanyRoleModules(modules: readonly CompanyRoleModule[]) {
  return [...new Set(modules)] as CompanyRoleModule[];
}
