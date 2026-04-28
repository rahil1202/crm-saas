import { afterEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

import { app } from "@/app/route";
import { db } from "@/db/client";
import {
  authSessions,
  companies,
  companyMemberships,
  companySettings,
  emailMessages,
  outreachAccounts,
  outreachContacts,
  profiles,
  stores,
  templates,
} from "@/db/schema";
import { issueSessionTokens } from "@/lib/auth";
import { ensureCompanySettings, getDefaultCompanySettings } from "@/lib/company-settings";
import { ensureEmailAccount, recordEmailOpen, recordEmailReply } from "@/lib/email-runtime";
import { ensureAuthSession } from "@/lib/security";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

const cleanupCompanyIds = new Set<string>();
const cleanupUserIds = new Set<string>();
const cleanupSessionIds = new Set<string>();

async function createAuthedWorkspace() {
  const userId = crypto.randomUUID();
  const email = `outreach-${crypto.randomUUID().slice(0, 8)}@example.com`;
  cleanupUserIds.add(userId);

  await db.insert(profiles).values({
    id: userId,
    email,
    fullName: "Outreach Owner",
  });

  const [company] = await db
    .insert(companies)
    .values({
      name: `Outreach ${crypto.randomUUID().slice(0, 8)}`,
      timezone: "UTC",
      currency: "USD",
      createdBy: userId,
    })
    .returning();
  cleanupCompanyIds.add(company.id);

  const [store] = await db
    .insert(stores)
    .values({
      companyId: company.id,
      name: "Main",
      code: `O${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      isDefault: true,
    })
    .returning();

  await db.insert(companyMemberships).values({
    companyId: company.id,
    userId,
    role: "owner",
    status: "active",
    storeId: store.id,
  });
  await ensureCompanySettings(company.id);

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
    companyId: company.id,
    accessToken: tokens.accessToken,
  };
}

function authHeaders(workspace: { accessToken: string; companyId: string }) {
  return {
    authorization: `Bearer ${workspace.accessToken}`,
    "content-type": "application/json",
    "x-company-id": workspace.companyId,
  };
}

afterEach(async () => {
  for (const sessionId of cleanupSessionIds) {
    await db.delete(authSessions).where(eq(authSessions.id, sessionId));
  }
  for (const companyId of cleanupCompanyIds) {
    await db.delete(companies).where(eq(companies.id, companyId));
  }
  for (const userId of cleanupUserIds) {
    await db.delete(profiles).where(eq(profiles.id, userId));
  }

  cleanupCompanyIds.clear();
  cleanupUserIds.clear();
  cleanupSessionIds.clear();
});

describe("outreach agent integrations", () => {
  test("unauthenticated dashboard requests are rejected", async () => {
    const response = await app.request("http://localhost/api/v1/outreach/dashboard?range=all");
    expect(response.status).toBe(401);
  });

  test("manual lead creation and CSV import create tenant-scoped outreach contacts", async () => {
    const workspace = await createAuthedWorkspace();

    const createResponse = await app.request("http://localhost/api/v1/outreach/accounts", {
      method: "POST",
      headers: authHeaders(workspace),
      body: JSON.stringify({
        name: "Acme Corp",
        contacts: [
          {
            fullName: "Jordan Lee",
            email: "jordan@acme.example",
            title: "VP Sales",
          },
        ],
      }),
    });
    expect(createResponse.status).toBe(201);

    const importResponse = await app.request("http://localhost/api/v1/outreach/import-csv", {
      method: "POST",
      headers: authHeaders(workspace),
      body: JSON.stringify({
        csv: "company,full_name,email,title\nBeta Inc,Riley Park,riley@beta.example,Founder",
      }),
    });
    const importPayload = (await importResponse.json()) as ApiSuccess<{ importedAccounts: number; importedContacts: number }>;
    expect(importResponse.status).toBe(201);
    expect(importPayload.data.importedAccounts).toBe(1);
    expect(importPayload.data.importedContacts).toBe(1);

    const listResponse = await app.request("http://localhost/api/v1/outreach/contacts?limit=10&offset=0", {
      headers: authHeaders(workspace),
    });
    const listPayload = (await listResponse.json()) as ApiSuccess<{ items: Array<{ email: string }> }>;
    expect(listResponse.status).toBe(200);
    expect(listPayload.data.items.map((item) => item.email).sort()).toEqual(["jordan@acme.example", "riley@beta.example"]);
  }, 15_000);

  test("starter examples are idempotent and sample leads can be deleted", async () => {
    const workspace = await createAuthedWorkspace();

    const seedResponse = await app.request("http://localhost/api/v1/outreach/examples", {
      method: "POST",
      headers: authHeaders(workspace),
      body: JSON.stringify({ templates: true, leads: true }),
    });
    const seedPayload = (await seedResponse.json()) as ApiSuccess<{
      createdTemplates: number;
      createdAccounts: number;
      createdContacts: number;
    }>;
    expect(seedResponse.status).toBe(201);
    expect(seedPayload.data.createdTemplates).toBe(3);
    expect(seedPayload.data.createdAccounts).toBe(3);
    expect(seedPayload.data.createdContacts).toBe(3);

    const duplicateResponse = await app.request("http://localhost/api/v1/outreach/examples", {
      method: "POST",
      headers: authHeaders(workspace),
      body: JSON.stringify({ templates: true, leads: true }),
    });
    const duplicatePayload = (await duplicateResponse.json()) as ApiSuccess<{
      createdTemplates: number;
      createdAccounts: number;
      createdContacts: number;
    }>;
    expect(duplicateResponse.status).toBe(201);
    expect(duplicatePayload.data.createdTemplates).toBe(0);
    expect(duplicatePayload.data.createdAccounts).toBe(0);
    expect(duplicatePayload.data.createdContacts).toBe(0);

    const listResponse = await app.request("http://localhost/api/v1/outreach/contacts?limit=10&offset=0", {
      headers: authHeaders(workspace),
    });
    const listPayload = (await listResponse.json()) as ApiSuccess<{ items: Array<{ id: string; email: string }> }>;
    expect(listPayload.data.items).toHaveLength(3);

    const deleteResponse = await app.request(`http://localhost/api/v1/outreach/contacts/${listPayload.data.items[0].id}`, {
      method: "DELETE",
      headers: authHeaders(workspace),
    });
    expect(deleteResponse.status).toBe(200);

    const afterDeleteResponse = await app.request("http://localhost/api/v1/outreach/contacts?limit=10&offset=0", {
      headers: authHeaders(workspace),
    });
    const afterDeletePayload = (await afterDeleteResponse.json()) as ApiSuccess<{ items: Array<{ id: string }> }>;
    expect(afterDeletePayload.data.items).toHaveLength(2);
  }, 15_000);

  test("run-now records skipped state when default template and daily sending are not configured", async () => {
    const workspace = await createAuthedWorkspace();

    const response = await app.request("http://localhost/api/v1/outreach/run-now", {
      method: "POST",
      headers: authHeaders(workspace),
      body: JSON.stringify({}),
    });
    const payload = (await response.json()) as ApiSuccess<{ run: { status: string; lastError: string | null; skippedCount: number } }>;

    expect(response.status).toBe(202);
    expect(payload.data.run.status).toBe("skipped");
    expect(payload.data.run.skippedCount).toBe(1);
    expect(payload.data.run.lastError).toContain("Daily email outreach is disabled");
  }, 15_000);

  test("run-now queues and mock-processes eligible pending contacts, then tracking updates contact status", async () => {
    const workspace = await createAuthedWorkspace();
    const defaults = getDefaultCompanySettings();
    const [template] = await db
      .insert(templates)
      .values({
        companyId: workspace.companyId,
        name: "Outbound intro",
        type: "email",
        subject: "Hello {{outreach.contact.fullName}}",
        content: "<p>Hi {{outreach.contact.fullName}}</p>",
        createdBy: workspace.userId,
      })
      .returning();
    const emailAccount = await ensureEmailAccount({
      companyId: workspace.companyId,
      createdBy: workspace.userId,
      label: "Mock Sender",
      fromEmail: "sender@example.com",
      provider: "mock",
      isDefault: true,
    });
    await db
      .update(companySettings)
      .set({
        outreachAgent: {
          ...defaults.outreachAgent,
          enabled: true,
          dailyEmailEnabled: true,
          emailWindowStart: "00:00",
          emailWindowEnd: "23:59",
          sendDays: ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
          maxCompaniesPerRun: 2,
          maxEmailsPerDay: 10,
          minMinutesBetweenEmails: 0,
          defaultTemplateId: template.id,
          defaultEmailAccountId: emailAccount.id,
        },
        updatedAt: new Date(),
      })
      .where(eq(companySettings.companyId, workspace.companyId));

    const [account] = await db
      .insert(outreachAccounts)
      .values({
        companyId: workspace.companyId,
        name: "Gamma Co",
        domain: "gamma.example",
        createdBy: workspace.userId,
      })
      .returning();
    const [contact] = await db
      .insert(outreachContacts)
      .values({
        companyId: workspace.companyId,
        accountId: account.id,
        fullName: "Morgan Smith",
        email: "morgan@gamma.example",
        status: "pending",
        createdBy: workspace.userId,
      })
      .returning();

    const response = await app.request("http://localhost/api/v1/outreach/run-now", {
      method: "POST",
      headers: authHeaders(workspace),
      body: JSON.stringify({}),
    });
    const payload = (await response.json()) as ApiSuccess<{ run: { status: string; queuedCount: number; processedCount: number } }>;
    expect(response.status).toBe(202);
    expect(payload.data.run.status).toBe("completed");
    expect(payload.data.run.queuedCount).toBe(1);
    expect(payload.data.run.processedCount).toBe(1);

    const [message] = await db
      .select()
      .from(emailMessages)
      .where(and(eq(emailMessages.companyId, workspace.companyId), eq(emailMessages.outreachContactId, contact.id)))
      .limit(1);
    expect(message?.status).toBe("delivered");
    expect(message?.provider).toBe("mock");

    await recordEmailOpen(message.trackingToken);
    const [opened] = await db.select().from(outreachContacts).where(eq(outreachContacts.id, contact.id)).limit(1);
    expect(opened.status).toBe("opened");

    await recordEmailReply({
      trackingToken: message.trackingToken,
      fromEmail: "morgan@gamma.example",
      body: "Interested",
    });
    const [replied] = await db.select().from(outreachContacts).where(eq(outreachContacts.id, contact.id)).limit(1);
    expect(replied.status).toBe("replied");
  }, 15_000);
});
