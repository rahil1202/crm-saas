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
];

export function mergeCompanyRoleModules(modules: readonly CompanyRoleModule[]) {
  return [...new Set(modules)] as CompanyRoleModule[];
}
