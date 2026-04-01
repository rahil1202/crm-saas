export const workspaceSchema = {
  meta: {
    workspace: "crm-saas/backend",
    product: "crm-saas",
  },
  modules: [
    "auth",
    "companies",
    "users",
    "customers",
    "leads",
    "deals",
    "tasks",
    "partners",
    "campaigns",
    "templates",
    "automation",
    "reports",
    "notifications",
    "settings",
  ],
} as const;
