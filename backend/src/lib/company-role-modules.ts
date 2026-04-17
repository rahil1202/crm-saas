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
