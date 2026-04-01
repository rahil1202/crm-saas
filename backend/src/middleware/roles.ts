import type { CompanyRole } from "@/types/app";

const roleOrder: Record<CompanyRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

export function hasMinimumRole(actualRole: CompanyRole, minimumRole: CompanyRole) {
  return roleOrder[actualRole] >= roleOrder[minimumRole];
}
