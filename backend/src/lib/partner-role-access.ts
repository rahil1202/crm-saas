import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { companyCustomRoles, companyMemberships, partnerUsers } from "@/db/schema";
import { mergeCompanyRoleModules, partnerRoleModules } from "@/lib/company-role-modules";
import type { CompanyModuleKey } from "@/types/app";

export async function ensurePartnerCustomRole(companyId: string, createdBy: string) {
  const [existing] = await db
    .select({ id: companyCustomRoles.id, modules: companyCustomRoles.modules })
    .from(companyCustomRoles)
    .where(and(eq(companyCustomRoles.companyId, companyId), eq(companyCustomRoles.name, "Partner"), isNull(companyCustomRoles.deletedAt)))
    .limit(1);

  if (existing) {
    const nextModules = mergeCompanyRoleModules([
      ...((existing.modules ?? []) as CompanyModuleKey[]),
      ...partnerRoleModules,
    ]);

    const hasModuleDrift =
      nextModules.length !== (existing.modules?.length ?? 0) ||
      nextModules.some((moduleKey, index) => moduleKey !== existing.modules?.[index]);

    if (hasModuleDrift) {
      await db
        .update(companyCustomRoles)
        .set({
          modules: nextModules,
          updatedAt: new Date(),
        })
        .where(eq(companyCustomRoles.id, existing.id));
    }

    return existing.id;
  }

  const [created] = await db
    .insert(companyCustomRoles)
    .values({
      companyId,
      name: "Partner",
      modules: partnerRoleModules,
      createdBy,
    })
    .returning({ id: companyCustomRoles.id });

  return created.id;
}

export async function ensurePartnerMembershipAssignmentsForUser(userId: string, companyId?: string | null) {
  const partnerAccessRows = await db
    .select({ companyId: partnerUsers.companyId })
    .from(partnerUsers)
    .where(
      and(
        eq(partnerUsers.authUserId, userId),
        eq(partnerUsers.status, "active"),
        isNull(partnerUsers.deletedAt),
        companyId ? eq(partnerUsers.companyId, companyId) : undefined,
      ),
    );

  if (partnerAccessRows.length === 0) {
    return;
  }

  for (const access of partnerAccessRows) {
    const partnerRoleId = await ensurePartnerCustomRole(access.companyId, userId);

    await db
      .insert(companyMemberships)
      .values({
        companyId: access.companyId,
        userId,
        role: "member",
        customRoleId: partnerRoleId,
        status: "active",
      })
      .onConflictDoUpdate({
        target: [companyMemberships.companyId, companyMemberships.userId],
        set: {
          role: "member",
          customRoleId: partnerRoleId,
          status: "active",
          deletedAt: null,
          updatedAt: new Date(),
        },
      });
  }
}
