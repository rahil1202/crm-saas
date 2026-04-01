import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { companies, companyMemberships, customers, deals, leads, profiles, stores, tasks } from "@/db/schema";

const ownerId = "11111111-1111-1111-1111-111111111111";
const adminId = "22222222-2222-2222-2222-222222222222";
const memberId = "33333333-3333-3333-3333-333333333333";

async function run() {
  await db
    .insert(profiles)
    .values([
      { id: ownerId, email: "owner@example.com", fullName: "Owner User" },
      { id: adminId, email: "admin@example.com", fullName: "Admin User" },
      { id: memberId, email: "member@example.com", fullName: "Member User" },
    ])
    .onConflictDoNothing();

  const [company] = await db
    .insert(companies)
    .values({
      name: "Acme CRM Demo",
      timezone: "Asia/Kolkata",
      currency: "INR",
      createdBy: ownerId,
    })
    .onConflictDoNothing()
    .returning();

  const companyId =
    company?.id ??
    (
      await db.query.companies.findFirst({
        where: (table, { and: whereAnd, eq: whereEq, isNull: whereIsNull }) =>
          whereAnd(whereEq(table.name, "Acme CRM Demo"), whereIsNull(table.deletedAt)),
      })
    )?.id;

  if (!companyId) {
    throw new Error("Could not resolve seeded company");
  }

  const [defaultStore] = await db
    .insert(stores)
    .values({
      companyId,
      name: "Head Office",
      code: "HQ",
      isDefault: true,
    })
    .onConflictDoNothing()
    .returning();

  const storeId =
    defaultStore?.id ??
    (
      await db.query.stores.findFirst({
        where: (table, { and: whereAnd, eq: whereEq, isNull: whereIsNull }) =>
          whereAnd(whereEq(table.companyId, companyId), whereEq(table.code, "HQ"), whereIsNull(table.deletedAt)),
      })
    )?.id;

  if (!storeId) {
    throw new Error("Could not resolve seeded store");
  }

  await db
    .insert(companyMemberships)
    .values([
      { companyId, userId: ownerId, role: "owner", status: "active", storeId },
      { companyId, userId: adminId, role: "admin", status: "active", storeId },
      { companyId, userId: memberId, role: "member", status: "active", storeId },
    ])
    .onConflictDoNothing();

  const existingLead = await db.query.leads.findFirst({
    where: (table, { and: whereAnd, eq: whereEq, isNull: whereIsNull }) =>
      whereAnd(whereEq(table.companyId, companyId), whereEq(table.title, "Inbound website inquiry"), whereIsNull(table.deletedAt)),
  });

  const lead =
    existingLead ??
    (
      await db
        .insert(leads)
        .values({
          companyId,
          storeId,
          createdBy: ownerId,
          assignedToUserId: adminId,
          title: "Inbound website inquiry",
          fullName: "Priya Sharma",
          email: "priya.sharma@example.com",
          phone: "+919999999999",
          source: "website",
          status: "new",
          score: 35,
          notes: "Requested pricing details for enterprise plan",
          tags: ["inbound", "pricing"],
        })
        .returning()
    )[0];

  const existingCustomer = await db.query.customers.findFirst({
    where: (table, { and: whereAnd, eq: whereEq, isNull: whereIsNull }) =>
      whereAnd(whereEq(table.companyId, companyId), whereEq(table.email, "priya.sharma@example.com"), whereIsNull(table.deletedAt)),
  });

  const customer =
    existingCustomer ??
    (
      await db
        .insert(customers)
        .values({
          companyId,
          storeId,
          leadId: lead.id,
          fullName: "Priya Sharma",
          email: "priya.sharma@example.com",
          phone: "+919999999999",
          tags: ["priority"],
          notes: "Converted to managed customer profile",
          createdBy: ownerId,
        })
        .returning()
    )[0];

  const existingDeal = await db.query.deals.findFirst({
    where: (table, { and: whereAnd, eq: whereEq, isNull: whereIsNull }) =>
      whereAnd(whereEq(table.companyId, companyId), whereEq(table.title, "Enterprise plan proposal"), whereIsNull(table.deletedAt)),
  });

  const deal =
    existingDeal ??
    (
      await db
        .insert(deals)
        .values({
          companyId,
          storeId,
          customerId: customer.id,
          leadId: lead.id,
          assignedToUserId: adminId,
          title: "Enterprise plan proposal",
          pipeline: "default",
          stage: "proposal",
          status: "open",
          value: 250000,
          notes: "Awaiting budget approval",
          createdBy: ownerId,
        })
        .returning()
    )[0];

  const existingTask = await db.query.tasks.findFirst({
    where: (table, { and: whereAnd, eq: whereEq, isNull: whereIsNull }) =>
      whereAnd(whereEq(table.companyId, companyId), whereEq(table.title, "Follow up with customer on proposal"), whereIsNull(table.deletedAt)),
  });

  if (!existingTask) {
    await db.insert(tasks).values({
      companyId,
      storeId,
      customerId: customer.id,
      dealId: deal.id,
      assignedToUserId: adminId,
      title: "Follow up with customer on proposal",
      description: "Call and confirm procurement timeline",
      status: "todo",
      priority: "high",
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      isRecurring: false,
      createdBy: ownerId,
    });
  }

  console.log("Seed complete");
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
