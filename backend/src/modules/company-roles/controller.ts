import { and, asc, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { companyCustomRoles, companyMemberships } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { roleParamSchema } from "@/modules/company-roles/schema";
import type { CreateCustomRoleInput, UpdateCustomRoleInput } from "@/modules/company-roles/schema";

const defaultCompanyRoles: Array<{ name: string; modules: string[] }> = [
  {
    name: "Owner",
    modules: ["contacts", "leads", "deals", "templates", "teams", "tasks", "campaigns", "reports", "settings", "social", "automation", "partners", "documents", "notifications", "integrations"],
  },
  {
    name: "Admin",
    modules: ["contacts", "leads", "deals", "templates", "teams", "tasks", "campaigns", "reports", "settings", "social", "automation", "partners", "documents", "notifications", "integrations"],
  },
  {
    name: "Sub-Admin",
    modules: ["contacts", "leads", "deals", "templates", "teams", "tasks", "campaigns", "reports", "settings", "documents", "notifications"],
  },
  {
    name: "Sales Team",
    modules: ["contacts", "leads", "deals", "tasks", "reports", "documents"],
  },
  {
    name: "Employee",
    modules: ["contacts", "leads", "tasks", "documents"],
  },
  {
    name: "Partner",
    modules: ["contacts", "leads", "deals", "documents", "reports"],
  },
];

async function findRoleOrThrow(companyId: string, roleId: string) {
  const [role] = await db
    .select()
    .from(companyCustomRoles)
    .where(and(eq(companyCustomRoles.id, roleId), eq(companyCustomRoles.companyId, companyId), isNull(companyCustomRoles.deletedAt)))
    .limit(1);

  if (!role) {
    throw AppError.notFound("Custom role not found");
  }

  return role;
}

export async function listCompanyCustomRoles(c: Context<AppEnv>) {
  const tenant = c.get("tenant");

  let roles = await db
    .select({
      id: companyCustomRoles.id,
      name: companyCustomRoles.name,
      modules: companyCustomRoles.modules,
      createdBy: companyCustomRoles.createdBy,
      createdAt: companyCustomRoles.createdAt,
      updatedAt: companyCustomRoles.updatedAt,
    })
    .from(companyCustomRoles)
    .where(and(eq(companyCustomRoles.companyId, tenant.companyId), isNull(companyCustomRoles.deletedAt)))
    .orderBy(asc(companyCustomRoles.createdAt));

  if (roles.length === 0) {
    await db.insert(companyCustomRoles).values(
      defaultCompanyRoles.map((role) => ({
        companyId: tenant.companyId,
        name: role.name,
        modules: role.modules,
      })),
    );

    roles = await db
      .select({
        id: companyCustomRoles.id,
        name: companyCustomRoles.name,
        modules: companyCustomRoles.modules,
        createdBy: companyCustomRoles.createdBy,
        createdAt: companyCustomRoles.createdAt,
        updatedAt: companyCustomRoles.updatedAt,
      })
      .from(companyCustomRoles)
      .where(and(eq(companyCustomRoles.companyId, tenant.companyId), isNull(companyCustomRoles.deletedAt)))
      .orderBy(asc(companyCustomRoles.createdAt));
  }

  return ok(c, { roles });
}

export async function createCompanyCustomRole(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateCustomRoleInput;

  const [existing] = await db
    .select({ id: companyCustomRoles.id })
    .from(companyCustomRoles)
    .where(and(eq(companyCustomRoles.companyId, tenant.companyId), eq(companyCustomRoles.name, body.name), isNull(companyCustomRoles.deletedAt)))
    .limit(1);

  if (existing) {
    throw AppError.conflict("A role with this name already exists");
  }

  const [role] = await db
    .insert(companyCustomRoles)
    .values({
      companyId: tenant.companyId,
      name: body.name,
      modules: body.modules,
      createdBy: user.id,
    })
    .returning();

  return ok(c, { role }, 201);
}

export async function updateCompanyCustomRole(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = roleParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateCustomRoleInput;

  if (!body.name && !body.modules) {
    throw AppError.badRequest("At least one field must be provided");
  }

  const role = await findRoleOrThrow(tenant.companyId, params.roleId);

  const nextName = body.name ?? role.name;
  const nextModules = body.modules ?? role.modules;

  if (nextName !== role.name) {
    const [nameConflict] = await db
      .select({ id: companyCustomRoles.id })
      .from(companyCustomRoles)
      .where(
        and(
          eq(companyCustomRoles.companyId, tenant.companyId),
          eq(companyCustomRoles.name, nextName),
          isNull(companyCustomRoles.deletedAt),
        ),
      )
      .limit(1);

    if (nameConflict) {
      throw AppError.conflict("A role with this name already exists");
    }
  }

  const [updatedRole] = await db
    .update(companyCustomRoles)
    .set({
      name: nextName,
      modules: nextModules,
      updatedAt: new Date(),
    })
    .where(eq(companyCustomRoles.id, role.id))
    .returning();

  return ok(c, { role: updatedRole });
}

export async function deleteCompanyCustomRole(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = roleParamSchema.parse(c.req.param());
  const role = await findRoleOrThrow(tenant.companyId, params.roleId);

  await db
    .update(companyMemberships)
    .set({ customRoleId: null, updatedAt: new Date() })
    .where(and(eq(companyMemberships.companyId, tenant.companyId), eq(companyMemberships.customRoleId, role.id), isNull(companyMemberships.deletedAt)));

  await db
    .update(companyCustomRoles)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(companyCustomRoles.id, role.id));

  return ok(c, { deleted: true });
}
