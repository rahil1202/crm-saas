export const companyRoleModules = [
  "contacts",
  "leads",
  "deals",
  "templates",
  "teams",
  "tasks",
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
  "contacts",
  "leads",
  "deals",
  "tasks",
  "templates",
  "campaigns",
  "reports",
  "documents",
  "integrations",
];

export function mergeCompanyRoleModules(modules: readonly CompanyRoleModule[]) {
  return [...new Set(modules)] as CompanyRoleModule[];
}
