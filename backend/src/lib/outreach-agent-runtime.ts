import { and, count, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  companies,
  emailAccounts,
  emailMessages,
  outreachAccounts,
  outreachAgentRuns,
  outreachContacts,
  templates,
} from "@/db/schema";
import { getCompanySettings, type OutreachAgentSettingsPayload } from "@/lib/company-settings";
import { getDefaultEmailAccount, processQueuedEmailMessages, queueEmailMessage } from "@/lib/email-runtime";
import { AppError } from "@/lib/errors";
import { renderTemplateContent } from "@/lib/template-renderer";

type OutreachAgentRunStatus = "completed" | "failed" | "skipped";

interface RunOutreachAgentInput {
  companyId: string;
  userId?: string | null;
  triggerType?: "manual" | "scheduled";
  now?: Date;
  processQueued?: boolean;
}

interface CandidateContact {
  id: string;
  accountId: string;
  fullName: string;
  email: string | null;
  title: string | null;
  accountName: string;
  domain: string | null;
  industry: string | null;
  location: string | null;
}

const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function parseMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getTimeParts(now: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
    return {
      day: part("weekday").toLowerCase(),
      minutes: Number(part("hour")) * 60 + Number(part("minute")),
    };
  } catch {
    return {
      day: dayNames[now.getDay()],
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
}

function getServerTimeParts(now: Date) {
  return {
    day: dayNames[now.getDay()],
    minutes: now.getHours() * 60 + now.getMinutes(),
  };
}

function isInsideSendWindow(settings: OutreachAgentSettingsPayload, now: Date, timezone: string) {
  const start = parseMinutes(settings.emailWindowStart);
  const end = parseMinutes(settings.emailWindowEnd);
  if (start === null || end === null) {
    return false;
  }

  const current = timezone ? getTimeParts(now, timezone) : getServerTimeParts(now);
  if (!settings.sendDays.includes(current.day)) {
    return false;
  }

  if (start <= end) {
    return current.minutes >= start && current.minutes <= end;
  }

  return current.minutes >= start || current.minutes <= end;
}

function emailDomain(email: string | null) {
  return email?.split("@")[1]?.toLowerCase() ?? "";
}

function domainMatches(domain: string, configuredDomain: string) {
  const normalized = configuredDomain.toLowerCase().replace(/^@/, "");
  return domain === normalized || domain.endsWith(`.${normalized}`);
}

function includesAny(value: string | null, filters: string[]) {
  if (filters.length === 0) return true;
  const normalized = value?.toLowerCase() ?? "";
  return filters.some((filter) => normalized.includes(filter.toLowerCase()));
}

function passesSearchSettings(contact: CandidateContact, settings: OutreachAgentSettingsPayload) {
  const contactDomain = (contact.domain || emailDomain(contact.email)).toLowerCase();

  if (settings.searchSettings.excludeDomains.some((domain) => domainMatches(contactDomain, domain))) {
    return false;
  }
  if (settings.searchSettings.includeDomains.length > 0 && !settings.searchSettings.includeDomains.some((domain) => domainMatches(contactDomain, domain))) {
    return false;
  }
  if (!includesAny(contact.industry, settings.searchSettings.industries)) {
    return false;
  }
  if (!includesAny(contact.title, settings.searchSettings.titles)) {
    return false;
  }
  if (!includesAny(contact.location, settings.searchSettings.locations)) {
    return false;
  }

  return true;
}

async function finishRun(runId: string, status: OutreachAgentRunStatus, values: {
  queuedCount?: number;
  processedCount?: number;
  skippedCount?: number;
  failedCount?: number;
  lastError?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const [updated] = await db
    .update(outreachAgentRuns)
    .set({
      status,
      finishedAt: new Date(),
      queuedCount: values.queuedCount ?? 0,
      processedCount: values.processedCount ?? 0,
      skippedCount: values.skippedCount ?? 0,
      failedCount: values.failedCount ?? 0,
      lastError: values.lastError ?? null,
      metadata: values.metadata ?? {},
    })
    .where(eq(outreachAgentRuns.id, runId))
    .returning();

  return updated;
}

async function skipRun(runId: string, reason: string, metadata: Record<string, unknown> = {}) {
  return finishRun(runId, "skipped", {
    skippedCount: 1,
    lastError: reason,
    metadata: { reason, ...metadata },
  });
}

export async function runOutreachAgent(input: RunOutreachAgentInput) {
  const now = input.now ?? new Date();
  const companySettings = await getCompanySettings(input.companyId);
  const settings = companySettings.outreachAgent;
  const [company] = await db
    .select({ timezone: companies.timezone })
    .from(companies)
    .where(eq(companies.id, input.companyId))
    .limit(1);
  const timezone = company?.timezone ?? "UTC";
  const [run] = await db
    .insert(outreachAgentRuns)
    .values({
      companyId: input.companyId,
      triggerType: input.triggerType ?? "manual",
      createdBy: input.userId ?? null,
      metadata: {
        settingsSnapshot: settings,
      },
    })
    .returning();

  try {
    if (!settings.enabled) {
      return skipRun(run.id, "Outreach agent is disabled");
    }
    if (!settings.dailyEmailEnabled) {
      return skipRun(run.id, "Daily email outreach is disabled");
    }
    if (!isInsideSendWindow(settings, now, timezone)) {
      return skipRun(run.id, "Current time is outside the configured outreach sending window", {
        checkedAt: now.toISOString(),
        timezone,
        sendDays: settings.sendDays,
        emailWindowStart: settings.emailWindowStart,
        emailWindowEnd: settings.emailWindowEnd,
      });
    }
    if (!settings.defaultTemplateId) {
      return skipRun(run.id, "Select a default outreach email template before running the agent");
    }

    const [template] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, settings.defaultTemplateId), eq(templates.companyId, input.companyId), eq(templates.type, "email"), isNull(templates.deletedAt)))
      .limit(1);
    if (!template) {
      return skipRun(run.id, "Default outreach email template is not available");
    }

    const account = settings.defaultEmailAccountId
      ? await db
          .select()
          .from(emailAccounts)
          .where(and(eq(emailAccounts.id, settings.defaultEmailAccountId), eq(emailAccounts.companyId, input.companyId), eq(emailAccounts.status, "connected"), isNull(emailAccounts.deletedAt)))
          .limit(1)
          .then((rows) => rows[0] ?? null)
      : await getDefaultEmailAccount(input.companyId);
    if (!account) {
      return skipRun(run.id, "Connect a default email account before running the outreach agent");
    }

    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const [sentTodayRow] = await db
      .select({ count: count() })
      .from(emailMessages)
      .where(and(eq(emailMessages.companyId, input.companyId), gte(emailMessages.createdAt, dayStart), sql`${emailMessages.outreachContactId} is not null`));
    const remainingDailyCapacity = Math.max(0, settings.maxEmailsPerDay - (sentTodayRow?.count ?? 0));
    if (remainingDailyCapacity === 0) {
      return skipRun(run.id, "Daily outreach email limit has already been reached");
    }

    const rows = await db
      .select({
        id: outreachContacts.id,
        accountId: outreachContacts.accountId,
        fullName: outreachContacts.fullName,
        email: outreachContacts.email,
        title: outreachContacts.title,
        accountName: outreachAccounts.name,
        domain: outreachAccounts.domain,
        industry: outreachAccounts.industry,
        location: outreachAccounts.location,
      })
      .from(outreachContacts)
      .innerJoin(outreachAccounts, eq(outreachAccounts.id, outreachContacts.accountId))
      .where(and(eq(outreachContacts.companyId, input.companyId), eq(outreachContacts.status, "pending"), isNull(outreachContacts.deletedAt), isNull(outreachAccounts.deletedAt), sql`${outreachContacts.email} is not null`))
      .orderBy(outreachContacts.createdAt)
      .limit(Math.max(settings.maxCompaniesPerRun * 5, remainingDailyCapacity));

    const selected: CandidateContact[] = [];
    const selectedAccountIds = new Set<string>();
    for (const row of rows) {
      if (selected.length >= remainingDailyCapacity) break;
      if (selectedAccountIds.size >= settings.maxCompaniesPerRun && !selectedAccountIds.has(row.accountId)) break;
      if (!passesSearchSettings(row, settings)) continue;
      selected.push(row);
      selectedAccountIds.add(row.accountId);
    }

    if (selected.length === 0) {
      return skipRun(run.id, "No eligible pending outreach contacts were found");
    }

    const queuedIds: string[] = [];
    for (const [index, contact] of selected.entries()) {
      const rendered = await renderTemplateContent({
        companyId: input.companyId,
        subject: template.subject,
        content: template.content,
        variables: {
          outreach: {
            contact: {
              fullName: contact.fullName,
              email: contact.email,
              title: contact.title,
            },
            account: {
              name: contact.accountName,
              domain: contact.domain,
              industry: contact.industry,
              location: contact.location,
            },
          },
        },
      });

      const scheduledAt = new Date(now.getTime() + index * settings.minMinutesBetweenEmails * 60_000);
      const message = await queueEmailMessage({
        companyId: input.companyId,
        emailAccountId: account.id,
        createdBy: input.userId ?? null,
        outreachAccountId: contact.accountId,
        outreachContactId: contact.id,
        recipientEmail: contact.email as string,
        recipientName: contact.fullName,
        subject: rendered.subject ?? template.subject ?? template.name,
        htmlContent: rendered.content,
        scheduledAt,
        metadata: {
          source: "outreach-agent",
          runId: run.id,
          templateId: template.id,
        },
      });
      queuedIds.push(message.id);

      await db
        .update(outreachContacts)
        .set({
          status: "sent",
          sentAt: scheduledAt,
          lastContactedAt: scheduledAt,
          updatedAt: new Date(),
        })
        .where(eq(outreachContacts.id, contact.id));
    }

    const processedCount = input.processQueued === false
      ? 0
      : await processQueuedEmailMessages(queuedIds.length, { companyId: input.companyId, messageIds: queuedIds });

    return finishRun(run.id, "completed", {
      queuedCount: queuedIds.length,
      processedCount,
      skippedCount: Math.max(0, rows.length - selected.length),
      metadata: {
        queuedIds,
        selectedContactIds: selected.map((contact) => contact.id),
        selectedAccountIds: [...selectedAccountIds],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Outreach agent run failed";
    await finishRun(run.id, "failed", {
      failedCount: 1,
      lastError: message,
    });
    throw error instanceof AppError ? error : AppError.internal(message);
  }
}
