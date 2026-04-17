import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { inArray, sql } from "drizzle-orm";

import { app } from "@/app/route";
import { db } from "@/db/client";
import { campaigns, companies, companyMemberships, deals, followUps, leads, partnerCompanies, partnerUsers, profiles, stores, tasks, templates } from "@/db/schema";
import { issueSessionTokens } from "@/lib/auth";
import { ensureAuthSession } from "@/lib/security";

const cleanupCompanyIds = new Set<string>();
const cleanupPartnerCompanyIds = new Set<string>();
const cleanupPartnerUserIds = new Set<string>();
const cleanupUserIds = new Set<string>();
const cleanupSessionIds = new Set<string>();

interface ApiSuccess<T> {
  success: true;
  data: T;
}

beforeAll(async () => {
  await db.execute(sql`
    ALTER TABLE "partner_users"
      ADD COLUMN IF NOT EXISTS "auth_user_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "partner_users_company_auth_user_unique"
      ON "partner_users" ("company_id", "auth_user_id")
  `);
});

async function createAuthedMember(emailPrefix: string) {
  const userId = crypto.randomUUID();
  const email = `${emailPrefix}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  cleanupUserIds.add(userId);

  await db.insert(profiles).values({
    id: userId,
    email,
    fullName: "Partner user",
  });

  const sessionId = crypto.randomUUID();
  cleanupSessionIds.add(sessionId);
  const tokens = await issueSessionTokens({
    userId,
    email,
    sessionId,
  });

  await ensureAuthSession({
    sessionId,
    userId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ipAddress: "127.0.0.1",
    userAgent: "bun-test",
  });

  return {
    userId,
    email,
    accessToken: tokens.accessToken,
  };
}

async function createCompanyWorkspace(input: { userId: string; label: string }) {
  const [company] = await db
    .insert(companies)
    .values({
      name: `Company ${input.label}`,
      timezone: "UTC",
      currency: "USD",
      createdBy: input.userId,
    })
    .returning();
  cleanupCompanyIds.add(company.id);

  const [store] = await db
    .insert(stores)
    .values({
      companyId: company.id,
      name: `Store ${input.label}`,
      code: `S${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      isDefault: true,
    })
    .returning();

  const [membership] = await db
    .insert(companyMemberships)
    .values({
      companyId: company.id,
      userId: input.userId,
      role: "member",
      status: "active",
      storeId: store.id,
    })
    .returning();

  return {
    companyId: company.id,
    companyName: company.name,
    storeId: store.id,
    membershipId: membership.id,
  };
}

async function attachPartnerAccess(input: {
  companyId: string;
  userId: string;
  email: string;
  label: string;
}) {
  const [partnerCompany] = await db
    .insert(partnerCompanies)
    .values({
      companyId: input.companyId,
      name: `Partner ${input.label}`,
      contactName: `Contact ${input.label}`,
      email: input.email,
      phone: `+1-555-${input.label}`,
      status: "active",
      createdBy: input.userId,
    })
    .returning();
  cleanupPartnerCompanyIds.add(partnerCompany.id);

  const [partnerUser] = await db
    .insert(partnerUsers)
    .values({
      companyId: input.companyId,
      partnerCompanyId: partnerCompany.id,
      authUserId: input.userId,
      fullName: `Contact ${input.label}`,
      email: input.email,
      phone: `+1-555-${input.label}`,
      title: "Primary Partner Login",
      status: "active",
      accessLevel: "standard",
      permissions: {
        leads: true,
        deals: true,
        reports: true,
        documents: true,
      },
      createdBy: input.userId,
    })
    .returning();
  cleanupPartnerUserIds.add(partnerUser.id);

  return {
    partnerCompanyId: partnerCompany.id,
    partnerCompanyName: partnerCompany.name,
  };
}

afterEach(async () => {
  if (cleanupPartnerUserIds.size > 0) {
    await db.delete(partnerUsers).where(inArray(partnerUsers.id, [...cleanupPartnerUserIds]));
    cleanupPartnerUserIds.clear();
  }

  if (cleanupPartnerCompanyIds.size > 0) {
    await db.delete(partnerCompanies).where(inArray(partnerCompanies.id, [...cleanupPartnerCompanyIds]));
    cleanupPartnerCompanyIds.clear();
  }

  if (cleanupCompanyIds.size > 0) {
    await db.delete(companies).where(inArray(companies.id, [...cleanupCompanyIds]));
    cleanupCompanyIds.clear();
  }

  if (cleanupUserIds.size > 0) {
    await db.delete(profiles).where(inArray(profiles.id, [...cleanupUserIds]));
    cleanupUserIds.clear();
  }

  cleanupSessionIds.clear();
});

describe("partner multi-company access", () => {
  test("auth/me enriches memberships with partner company details", async () => {
    const member = await createAuthedMember("partner-me");
    const firstCompany = await createCompanyWorkspace({ userId: member.userId, label: "A" });
    const secondCompany = await createCompanyWorkspace({ userId: member.userId, label: "B" });
    const firstPartner = await attachPartnerAccess({ companyId: firstCompany.companyId, userId: member.userId, email: member.email, label: "A" });
    const secondPartner = await attachPartnerAccess({ companyId: secondCompany.companyId, userId: member.userId, email: member.email, label: "B" });

    const response = await app.request("http://localhost/api/v1/auth/me", {
      headers: {
        authorization: `Bearer ${member.accessToken}`,
      },
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as ApiSuccess<{
      memberships: Array<{
        companyId: string;
        isPartnerAccess: boolean;
        customRoleName: string | null;
        customRoleModules: string[] | null;
        partnerCompanyId: string | null;
        partnerCompanyName: string | null;
      }>;
    }>;

    expect(payload.data.memberships).toHaveLength(2);
    expect(payload.data.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          companyId: firstCompany.companyId,
          isPartnerAccess: true,
          customRoleName: "Partner",
          customRoleModules: expect.arrayContaining(["campaigns", "templates", "integrations"]),
          partnerCompanyId: firstPartner.partnerCompanyId,
          partnerCompanyName: firstPartner.partnerCompanyName,
        }),
        expect.objectContaining({
          companyId: secondCompany.companyId,
          isPartnerAccess: true,
          customRoleName: "Partner",
          customRoleModules: expect.arrayContaining(["campaigns", "templates", "integrations"]),
          partnerCompanyId: secondPartner.partnerCompanyId,
          partnerCompanyName: secondPartner.partnerCompanyName,
        }),
      ]),
    );
  });

  test("partner company list and leave route keep one remaining company active", async () => {
    const member = await createAuthedMember("partner-leave");
    const firstCompany = await createCompanyWorkspace({ userId: member.userId, label: "L1" });
    const secondCompany = await createCompanyWorkspace({ userId: member.userId, label: "L2" });
    await attachPartnerAccess({ companyId: firstCompany.companyId, userId: member.userId, email: member.email, label: "L1" });
    await attachPartnerAccess({ companyId: secondCompany.companyId, userId: member.userId, email: member.email, label: "L2" });

    const listResponse = await app.request("http://localhost/api/v1/partners/me/companies", {
      headers: {
        authorization: `Bearer ${member.accessToken}`,
      },
    });
    expect(listResponse.status).toBe(200);

    const leaveResponse = await app.request(`http://localhost/api/v1/partners/me/companies/${firstCompany.companyId}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${member.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirm: true }),
    });

    expect(leaveResponse.status).toBe(200);
    const leavePayload = (await leaveResponse.json()) as ApiSuccess<{
      remainingCompanyIds: string[];
    }>;
    expect(leavePayload.data.remainingCompanyIds).toEqual([secondCompany.companyId]);

    const lastCompanyResponse = await app.request(`http://localhost/api/v1/partners/me/companies/${secondCompany.companyId}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${member.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirm: true }),
    });

    expect(lastCompanyResponse.status).toBe(409);
  });

  test("partner dashboard returns scoped summary for the active company", async () => {
    const member = await createAuthedMember("partner-dashboard");
    const workspace = await createCompanyWorkspace({ userId: member.userId, label: "PD" });
    const partner = await attachPartnerAccess({
      companyId: workspace.companyId,
      userId: member.userId,
      email: member.email,
      label: "PD",
    });

    await db.insert(leads).values([
      {
        companyId: workspace.companyId,
        storeId: workspace.storeId,
        partnerCompanyId: partner.partnerCompanyId,
        assignedToUserId: member.userId,
        title: "Partner lead one",
        fullName: "Lead One",
        email: "lead-one@example.com",
        status: "new",
        score: 10,
        createdBy: member.userId,
      },
      {
        companyId: workspace.companyId,
        storeId: workspace.storeId,
        partnerCompanyId: partner.partnerCompanyId,
        assignedToUserId: member.userId,
        title: "Partner lead two",
        fullName: "Lead Two",
        email: "lead-two@example.com",
        status: "qualified",
        score: 20,
        createdBy: member.userId,
      },
    ]);

    await db.insert(deals).values([
      {
        companyId: workspace.companyId,
        storeId: workspace.storeId,
        partnerCompanyId: partner.partnerCompanyId,
        assignedToUserId: member.userId,
        title: "Open partner deal",
        pipeline: "default",
        stage: "new",
        status: "open",
        value: 5000,
        createdBy: member.userId,
      },
      {
        companyId: workspace.companyId,
        storeId: workspace.storeId,
        partnerCompanyId: partner.partnerCompanyId,
        assignedToUserId: member.userId,
        title: "Won partner deal",
        pipeline: "default",
        stage: "won",
        status: "won",
        value: 7000,
        createdBy: member.userId,
      },
    ]);

    await db.insert(tasks).values({
      companyId: workspace.companyId,
      storeId: workspace.storeId,
      assignedToUserId: member.userId,
      title: "Partner task",
      status: "todo",
      priority: "high",
      dueAt: new Date(),
      createdBy: member.userId,
    });

    await db.insert(followUps).values({
      companyId: workspace.companyId,
      storeId: workspace.storeId,
      assignedToUserId: member.userId,
      subject: "Partner follow-up",
      channel: "call",
      status: "pending",
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
      createdBy: member.userId,
    });

    await db.insert(campaigns).values({
      companyId: workspace.companyId,
      name: "Partner campaign",
      channel: "email",
      status: "active",
      createdBy: member.userId,
    });

    await db.insert(templates).values({
      companyId: workspace.companyId,
      name: "Partner template",
      type: "email",
      content: "Hello partner",
      createdBy: member.userId,
    });

    const response = await app.request("http://localhost/api/v1/partners/me/dashboard", {
      headers: {
        authorization: `Bearer ${member.accessToken}`,
        "x-company-id": workspace.companyId,
      },
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as ApiSuccess<{
      summary: {
        assignedLeads: number;
        openDeals: number;
        wonDeals: number;
        wonRevenue: number;
        pendingFollowUps: number;
        activeCampaigns: number;
        availableTemplates: number;
      };
      recentLeads: Array<{ id: string }>;
      openPipeline: Array<{ id: string }>;
      recentWins: Array<{ id: string }>;
      assignedTasks: Array<{ id: string }>;
    }>;

    expect(payload.data.summary).toMatchObject({
      assignedLeads: 2,
      openDeals: 1,
      wonDeals: 1,
      wonRevenue: 7000,
      pendingFollowUps: 1,
      activeCampaigns: 1,
      availableTemplates: 1,
    });
    expect(payload.data.recentLeads.length).toBeGreaterThan(0);
    expect(payload.data.openPipeline).toHaveLength(1);
    expect(payload.data.recentWins).toHaveLength(1);
    expect(payload.data.assignedTasks).toHaveLength(1);
  });
});
