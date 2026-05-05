import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { whatsappMessageCosts, whatsappPricingRateCards, type whatsappPricingCategoryEnum } from "@/db/schema";

export type WhatsappPricingCategory = (typeof whatsappPricingCategoryEnum.enumValues)[number];

const CATEGORY_ALIASES: Record<string, WhatsappPricingCategory> = {
  marketing: "marketing",
  utility: "utility",
  authentication: "authentication",
  auth: "authentication",
  authentication_international: "authentication_international",
  "authentication-international": "authentication_international",
  service: "service",
};

const MARKET_BY_PREFIX: Array<{ prefix: string; market: string; countryCode: string; currency: string }> = [
  { prefix: "+91", market: "India", countryCode: "IN", currency: "INR" },
  { prefix: "+1", market: "North America", countryCode: "US", currency: "USD" },
  { prefix: "+44", market: "United Kingdom", countryCode: "GB", currency: "GBP" },
  { prefix: "+971", market: "United Arab Emirates", countryCode: "AE", currency: "AED" },
  { prefix: "+966", market: "Saudi Arabia", countryCode: "SA", currency: "SAR" },
];

function money(value: number) {
  return Number.isFinite(value) ? value.toFixed(8) : "0.00000000";
}

export function normalizeWhatsappPricingCategory(value?: string | null): WhatsappPricingCategory {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, "_") ?? "";
  return CATEGORY_ALIASES[normalized] ?? "service";
}

export function inferWhatsappMarket(phoneE164?: string | null, fallbackCurrency = "USD") {
  const match = MARKET_BY_PREFIX.find((item) => phoneE164?.startsWith(item.prefix));
  return match ?? { market: "Other", countryCode: null, currency: fallbackCurrency };
}

export function inferWhatsappMessageCategory(input: {
  resolvedMode?: string | null;
  templateCategory?: string | null;
  serviceWindowOpen?: boolean;
}) {
  if (input.resolvedMode === "freeform" || input.serviceWindowOpen) {
    return "service" satisfies WhatsappPricingCategory;
  }
  return normalizeWhatsappPricingCategory(input.templateCategory ?? "utility");
}

export async function getWhatsappPricingRates(input: {
  companyId: string;
  market?: string | null;
  currency?: string | null;
  category?: WhatsappPricingCategory | null;
}) {
  const conditions = [eq(whatsappPricingRateCards.companyId, input.companyId)];
  if (input.market) conditions.push(eq(whatsappPricingRateCards.market, input.market));
  if (input.currency) conditions.push(eq(whatsappPricingRateCards.currency, input.currency.toUpperCase()));
  if (input.category) conditions.push(eq(whatsappPricingRateCards.category, input.category));

  return db
    .select()
    .from(whatsappPricingRateCards)
    .where(and(...conditions))
    .orderBy(desc(whatsappPricingRateCards.effectiveFrom), whatsappPricingRateCards.market, whatsappPricingRateCards.category);
}

export async function getCurrentWhatsappRate(input: {
  companyId: string;
  market: string;
  currency: string;
  category: WhatsappPricingCategory;
  at?: Date;
}) {
  const at = input.at ?? new Date();
  const [rate] = await db
    .select()
    .from(whatsappPricingRateCards)
    .where(
      and(
        eq(whatsappPricingRateCards.companyId, input.companyId),
        eq(whatsappPricingRateCards.market, input.market),
        eq(whatsappPricingRateCards.currency, input.currency.toUpperCase()),
        eq(whatsappPricingRateCards.category, input.category),
        lte(whatsappPricingRateCards.effectiveFrom, at),
        or(isNull(whatsappPricingRateCards.effectiveTo), gte(whatsappPricingRateCards.effectiveTo, at)),
      ),
    )
    .orderBy(desc(whatsappPricingRateCards.effectiveFrom), desc(whatsappPricingRateCards.tierFrom))
    .limit(1);

  return rate ?? null;
}

export async function estimateWhatsappMessageCost(input: {
  companyId: string;
  toPhoneE164?: string | null;
  category: WhatsappPricingCategory;
  market?: string | null;
  countryCode?: string | null;
  currency?: string | null;
  billableUnits?: number;
  serviceWindowOpen?: boolean;
}) {
  const inferred = inferWhatsappMarket(input.toPhoneE164, input.currency ?? "USD");
  const market = input.market ?? inferred.market;
  const countryCode = input.countryCode ?? inferred.countryCode;
  const currency = (input.currency ?? inferred.currency).toUpperCase();
  const billableUnits = Math.max(1, Math.trunc(input.billableUnits ?? 1));
  const isFreeService = input.category === "service" && input.serviceWindowOpen !== false;

  if (isFreeService) {
    return {
      category: input.category,
      market,
      countryCode,
      currency,
      billableUnits,
      unitRate: "0.00000000",
      estimatedCost: "0.00000000",
      status: "waived" as const,
      rateCardId: null,
      reason: "service_window",
    };
  }

  const rate = await getCurrentWhatsappRate({ companyId: input.companyId, market, currency, category: input.category });
  const unitRate = rate ? Number(rate.rate) : 0;
  return {
    category: input.category,
    market,
    countryCode,
    currency,
    billableUnits,
    unitRate: money(unitRate),
    estimatedCost: money(unitRate * billableUnits),
    status: "estimated" as const,
    rateCardId: rate?.id ?? null,
    reason: rate ? "rate_card" : "rate_missing",
  };
}

export async function recordEstimatedWhatsappMessageCost(input: {
  companyId: string;
  workspaceId?: string | null;
  outboxId: string;
  socialMessageId?: string | null;
  providerMessageId?: string | null;
  toPhoneE164?: string | null;
  category: WhatsappPricingCategory;
  market?: string | null;
  countryCode?: string | null;
  currency?: string | null;
  serviceWindowOpen?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const estimate = await estimateWhatsappMessageCost(input);
  const [cost] = await db
    .insert(whatsappMessageCosts)
    .values({
      companyId: input.companyId,
      workspaceId: input.workspaceId ?? null,
      outboxId: input.outboxId,
      socialMessageId: input.socialMessageId ?? null,
      providerMessageId: input.providerMessageId ?? null,
      pricingRateCardId: estimate.rateCardId,
      category: estimate.category,
      market: estimate.market,
      countryCode: estimate.countryCode,
      currency: estimate.currency,
      billableUnits: estimate.billableUnits,
      unitRate: estimate.unitRate,
      estimatedCost: estimate.estimatedCost,
      finalCost: estimate.status === "waived" ? estimate.estimatedCost : null,
      status: estimate.status,
      metadata: {
        ...(input.metadata ?? {}),
        estimateReason: estimate.reason,
      },
    })
    .returning();

  return cost;
}

export async function finalizeWhatsappMessageCost(input: {
  companyId: string;
  outboxId?: string | null;
  socialMessageId?: string | null;
  providerMessageId?: string | null;
  sourceEventId?: string | null;
  providerPricing?: Record<string, unknown> | null;
  delivered: boolean;
}) {
  const providerCategory = normalizeWhatsappPricingCategory(
    typeof input.providerPricing?.category === "string" ? input.providerPricing.category : null,
  );
  const whereBy = input.outboxId
    ? eq(whatsappMessageCosts.outboxId, input.outboxId)
    : input.socialMessageId
      ? eq(whatsappMessageCosts.socialMessageId, input.socialMessageId)
      : input.providerMessageId
        ? eq(whatsappMessageCosts.providerMessageId, input.providerMessageId)
        : null;

  if (!whereBy) {
    return null;
  }

  const [existing] = await db
    .select()
    .from(whatsappMessageCosts)
    .where(and(eq(whatsappMessageCosts.companyId, input.companyId), whereBy))
    .limit(1);

  if (!existing) {
    return null;
  }

  const finalCost = input.delivered ? existing.estimatedCost : "0.00000000";
  const [updated] = await db
    .update(whatsappMessageCosts)
    .set({
      providerMessageId: input.providerMessageId ?? existing.providerMessageId,
      category: input.providerPricing?.category ? providerCategory : existing.category,
      finalCost,
      status: input.delivered ? "final" : "waived",
      sourceEventId: input.sourceEventId ?? existing.sourceEventId,
      metadata: {
        ...(existing.metadata ?? {}),
        providerPricing: input.providerPricing ?? null,
      },
      updatedAt: new Date(),
    })
    .where(eq(whatsappMessageCosts.id, existing.id))
    .returning();

  return updated;
}

export async function importWhatsappPricingRateCards(input: {
  companyId: string;
  sourceVersion: string;
  sourceUrl?: string | null;
  records: Array<{
    market: string;
    countryCode?: string | null;
    currency: string;
    category: WhatsappPricingCategory;
    rate: string;
    tierFrom?: number;
    tierTo?: number | null;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
    metadata?: Record<string, unknown>;
  }>;
}) {
  if (input.records.length === 0) {
    return { imported: 0 };
  }

  const rows = input.records.map((record) => ({
    companyId: input.companyId,
    market: record.market,
    countryCode: record.countryCode ?? null,
    currency: record.currency.toUpperCase(),
    category: record.category,
    rate: record.rate,
    tierFrom: record.tierFrom ?? 1,
    tierTo: record.tierTo ?? null,
    effectiveFrom: record.effectiveFrom,
    effectiveTo: record.effectiveTo ?? null,
    sourceVersion: input.sourceVersion,
    sourceUrl: input.sourceUrl ?? null,
    metadata: record.metadata ?? {},
  }));

  await db
    .insert(whatsappPricingRateCards)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        whatsappPricingRateCards.companyId,
        whatsappPricingRateCards.market,
        whatsappPricingRateCards.currency,
        whatsappPricingRateCards.category,
        whatsappPricingRateCards.tierFrom,
        whatsappPricingRateCards.sourceVersion,
      ],
      set: {
        countryCode: sql`excluded.country_code`,
        rate: sql`excluded.rate`,
        tierTo: sql`excluded.tier_to`,
        effectiveFrom: sql`excluded.effective_from`,
        effectiveTo: sql`excluded.effective_to`,
        sourceUrl: sql`excluded.source_url`,
        metadata: sql`excluded.metadata`,
        updatedAt: new Date(),
      },
    });

  return { imported: rows.length };
}
