import { db } from "@/db/client";
import { companies, companyMemberships, leads, profiles, stores } from "@/db/schema";

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

  const companyId = company?.id ?? (
    await db.query.companies.findFirst({
      where: (table, { eq }) => eq(table.name, "Acme CRM Demo"),
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

  const storeId = defaultStore?.id ?? (
    await db.query.stores.findFirst({
      where: (table, { and, eq }) => and(eq(table.companyId, companyId), eq(table.code, "HQ")),
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
    .onConflictDoNothing();

  console.log("Seed complete");
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
