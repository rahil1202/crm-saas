import { z } from "zod";

import { companyRoleModules } from "@/lib/company-role-modules";

export const roleParamSchema = z.object({
  roleId: z.string().uuid(),
});

export const customRoleModulesSchema = z
  .array(z.enum(companyRoleModules))
  .max(companyRoleModules.length)
  .transform((modules) => [...new Set(modules)]);

export const createCustomRoleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  modules: customRoleModulesSchema,
});

export const updateCustomRoleSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  modules: customRoleModulesSchema.optional(),
});

export type CreateCustomRoleInput = z.infer<typeof createCustomRoleSchema>;
export type UpdateCustomRoleInput = z.infer<typeof updateCustomRoleSchema>;
