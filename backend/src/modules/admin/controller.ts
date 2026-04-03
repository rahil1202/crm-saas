import { and, count, desc, eq, ilike, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { companies, companyMemberships, companyPlans, superAdmins } from "@/db/schema";
import { ok } from "@/lib/api";
import type { ListAdminCompaniesQuery } from "@/modules/admin/schema";

export async function getAdminSummary(c: Context<AppEnv>) {
  const [companyCount, activePlanCount, superAdminCount] = await Promise.all([
    db.select({ count: count() }).from(companies).where(isNull(companies.deletedAt)),
    db.select({ count: count() }).from(companyPlans).where(eq(companyPlans.status, "active")),
    db.select({ count: count() }).from(superAdmins).where(eq(superAdmins.isActive, true)),
  ]);

  return ok(c, {
    companies: companyCount[0]?.count ?? 0,
    activePlans: activePlanCount[0]?.count ?? 0,
    superAdmins: superAdminCount[0]?.count ?? 0,
  });
}

export async function listAdminCompanies(c: Context<AppEnv>) {
  const query = c.get("validatedQuery") as ListAdminCompaniesQuery;

  const conditions = [isNull(companies.deletedAt)];
  if (query.q) {
    conditions.push(ilike(companies.name, `%${query.q}%`));
  }

  const where = and(...conditions);
  const items = await db
    .select({
      id: companies.id,
      name: companies.name,
      timezone: companies.timezone,
      currency: companies.currency,
      createdAt: companies.createdAt,
      planCode: companyPlans.planCode,
      planName: companyPlans.planName,
      planStatus: companyPlans.status,
      billingInterval: companyPlans.billingInterval,
      seatLimit: companyPlans.seatLimit,
      monthlyPrice: companyPlans.monthlyPrice,
    })
    .from(companies)
    .leftJoin(companyPlans, eq(companyPlans.companyId, companies.id))
    .where(where)
    .orderBy(desc(companies.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  const filteredItems = query.status ? items.filter((item) => item.planStatus === query.status) : items;

  const memberCounts = await db
    .select({
      companyId: companyMemberships.companyId,
      total: count(),
    })
    .from(companyMemberships)
    .where(and(isNull(companyMemberships.deletedAt), eq(companyMemberships.status, "active")))
    .groupBy(companyMemberships.companyId);

  const countMap = new Map(memberCounts.map((row) => [row.companyId, row.total]));

  return ok(c, {
    items: filteredItems.map((item) => ({
      ...item,
      activeMembers: countMap.get(item.id) ?? 0,
    })),
    total: filteredItems.length,
    limit: query.limit,
    offset: query.offset,
  });
}
