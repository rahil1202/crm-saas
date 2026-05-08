import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";

import { db } from "@/db/client";
import { companyMemberships, customers, deals, leads, stores } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { recordSecurityAuditLog } from "@/lib/security";
import type { AppVariables } from "@/types/app";

type AppContext = Context<{ Variables: AppVariables }>;

type TenantResourceType = "store" | "member" | "lead" | "customer" | "deal";

function auditContext(c: AppContext) {
  return {
    requestId: c.get("requestId"),
    companyId: c.get("tenant")?.companyId ?? null,
    userId: c.get("user")?.id ?? null,
    sessionId: c.get("user")?.sessionId ?? null,
    route: c.req.path,
    ipAddress: c.get("clientIp") ?? null,
    userAgent: c.get("userAgent") ?? null,
  };
}

export async function recordTenantIsolationViolation(
  c: AppContext,
  input: {
    resourceType: TenantResourceType | "company";
    resourceId: string | null;
    reason: string;
    requestedCompanyId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const context = auditContext(c);
  await recordSecurityAuditLog({
    ...context,
    action: "tenant_isolation.blocked",
    result: input.reason,
    metadata: {
      method: c.req.method,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      requestedCompanyId: input.requestedCompanyId ?? null,
      ...input.metadata,
    },
  });
}

async function blockTenantResource(c: AppContext, input: {
  resourceType: TenantResourceType;
  resourceId: string;
  reason: string;
}) {
  await recordTenantIsolationViolation(c, input);
  throw AppError.forbidden(`${input.resourceType} is not available in this company`);
}

export async function assertTenantStore(c: AppContext, companyId: string, storeId?: string | null) {
  if (!storeId) {
    return;
  }

  const [store] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(and(eq(stores.id, storeId), eq(stores.companyId, companyId), isNull(stores.deletedAt)))
    .limit(1);

  if (!store) {
    await blockTenantResource(c, {
      resourceType: "store",
      resourceId: storeId,
      reason: "store_not_in_tenant",
    });
  }
}

export async function assertTenantMember(c: AppContext, companyId: string, userId?: string | null) {
  if (!userId) {
    return;
  }

  const [membership] = await db
    .select({ id: companyMemberships.id })
    .from(companyMemberships)
    .where(
      and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.userId, userId),
        eq(companyMemberships.status, "active"),
        isNull(companyMemberships.deletedAt),
      ),
    )
    .limit(1);

  if (!membership) {
    await blockTenantResource(c, {
      resourceType: "member",
      resourceId: userId,
      reason: "member_not_in_tenant",
    });
  }
}

export async function assertTenantLead(c: AppContext, companyId: string, leadId?: string | null) {
  if (!leadId) {
    return;
  }

  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.companyId, companyId), isNull(leads.deletedAt)))
    .limit(1);

  if (!lead) {
    await blockTenantResource(c, {
      resourceType: "lead",
      resourceId: leadId,
      reason: "lead_not_in_tenant",
    });
  }
}

export async function assertTenantCustomer(c: AppContext, companyId: string, customerId?: string | null) {
  if (!customerId) {
    return;
  }

  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.companyId, companyId), isNull(customers.deletedAt)))
    .limit(1);

  if (!customer) {
    await blockTenantResource(c, {
      resourceType: "customer",
      resourceId: customerId,
      reason: "customer_not_in_tenant",
    });
  }
}

export async function assertTenantDeal(c: AppContext, companyId: string, dealId?: string | null) {
  if (!dealId) {
    return;
  }

  const [deal] = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.companyId, companyId), isNull(deals.deletedAt)))
    .limit(1);

  if (!deal) {
    await blockTenantResource(c, {
      resourceType: "deal",
      resourceId: dealId,
      reason: "deal_not_in_tenant",
    });
  }
}
