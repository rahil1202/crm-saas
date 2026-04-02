import { and, count, desc, eq, ilike, isNull } from "drizzle-orm";
import type { Context } from "hono";

import type { AppEnv } from "@/app/route";
import { db } from "@/db/client";
import { campaignCustomers, campaigns, customers, deals, leads, tasks } from "@/db/schema";
import { ok } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { customerParamSchema } from "@/modules/customers/schema";
import type { CreateCustomerInput, ListCustomersQuery, UpdateCustomerInput } from "@/modules/customers/schema";

export async function listCustomers(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const query = c.get("validatedQuery") as ListCustomersQuery;

  const conditions = [eq(customers.companyId, tenant.companyId), isNull(customers.deletedAt)];
  if (query.q) {
    conditions.push(ilike(customers.fullName, `%${query.q}%`));
  }
  if (query.email) {
    conditions.push(eq(customers.email, query.email));
  }

  const where = and(...conditions);

  const [items, totalRows] = await Promise.all([
    db.select().from(customers).where(where).orderBy(desc(customers.createdAt)).limit(query.limit).offset(query.offset),
    db.select({ count: count() }).from(customers).where(where),
  ]);

  return ok(c, {
    items,
    total: totalRows[0]?.count ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function getCustomerHistory(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = customerParamSchema.parse(c.req.param());

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, params.customerId), eq(customers.companyId, tenant.companyId), isNull(customers.deletedAt)))
    .limit(1);

  if (!customer) {
    throw AppError.notFound("Customer not found");
  }

  const [lead, customerDeals, customerTasks, customerCampaigns] = await Promise.all([
    customer.leadId
      ? db
          .select()
          .from(leads)
          .where(and(eq(leads.id, customer.leadId), eq(leads.companyId, tenant.companyId), isNull(leads.deletedAt)))
          .limit(1)
          .then((items) => items[0] ?? null)
      : Promise.resolve(null),
    db
      .select()
      .from(deals)
      .where(and(eq(deals.companyId, tenant.companyId), eq(deals.customerId, customer.id), isNull(deals.deletedAt)))
      .orderBy(desc(deals.createdAt)),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.companyId, tenant.companyId), eq(tasks.customerId, customer.id), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.createdAt)),
    db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        channel: campaigns.channel,
        status: campaigns.status,
        scheduledAt: campaigns.scheduledAt,
        createdAt: campaigns.createdAt,
      })
      .from(campaignCustomers)
      .innerJoin(campaigns, eq(campaigns.id, campaignCustomers.campaignId))
      .where(and(eq(campaignCustomers.companyId, tenant.companyId), eq(campaignCustomers.customerId, customer.id), isNull(campaigns.deletedAt)))
      .orderBy(desc(campaigns.createdAt)),
  ]);

  return ok(c, {
    customer,
    lead,
    deals: customerDeals,
    tasks: customerTasks,
    campaigns: customerCampaigns,
    summary: {
      openDeals: customerDeals.filter((deal) => deal.status === "open").length,
      wonDeals: customerDeals.filter((deal) => deal.status === "won").length,
      pendingTasks: customerTasks.filter((task) => task.status !== "done").length,
      completedTasks: customerTasks.filter((task) => task.status === "done").length,
      campaigns: customerCampaigns.length,
    },
  });
}

export async function createCustomer(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const user = c.get("user");
  const body = c.get("validatedBody") as CreateCustomerInput;

  const [created] = await db
    .insert(customers)
    .values({
      companyId: tenant.companyId,
      storeId: body.storeId ?? tenant.storeId ?? null,
      leadId: body.leadId ?? null,
      fullName: body.fullName,
      email: body.email ?? null,
      phone: body.phone ?? null,
      tags: body.tags,
      notes: body.notes ?? null,
      createdBy: user.id,
    })
    .returning();

  return ok(c, created, 201);
}

export async function updateCustomer(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = customerParamSchema.parse(c.req.param());
  const body = c.get("validatedBody") as UpdateCustomerInput;

  if (Object.keys(body).length === 0) {
    throw AppError.badRequest("At least one field is required for update");
  }

  const [updated] = await db
    .update(customers)
    .set({
      ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
      ...(body.email !== undefined ? { email: body.email ?? null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone ?? null } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      ...(body.leadId !== undefined ? { leadId: body.leadId ?? null } : {}),
      ...(body.storeId !== undefined ? { storeId: body.storeId ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(customers.id, params.customerId), eq(customers.companyId, tenant.companyId), isNull(customers.deletedAt)))
    .returning();

  if (!updated) {
    throw AppError.notFound("Customer not found");
  }

  return ok(c, updated);
}

export async function deleteCustomer(c: Context<AppEnv>) {
  const tenant = c.get("tenant");
  const params = customerParamSchema.parse(c.req.param());

  const [deleted] = await db
    .update(customers)
    .set({ updatedAt: new Date(), deletedAt: new Date() })
    .where(and(eq(customers.id, params.customerId), eq(customers.companyId, tenant.companyId), isNull(customers.deletedAt)))
    .returning({ id: customers.id });

  if (!deleted) {
    throw AppError.notFound("Customer not found");
  }

  return ok(c, { deleted: true, id: deleted.id });
}
