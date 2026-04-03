import { and, asc, desc, eq, ilike, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { customers, leads, socialConversations, whatsappPhoneMappings, whatsappTemplates, whatsappWorkspaces } from "@/db/schema";
import { AppError } from "@/lib/errors";

export function normalizePhoneToE164(rawValue: string) {
  const digits = rawValue.replace(/[^\d+]/g, "");
  if (!digits) {
    throw AppError.badRequest("Phone number is required");
  }

  const withPlus = digits.startsWith("+") ? digits : `+${digits}`;
  if (!/^\+\d{8,15}$/.test(withPlus)) {
    throw AppError.badRequest("Phone number must be in E.164 format");
  }

  return withPlus;
}

export async function listWhatsappWorkspaces(companyId: string) {
  return db
    .select()
    .from(whatsappWorkspaces)
    .where(and(eq(whatsappWorkspaces.companyId, companyId), isNull(whatsappWorkspaces.deletedAt)))
    .orderBy(desc(whatsappWorkspaces.isActive), desc(whatsappWorkspaces.updatedAt));
}

export async function getWhatsappWorkspaceByPhoneNumberId(phoneNumberId: string) {
  const [workspace] = await db
    .select()
    .from(whatsappWorkspaces)
    .where(and(eq(whatsappWorkspaces.phoneNumberId, phoneNumberId), isNull(whatsappWorkspaces.deletedAt)))
    .orderBy(desc(whatsappWorkspaces.isActive))
    .limit(1);

  return workspace ?? null;
}

export async function upsertWhatsappWorkspace(input: {
  companyId: string;
  createdBy: string;
  name: string;
  phoneNumberId: string;
  businessAccountId?: string | null;
  accessToken?: string | null;
  verifyToken?: string | null;
  appSecret?: string | null;
  isActive?: boolean;
  isVerified?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const [workspace] = await db
    .insert(whatsappWorkspaces)
    .values({
      companyId: input.companyId,
      name: input.name,
      phoneNumberId: input.phoneNumberId,
      businessAccountId: input.businessAccountId ?? null,
      accessToken: input.accessToken ?? null,
      verifyToken: input.verifyToken ?? null,
      appSecret: input.appSecret ?? null,
      isActive: input.isActive ?? true,
      isVerified: input.isVerified ?? false,
      metadata: input.metadata ?? {},
      createdBy: input.createdBy,
    })
    .onConflictDoUpdate({
      target: [whatsappWorkspaces.companyId, whatsappWorkspaces.phoneNumberId],
      set: {
        name: input.name,
        businessAccountId: input.businessAccountId ?? null,
        accessToken: input.accessToken ?? null,
        verifyToken: input.verifyToken ?? null,
        appSecret: input.appSecret ?? null,
        isActive: input.isActive ?? true,
        isVerified: input.isVerified ?? false,
        metadata: input.metadata ?? {},
        updatedAt: new Date(),
        deletedAt: null,
      },
    })
    .returning();

  return workspace;
}

export async function resolvePhoneMapping(input: {
  companyId: string;
  phoneRaw: string;
  leadId?: string | null;
  customerId?: string | null;
  socialConversationId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const phoneE164 = normalizePhoneToE164(input.phoneRaw);

  const [mapping] = await db
    .insert(whatsappPhoneMappings)
    .values({
      companyId: input.companyId,
      phoneE164,
      leadId: input.leadId ?? null,
      customerId: input.customerId ?? null,
      socialConversationId: input.socialConversationId ?? null,
      metadata: input.metadata ?? {},
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [whatsappPhoneMappings.companyId, whatsappPhoneMappings.phoneE164],
      set: {
        leadId: input.leadId ?? whatsappPhoneMappings.leadId,
        customerId: input.customerId ?? whatsappPhoneMappings.customerId,
        socialConversationId: input.socialConversationId ?? whatsappPhoneMappings.socialConversationId,
        metadata: input.metadata ?? {},
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!mapping.leadId && !mapping.customerId) {
    const [leadMatch] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.companyId, input.companyId), eq(leads.phone, phoneE164), isNull(leads.deletedAt)))
      .limit(1);

    const [customerMatch] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.companyId, input.companyId), eq(customers.phone, phoneE164), isNull(customers.deletedAt)))
      .limit(1);

    if (leadMatch || customerMatch) {
      const [updated] = await db
        .update(whatsappPhoneMappings)
        .set({
          leadId: leadMatch?.id ?? null,
          customerId: customerMatch?.id ?? null,
          updatedAt: new Date(),
        })
        .where(eq(whatsappPhoneMappings.id, mapping.id))
        .returning();

      return updated;
    }
  }

  return mapping;
}

export async function listWhatsappTemplates(companyId: string, search?: string) {
  const conditions = [eq(whatsappTemplates.companyId, companyId), isNull(whatsappTemplates.deletedAt)];
  if (search) {
    conditions.push(ilike(whatsappTemplates.name, `%${search}%`));
  }

  return db
    .select()
    .from(whatsappTemplates)
    .where(and(...conditions))
    .orderBy(asc(whatsappTemplates.name));
}

export async function upsertWhatsappTemplate(input: {
  companyId: string;
  createdBy: string;
  workspaceId?: string | null;
  name: string;
  category?: string | null;
  language?: string;
  status?: "draft" | "approved" | "rejected" | "paused";
  body: string;
  variables?: Array<{ key: string; fallback?: string }>;
  providerTemplateId?: string | null;
}) {
  const [template] = await db
    .insert(whatsappTemplates)
    .values({
      companyId: input.companyId,
      workspaceId: input.workspaceId ?? null,
      name: input.name,
      category: input.category ?? null,
      language: input.language ?? "en",
      status: input.status ?? "draft",
      body: input.body,
      variables: input.variables ?? [],
      providerTemplateId: input.providerTemplateId ?? null,
      createdBy: input.createdBy,
    })
    .onConflictDoUpdate({
      target: [whatsappTemplates.companyId, whatsappTemplates.name, whatsappTemplates.language],
      set: {
        workspaceId: input.workspaceId ?? null,
        category: input.category ?? null,
        status: input.status ?? "draft",
        body: input.body,
        variables: input.variables ?? [],
        providerTemplateId: input.providerTemplateId ?? null,
        updatedAt: new Date(),
        deletedAt: null,
      },
    })
    .returning();

  return template;
}

export async function getConversationStatusTimeline(companyId: string, conversationId: string) {
  const [conversation] = await db
    .select()
    .from(socialConversations)
    .where(and(eq(socialConversations.companyId, companyId), eq(socialConversations.id, conversationId), isNull(socialConversations.deletedAt)))
    .limit(1);

  if (!conversation) {
    throw AppError.notFound("Social conversation not found");
  }

  return {
    conversationId: conversation.id,
    takeover: conversation.humanTakeoverEnabled,
    botState: conversation.botState,
    resolvedAt: conversation.resolvedAt,
    statusSummary: conversation.messageStatusSummary ?? {},
  };
}
