import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { app } from "@/app/route";
import { db } from "@/db/client";
import { authSessions, companies, companyMemberships, profiles, stores } from "@/db/schema";
import { issueSessionTokens } from "@/lib/auth";
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
  const email = `templates-${crypto.randomUUID().slice(0, 8)}@example.com`;
  cleanupUserIds.add(userId);

  await db.insert(profiles).values({
    id: userId,
    email,
    fullName: "Template Owner",
  });

  const [company] = await db
    .insert(companies)
    .values({
      name: `Templates ${crypto.randomUUID().slice(0, 8)}`,
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
      code: `T${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
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

describe("template management integrations", () => {
  test("email templates can be created, fetched, updated, trashed, restored, and permanently deleted", async () => {
    const workspace = await createAuthedWorkspace();

    const createResponse = await app.request("http://localhost/api/v1/templates", {
      method: "POST",
      headers: authHeaders(workspace),
      body: JSON.stringify({
        name: "Welcome Email",
        type: "email",
        subject: "Hello {{name}}",
        content: "Welcome to the CRM.",
        notes: "Default welcome message",
      }),
    });
    const createPayload = (await createResponse.json()) as ApiSuccess<{ id: string; subject: string; content: string }>;
    expect(createResponse.status).toBe(201);

    const detailResponse = await app.request(`http://localhost/api/v1/templates/${createPayload.data.id}`, {
      headers: authHeaders(workspace),
    });
    const detailPayload = (await detailResponse.json()) as ApiSuccess<{ id: string; subject: string; content: string }>;
    expect(detailResponse.status).toBe(200);
    expect(detailPayload.data.subject).toBe("Hello {{name}}");

    const updateResponse = await app.request(`http://localhost/api/v1/templates/${createPayload.data.id}`, {
      method: "PATCH",
      headers: authHeaders(workspace),
      body: JSON.stringify({ subject: "Updated subject", content: "Updated body" }),
    });
    const updatePayload = (await updateResponse.json()) as ApiSuccess<{ subject: string; content: string }>;
    expect(updateResponse.status).toBe(200);
    expect(updatePayload.data.subject).toBe("Updated subject");

    const deleteResponse = await app.request(`http://localhost/api/v1/templates/${createPayload.data.id}`, {
      method: "DELETE",
      headers: authHeaders(workspace),
    });
    expect(deleteResponse.status).toBe(200);

    const restoreResponse = await app.request(`http://localhost/api/v1/templates/${createPayload.data.id}/restore`, {
      method: "POST",
      headers: authHeaders(workspace),
      body: JSON.stringify({}),
    });
    expect(restoreResponse.status).toBe(200);

    await app.request(`http://localhost/api/v1/templates/${createPayload.data.id}`, {
      method: "DELETE",
      headers: authHeaders(workspace),
    });
    const permanentResponse = await app.request(`http://localhost/api/v1/templates/${createPayload.data.id}/permanent`, {
      method: "DELETE",
      headers: authHeaders(workspace),
    });
    expect(permanentResponse.status).toBe(200);
  }, 15_000);

  test("WhatsApp template records can be managed locally and remain tenant scoped", async () => {
    const workspace = await createAuthedWorkspace();
    const otherWorkspace = await createAuthedWorkspace();

    const workspaceResponse = await app.request("http://localhost/api/v1/whatsapp-workspaces", {
      method: "POST",
      headers: authHeaders(workspace),
      body: JSON.stringify({
        name: "Primary WhatsApp",
        phoneNumberId: `pn_${crypto.randomUUID().slice(0, 8)}`,
        businessAccountId: `waba_${crypto.randomUUID().slice(0, 8)}`,
        isActive: true,
        isVerified: false,
        activePhoneNumberIds: [],
        metadata: {},
      }),
    });
    const workspacePayload = (await workspaceResponse.json()) as ApiSuccess<{ id: string }>;
    expect(workspaceResponse.status).toBe(201);

    const createResponse = await app.request("http://localhost/api/v1/whatsapp-templates", {
      method: "POST",
      headers: authHeaders(workspace),
      body: JSON.stringify({
        workspaceId: workspacePayload.data.id,
        name: "order_update",
        category: "utility",
        language: "en",
        status: "draft",
        body: "Hi {{name}}, your order is ready.",
        variables: [{ key: "name", fallback: "Customer" }],
      }),
    });
    const createPayload = (await createResponse.json()) as ApiSuccess<{ id: string; status: string; providerTemplateId: string | null }>;
    expect(createResponse.status).toBe(201);

    const otherListResponse = await app.request("http://localhost/api/v1/whatsapp-templates", {
      headers: authHeaders(otherWorkspace),
    });
    const otherListPayload = (await otherListResponse.json()) as ApiSuccess<{ items: Array<{ id: string }> }>;
    expect(otherListPayload.data.items.some((item) => item.id === createPayload.data.id)).toBe(false);

    const updateResponse = await app.request(`http://localhost/api/v1/whatsapp-templates/${createPayload.data.id}`, {
      method: "PATCH",
      headers: authHeaders(workspace),
      body: JSON.stringify({ status: "approved", providerTemplateId: "meta_template_1" }),
    });
    const updatePayload = (await updateResponse.json()) as ApiSuccess<{ status: string; providerTemplateId: string | null }>;
    expect(updateResponse.status).toBe(200);
    expect(updatePayload.data.status).toBe("approved");

    const syncResponse = await app.request(`http://localhost/api/v1/whatsapp-templates/${createPayload.data.id}/sync`, {
      method: "POST",
      headers: authHeaders(workspace),
      body: JSON.stringify({ status: "paused", providerTemplateId: "meta_template_2" }),
    });
    const syncPayload = (await syncResponse.json()) as ApiSuccess<{ status: string; providerTemplateId: string | null }>;
    expect(syncResponse.status).toBe(200);
    expect(syncPayload.data.status).toBe("paused");
    expect(syncPayload.data.providerTemplateId).toBe("meta_template_2");

    const deleteResponse = await app.request(`http://localhost/api/v1/whatsapp-templates/${createPayload.data.id}`, {
      method: "DELETE",
      headers: authHeaders(workspace),
    });
    expect(deleteResponse.status).toBe(200);
  }, 15_000);
});
