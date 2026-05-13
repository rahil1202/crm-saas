import { and, asc, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import nodemailer from "nodemailer";
import { Webhook } from "svix";

import { db } from "@/db/client";
import {
  automations,
  campaignCustomers,
  campaignDeliveries,
  campaigns,
  customers,
  emailAccounts,
  emailAnalyticsDaily,
  emailMessages,
  emailTrackingEvents,
  leads,
  outreachContacts,
  whatsappTemplates,
} from "@/db/schema";
import { env } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { decryptIntegrationSecret, isEncryptedSecret } from "@/lib/integration-crypto";
import { renderTemplateContent } from "@/lib/template-renderer";
import { queueWhatsappMessage } from "@/lib/whatsapp-runtime";
import { normalizePhoneToE164 } from "@/lib/whatsapp-workspace";

interface QueueEmailInput {
  companyId: string;
  createdBy?: string | null;
  campaignId?: string | null;
  automationId?: string | null;
  automationRunId?: string | null;
  customerId?: string | null;
  leadId?: string | null;
  outreachAccountId?: string | null;
  outreachContactId?: string | null;
  emailAccountId?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  htmlContent: string;
  textContent?: string | null;
  scheduledAt?: Date | null;
  metadata?: Record<string, unknown>;
}

interface SendEmailRequest {
  fromName?: string | null;
  fromEmail: string;
  toEmail: string;
  toName?: string | null;
  subject: string;
  html: string;
  text?: string | null;
}

interface EmailProviderResult {
  providerMessageId: string;
  deliveredAt?: Date;
}

interface EmailProviderAdapter {
  send(request: SendEmailRequest): Promise<EmailProviderResult>;
}

export class MockEmailProvider implements EmailProviderAdapter {
  async send(_request: SendEmailRequest) {
    return {
      providerMessageId: crypto.randomUUID(),
      deliveredAt: new Date(),
    };
  }
}

export class ResendEmailProvider implements EmailProviderAdapter {
  async send(request: SendEmailRequest) {
    if (!env.RESEND_API_KEY) {
      throw AppError.conflict("RESEND_API_KEY is not configured");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: request.fromName ? `${request.fromName} <${request.fromEmail}>` : request.fromEmail,
        to: request.toName ? [`${request.toName} <${request.toEmail}>`] : [request.toEmail],
        subject: request.subject,
        html: request.html,
        text: request.text ?? undefined,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw AppError.conflict(`Resend send failed: ${response.status}`, details);
    }

    const payload = (await response.json()) as { id?: string };
    if (!payload.id) {
      throw AppError.internal("Resend send response did not include message id");
    }

    return {
      providerMessageId: payload.id,
    };
  }
}

/**
 * Send via Gmail API using an OAuth access token.
 * The token must have the gmail.send scope.
 */
export class GmailOAuthProvider implements EmailProviderAdapter {
  constructor(private readonly accessToken: string) {}

  async send(request: SendEmailRequest) {
    // Build RFC 2822 message
    const from = request.fromName ? `${request.fromName} <${request.fromEmail}>` : request.fromEmail;
    const to = request.toName ? `${request.toName} <${request.toEmail}>` : request.toEmail;
    const boundary = `boundary_${crypto.randomUUID().replace(/-/g, "")}`;

    const rawMessage = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${request.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      request.text ?? request.html.replace(/<[^>]+>/g, ""),
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      request.html,
      ``,
      `--${boundary}--`,
    ].join("\r\n");

    // Base64url encode
    const encoded = Buffer.from(rawMessage).toString("base64url");

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encoded }),
    });

    if (!response.ok) {
      const details = await response.text();
      // If token expired, mark as failed with a clear message
      if (response.status === 401) {
        throw AppError.conflict("Gmail OAuth token expired. Please reconnect your Gmail account in Settings → Integrations → Email.");
      }
      throw AppError.conflict(`Gmail send failed: ${response.status}`, details);
    }

    const payload = (await response.json()) as { id?: string };
    return {
      providerMessageId: payload.id ?? crypto.randomUUID(),
    };
  }
}

/**
 * Send via Microsoft Graph API (Outlook/M365) using an OAuth access token.
 * The token must have the Mail.Send scope.
 */
export class OutlookOAuthProvider implements EmailProviderAdapter {
  constructor(private readonly accessToken: string) {}

  async send(request: SendEmailRequest) {
    const message = {
      subject: request.subject,
      body: {
        contentType: "HTML",
        content: request.html,
      },
      toRecipients: [
        {
          emailAddress: {
            address: request.toEmail,
            name: request.toName ?? request.toEmail,
          },
        },
      ],
      from: {
        emailAddress: {
          address: request.fromEmail,
          name: request.fromName ?? request.fromEmail,
        },
      },
    };

    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });

    if (!response.ok) {
      const details = await response.text();
      if (response.status === 401) {
        throw AppError.conflict("Outlook OAuth token expired. Please reconnect your Outlook account in Settings → Integrations → Email.");
      }
      throw AppError.conflict(`Outlook send failed: ${response.status}`, details);
    }

    // Graph sendMail returns 202 with no body
    return {
      providerMessageId: crypto.randomUUID(),
    };
  }
}

/**
 * Send via SMTP using nodemailer. SMTP connection parameters are read from env vars at call time.
 * Supports both authenticated and unauthenticated (relay) SMTP servers.
 */
export class SmtpEmailProvider implements EmailProviderAdapter {
  async send(request: SendEmailRequest): Promise<EmailProviderResult> {
    const host = env.SMTP_HOST;
    if (!host) {
      throw AppError.conflict("SMTP_HOST is not configured");
    }

    const port = env.SMTP_PORT;
    const secure = env.SMTP_SECURE;
    const user = env.SMTP_USER;
    const pass = env.SMTP_PASS;

    // Build transporter options — omit auth entirely for unauthenticated relay
    const transportOptions: nodemailer.TransportOptions = {
      host,
      port,
      secure,
      ...(user && pass ? { auth: { user, pass } } : {}),
    } as nodemailer.TransportOptions;

    const transporter = nodemailer.createTransport(transportOptions);

    // Resolve from address: SMTP_FROM_EMAIL overrides request.fromEmail (Req 3.11)
    const fromEmail = env.SMTP_FROM_EMAIL ?? request.fromEmail;
    // Use SMTP_FROM_NAME if set, otherwise fall back to request.fromName
    const fromName = env.SMTP_FROM_NAME ?? request.fromName;
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    try {
      const info = await transporter.sendMail({
        from,
        to: request.toName ? `${request.toName} <${request.toEmail}>` : request.toEmail,
        subject: request.subject,
        html: request.html,
        text: request.text ?? undefined,
      });

      // Extract message-id; fall back to a generated UUID if the server returns none
      const rawMessageId: string | undefined = info.messageId;
      const providerMessageId =
        rawMessageId && rawMessageId.length > 0 ? rawMessageId : crypto.randomUUID();

      return { providerMessageId };
    } catch (error) {
      if (error instanceof Error) {
        // SMTP rejection errors carry a `responseCode` property (nodemailer SMTPError)
        const smtpError = error as Error & { responseCode?: number; code?: string };
        if (smtpError.responseCode) {
          throw AppError.conflict(`SMTP send failed: ${smtpError.responseCode} ${error.message}`);
        }
        // Connection / network errors (ECONNREFUSED, ETIMEDOUT, etc.)
        throw AppError.conflict(`SMTP connection failed: ${error.message}`);
      }
      throw AppError.conflict("SMTP connection failed: unknown error");
    }
  }
}

export function getEmailProviderAdapter(provider: string, credentials?: Record<string, unknown>): EmailProviderAdapter {
  if (provider === "smtp") {
    return env.SMTP_HOST ? new SmtpEmailProvider() : new MockEmailProvider();
  }

  if (provider === "resend") {
    return new ResendEmailProvider();
  }

  if (provider === "google" && credentials) {
    const rawToken = credentials.accessToken;
    const accessToken = typeof rawToken === "string" && isEncryptedSecret(rawToken)
      ? decryptIntegrationSecret(rawToken)
      : typeof rawToken === "string" ? rawToken : null;
    if (accessToken) {
      return new GmailOAuthProvider(accessToken);
    }
  }

  if (provider === "azure" && credentials) {
    const rawToken = credentials.accessToken;
    const accessToken = typeof rawToken === "string" && isEncryptedSecret(rawToken)
      ? decryptIntegrationSecret(rawToken)
      : typeof rawToken === "string" ? rawToken : null;
    if (accessToken) {
      return new OutlookOAuthProvider(accessToken);
    }
  }

  return new MockEmailProvider();
}

export async function getDefaultEmailAccount(companyId: string) {
  const [account] = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.companyId, companyId), eq(emailAccounts.status, "connected"), isNull(emailAccounts.deletedAt)))
    .orderBy(desc(emailAccounts.isDefault), asc(emailAccounts.createdAt))
    .limit(1);

  return account ?? null;
}

export async function ensureSystemEmailAccount(companyId: string, createdBy: string) {
  // Check if account already exists (Req 5.5)
  const existing = await getDefaultEmailAccount(companyId);
  if (existing) {
    return existing;
  }

  // SMTP takes priority over Resend (Req 5.1, 5.2)
  if (env.SMTP_HOST) {
    const fromEmail = env.SMTP_FROM_EMAIL ?? "";
    const fromName = env.SMTP_FROM_NAME ?? null;

    const [account] = await db
      .insert(emailAccounts)
      .values({
        companyId,
        userId: null,
        label: "System Email (SMTP)",
        provider: "smtp",
        fromName,
        fromEmail,
        status: "connected",
        isDefault: true,
        credentials: {},
        metadata: { systemGenerated: true },
        createdBy,
      })
      .onConflictDoUpdate({
        target: [emailAccounts.companyId, emailAccounts.fromEmail],
        set: {
          status: "connected",
          isDefault: true,
          updatedAt: new Date(),
          deletedAt: null,
        },
      })
      .returning();

    return account;
  }

  // Fallback to Resend if configured (Req 5.3)
  if (env.RESEND_API_KEY) {
    const fromEmail = env.RESEND_FROM_EMAIL || "noreply@yourdomain.com";
    const fromName = env.RESEND_FROM_NAME || "CRM System";

    const [account] = await db
      .insert(emailAccounts)
      .values({
        companyId,
        userId: null,
        label: "System Email (Resend)",
        provider: "resend",
        fromName,
        fromEmail,
        status: "connected",
        isDefault: true,
        credentials: {},
        metadata: { systemGenerated: true },
        createdBy,
      })
      .onConflictDoUpdate({
        target: [emailAccounts.companyId, emailAccounts.fromEmail],
        set: {
          status: "connected",
          isDefault: true,
          updatedAt: new Date(),
          deletedAt: null,
        },
      })
      .returning();

    return account;
  }

  // Neither SMTP nor Resend configured (Req 5.4)
  return null;
}

export async function ensureEmailAccount(input: {
  companyId: string;
  userId?: string | null;
  createdBy: string;
  label: string;
  fromEmail: string;
  fromName?: string | null;
  provider?: string;
  isDefault?: boolean;
  credentials?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const existing = await getDefaultEmailAccount(input.companyId);

  const [account] = await db
    .insert(emailAccounts)
    .values({
      companyId: input.companyId,
      userId: input.userId ?? null,
      label: input.label,
      provider: input.provider ?? "mock",
      fromName: input.fromName ?? null,
      fromEmail: input.fromEmail,
      status: "connected",
      isDefault: input.isDefault ?? !existing,
      credentials: input.credentials ?? {},
      metadata: input.metadata ?? {},
      createdBy: input.createdBy,
    })
    .onConflictDoUpdate({
      target: [emailAccounts.companyId, emailAccounts.fromEmail],
      set: {
        label: input.label,
        provider: input.provider ?? "mock",
        fromName: input.fromName ?? null,
        status: "connected",
        isDefault: input.isDefault ?? !existing,
        credentials: input.credentials ?? {},
        metadata: input.metadata ?? {},
        updatedAt: new Date(),
        deletedAt: null,
      },
    })
    .returning();

  return account;
}

export function buildTrackingUrls(token: string) {
  return {
    openUrl: `${env.BACKEND_URL}/api/v1/public/email/open/${token}`,
    clickUrl: `${env.BACKEND_URL}/api/v1/public/email/click/${token}`,
  };
}

function injectTrackingPixel(html: string, token: string) {
  const tracking = buildTrackingUrls(token);
  const pixel = `<img src="${tracking.openUrl}" alt="" width="1" height="1" style="display:none" />`;
  return `${html}${pixel}`;
}

export async function queueEmailMessage(input: QueueEmailInput) {
  const [message] = await db
    .insert(emailMessages)
    .values({
      companyId: input.companyId,
      campaignId: input.campaignId ?? null,
      automationId: input.automationId ?? null,
      automationRunId: input.automationRunId ?? null,
      emailAccountId: input.emailAccountId ?? null,
      customerId: input.customerId ?? null,
      leadId: input.leadId ?? null,
      outreachAccountId: input.outreachAccountId ?? null,
      outreachContactId: input.outreachContactId ?? null,
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName ?? null,
      subject: input.subject,
      htmlContent: input.htmlContent,
      textContent: input.textContent ?? null,
      status: "queued",
      provider: "mock",
      trackingToken: crypto.randomUUID(),
      metadata: input.metadata ?? {},
      scheduledAt: input.scheduledAt ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning();

  return message;
}

export async function queueCampaignDelivery(input: { companyId: string; campaignId: string; createdBy: string }) {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.companyId, input.companyId), eq(campaigns.id, input.campaignId), isNull(campaigns.deletedAt)))
    .limit(1);

  if (!campaign) {
    throw AppError.notFound("Campaign not found");
  }

  const recipients = await db
    .select({
      customerId: customers.id,
      fullName: customers.fullName,
      email: customers.email,
      phone: customers.phone,
    })
    .from(campaignCustomers)
    .innerJoin(customers, eq(customers.id, campaignCustomers.customerId))
    .where(and(eq(campaignCustomers.companyId, input.companyId), eq(campaignCustomers.campaignId, input.campaignId), isNull(customers.deletedAt)));

  if (campaign.channel === "whatsapp") {
    const whatsappTemplateId = typeof campaign.channelMetadata?.whatsappTemplateId === "string" ? campaign.channelMetadata.whatsappTemplateId : null;
    if (!whatsappTemplateId) {
      throw AppError.conflict("Campaign channel metadata must include whatsappTemplateId");
    }

    const [whatsappTemplate] = await db
      .select()
      .from(whatsappTemplates)
      .where(and(eq(whatsappTemplates.companyId, input.companyId), eq(whatsappTemplates.id, whatsappTemplateId), isNull(whatsappTemplates.deletedAt)))
      .limit(1);
    if (!whatsappTemplate) {
      throw AppError.notFound("WhatsApp template not found for campaign");
    }
    if (whatsappTemplate.status !== "approved") {
      throw AppError.conflict("WhatsApp campaign template is not approved by Meta");
    }

    const queueable = recipients
      .map((recipient) => {
        try {
          return { ...recipient, phoneE164: recipient.phone ? normalizePhoneToE164(recipient.phone) : null };
        } catch {
          return { ...recipient, phoneE164: null };
        }
      })
      .filter((recipient) => recipient.phoneE164);
    if (queueable.length === 0) {
      throw AppError.conflict("Campaign has no deliverable WhatsApp recipients with valid E.164 phone numbers");
    }

    let queuedCount = 0;
    for (const recipient of queueable) {
      const idempotencyKey = `campaign:${campaign.id}:customer:${recipient.customerId}:template:${whatsappTemplate.id}`;
      const queued = await queueWhatsappMessage({
        companyId: input.companyId,
        createdBy: input.createdBy,
        workspaceId: whatsappTemplate.workspaceId,
        to: recipient.phoneE164 as string,
        contactName: recipient.fullName,
        crmRef: { customerId: recipient.customerId },
        mode: "template",
        template: {
          name: whatsappTemplate.name,
          language: whatsappTemplate.language,
          components: whatsappTemplate.components,
        },
        idempotencyKey,
      });

      await db
        .insert(campaignDeliveries)
        .values({
          companyId: input.companyId,
          campaignId: campaign.id,
          customerId: recipient.customerId,
          outboxId: queued.outbox.id,
          socialMessageId: queued.message?.id ?? null,
          idempotencyKey,
          providerMessageId: queued.outbox.providerMessageId,
          status: queued.outbox.status,
          metadata: { channel: "whatsapp", duplicate: queued.duplicate },
        })
        .onConflictDoUpdate({
          target: [campaignDeliveries.campaignId, campaignDeliveries.customerId],
          set: {
            outboxId: queued.outbox.id,
            socialMessageId: queued.message?.id ?? null,
            providerMessageId: queued.outbox.providerMessageId,
            status: queued.outbox.status,
            metadata: { channel: "whatsapp", duplicate: queued.duplicate },
            updatedAt: new Date(),
          },
        });

      if (!queued.duplicate) {
        queuedCount += 1;
      }
    }

    await db
      .update(campaigns)
      .set({
        status: campaign.status === "draft" ? "active" : campaign.status,
        launchedAt: campaign.launchedAt ?? new Date(),
        sentCount: queuedCount,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaign.id));

    return {
      campaignId: campaign.id,
      queuedCount,
      channel: "whatsapp",
    };
  }

  // Conflict guard: reject if campaign is already active (Req 1.10)
  if (campaign.status === "active") {
    throw AppError.conflict("Campaign is already active");
  }

  const queueable = recipients.filter((recipient) => recipient.email);
  if (queueable.length === 0) {
    throw AppError.conflict("Campaign has no deliverable email recipients");
  }

  const templateSubject = campaign.name;
  const templateContent = `<p>${campaign.notes ?? campaign.audienceDescription ?? campaign.name}</p>`;

  const jobs = [];
  for (const recipient of queueable) {
    const rendered = await renderTemplateContent({
      companyId: input.companyId,
      subject: templateSubject,
      content: templateContent,
      customerId: recipient.customerId,
    });

    jobs.push(
      queueEmailMessage({
        companyId: input.companyId,
        campaignId: campaign.id,
        createdBy: input.createdBy,
        customerId: recipient.customerId,
        recipientEmail: recipient.email as string,
        recipientName: recipient.fullName,
        subject: rendered.subject ?? campaign.name,
        htmlContent: rendered.content,
        metadata: {
          source: "campaign",
        },
      }),
    );
  }

  const queued = await Promise.all(jobs);

  await db
    .update(campaigns)
    .set({
      status: "active",
      launchedAt: new Date(),
      sentCount: queued.length,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaign.id));

  return {
    campaignId: campaign.id,
    queuedCount: queued.length,
  };
}

/**
 * Validates and launches an email campaign.
 * Checks status is draft/scheduled, validates recipients exist, then delegates to queueCampaignDelivery.
 */
export async function launchCampaign(
  companyId: string,
  campaignId: string,
  createdBy: string,
): Promise<{ campaignId: string; queuedCount: number }> {
  // 1. Load the campaign
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.companyId, companyId), eq(campaigns.id, campaignId), isNull(campaigns.deletedAt)))
    .limit(1);

  if (!campaign) {
    throw AppError.notFound("Campaign not found");
  }

  // 2. Validate status is launchable (Req 2.1, 2.2, 2.3)
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    throw AppError.conflict(`Campaign cannot be launched from status '${campaign.status}'`);
  }

  // 3. Validate at least one deliverable recipient exists (Req 2.4)
  const recipientsWithEmail = await db
    .select({ customerId: customers.id, email: customers.email })
    .from(campaignCustomers)
    .innerJoin(customers, eq(customers.id, campaignCustomers.customerId))
    .where(
      and(
        eq(campaignCustomers.companyId, companyId),
        eq(campaignCustomers.campaignId, campaignId),
        isNull(customers.deletedAt),
      ),
    );

  const deliverableCount = recipientsWithEmail.filter((r) => r.email).length;
  if (deliverableCount === 0) {
    throw AppError.conflict("Campaign has no deliverable email recipients");
  }

  // 4. Delegate to queueCampaignDelivery
  return queueCampaignDelivery({ companyId, campaignId, createdBy });
}

async function trackEmailEvent(input: {
  companyId: string;
  emailMessageId: string;
  trackingToken: string;
  eventType: "sent" | "delivered" | "opened" | "clicked" | "replied" | "failed";
  eventKey: string;
  url?: string | null;
  payload?: Record<string, unknown>;
}) {
  const [event] = await db
    .insert(emailTrackingEvents)
    .values({
      companyId: input.companyId,
      emailMessageId: input.emailMessageId,
      eventType: input.eventType,
      trackingToken: input.trackingToken,
      eventKey: input.eventKey,
      url: input.url ?? null,
      payload: input.payload ?? {},
    })
    .onConflictDoNothing({
      target: emailTrackingEvents.eventKey,
    })
    .returning();

  return event ?? null;
}

export async function recalculateCampaignAnalytics(companyId: string, campaignId: string) {
  const messages = await db
    .select({
      id: emailMessages.id,
      status: emailMessages.status,
    })
    .from(emailMessages)
    .where(and(eq(emailMessages.companyId, companyId), eq(emailMessages.campaignId, campaignId)));

  const messageIds = messages.map((message) => message.id);
  const events = messageIds.length
    ? await db
        .select({
          emailMessageId: emailTrackingEvents.emailMessageId,
          eventType: emailTrackingEvents.eventType,
        })
        .from(emailTrackingEvents)
        .where(inArray(emailTrackingEvents.emailMessageId, messageIds))
    : [];

  const openedCount = new Set(events.filter((event) => event.eventType === "opened").map((event) => event.emailMessageId)).size;
  const clickedCount = new Set(events.filter((event) => event.eventType === "clicked").map((event) => event.emailMessageId)).size;
  const repliedCount = new Set(events.filter((event) => event.eventType === "replied").map((event) => event.emailMessageId)).size;
  const bouncedCount = new Set(events.filter((event) => event.eventType === "failed").map((event) => event.emailMessageId)).size;
  const deliveredCount = new Set(
    events.filter((event) => event.eventType === "delivered" || event.eventType === "sent").map((event) => event.emailMessageId),
  ).size;
  const engagementScore = Math.max(0, Math.round(openedCount * 2 + clickedCount * 4 + repliedCount * 8 - bouncedCount * 3));

  await db
    .update(campaigns)
    .set({
      sentCount: messages.filter((message) => ["sent", "delivered"].includes(message.status)).length,
      deliveredCount,
      openedCount,
      clickedCount,
      replyCount: repliedCount,
      bounceCount: bouncedCount,
      engagementScore,
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, campaignId));

  const today = new Date();
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  await db
    .insert(emailAnalyticsDaily)
    .values({
      companyId,
      campaignId,
      day,
      sentCount: messages.filter((message) => ["sent", "delivered"].includes(message.status)).length,
      deliveredCount,
      openedCount,
      clickedCount,
      repliedCount,
      bouncedCount,
      engagementScore,
    })
    .onConflictDoUpdate({
      target: [emailAnalyticsDaily.companyId, emailAnalyticsDaily.campaignId, emailAnalyticsDaily.day],
      set: {
        sentCount: messages.filter((message) => ["sent", "delivered"].includes(message.status)).length,
        deliveredCount,
        openedCount,
        clickedCount,
        repliedCount,
        bouncedCount,
        engagementScore,
        updatedAt: new Date(),
      },
    });
}

/**
 * Computes the per-campaign batch limit for the email campaign worker.
 * Clamps mps to [1, 500] and multiplies by the interval in seconds, then rounds up.
 * Exported for unit testing.
 */
export function computeCampaignBatchLimit(mps: number, intervalMs: number): number {
  return Math.ceil(Math.max(1, Math.min(500, mps)) * (intervalMs / 1000));
}

/**
 * Processes queued email messages for all active email campaigns.
 * Called on each runtime worker tick to throttle campaign delivery.
 */
export async function processEmailCampaignQueue(): Promise<void> {
  const activeCampaigns = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.channel, "email"),
        eq(campaigns.status, "active"),
        isNull(campaigns.deletedAt),
      ),
    )
    .limit(10);

  for (const campaign of activeCampaigns) {
    try {
      const limit = computeCampaignBatchLimit(env.EMAIL_CAMPAIGN_MPS, env.RUNTIME_POLL_INTERVAL_MS);
      await processQueuedEmailMessages(limit, { campaignId: campaign.id });

      // Check if any messages remain in queued or sending state
      const remaining = await db
        .select({ id: emailMessages.id })
        .from(emailMessages)
        .where(
          and(
            eq(emailMessages.campaignId, campaign.id),
            or(
              eq(emailMessages.status, "queued"),
              eq(emailMessages.status, "sending"),
            ),
          ),
        )
        .limit(1);

      if (remaining.length === 0) {
        await db
          .update(campaigns)
          .set({
            status: "completed",
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(campaigns.id, campaign.id));

        await recalculateCampaignAnalytics(campaign.companyId, campaign.id);
      }
    } catch (error) {
      console.error(`[processEmailCampaignQueue] Error processing campaign ${campaign.id}:`, error);
    }
  }
}

export async function processQueuedEmailMessages(limit = 20, filter?: { companyId?: string; messageIds?: string[]; campaignId?: string }) {
  if (filter?.messageIds && filter.messageIds.length === 0) {
    return 0;
  }

  const now = new Date();
  const conditions = [
    eq(emailMessages.status, "queued"),
    or(isNull(emailMessages.scheduledAt), lte(emailMessages.scheduledAt, now)),
  ];

  if (filter?.companyId) {
    conditions.push(eq(emailMessages.companyId, filter.companyId));
  }
  if (filter?.messageIds) {
    conditions.push(inArray(emailMessages.id, filter.messageIds));
  }
  if (filter?.campaignId) {
    conditions.push(eq(emailMessages.campaignId, filter.campaignId));
  }

  const items = await db
    .select()
    .from(emailMessages)
    .where(and(...conditions))
    .orderBy(asc(emailMessages.createdAt))
    .limit(limit);

  if (items.length === 0) {
    return 0;
  }

  let processed = 0;
  for (const item of items) {
    const account = item.emailAccountId
      ? (
          await db
            .select()
            .from(emailAccounts)
            .where(and(eq(emailAccounts.id, item.emailAccountId), isNull(emailAccounts.deletedAt)))
            .limit(1)
        )[0] ?? null
      : await getDefaultEmailAccount(item.companyId);

    if (!account) {
      await db
        .update(emailMessages)
        .set({
          status: "failed",
          failedAt: new Date(),
          lastError: "No connected email account is available",
          updatedAt: new Date(),
        })
        .where(eq(emailMessages.id, item.id));
      await trackEmailEvent({
        companyId: item.companyId,
        emailMessageId: item.id,
        trackingToken: item.trackingToken,
        eventType: "failed",
        eventKey: `failed:${item.id}:missing-account`,
      });
      continue;
    }

    await db
      .update(emailMessages)
      .set({
        status: "sending",
        emailAccountId: account.id,
        updatedAt: new Date(),
      })
      .where(eq(emailMessages.id, item.id));

    try {
      const adapter = getEmailProviderAdapter(account.provider, account.credentials as Record<string, unknown>);
      // Requirement 7.4: skip tracking pixel injection for SMTP provider
      const htmlToSend = adapter instanceof SmtpEmailProvider
        ? item.htmlContent
        : injectTrackingPixel(item.htmlContent, item.trackingToken);
      const result = await adapter.send({
        fromName: account.fromName,
        fromEmail: account.fromEmail,
        toEmail: item.recipientEmail,
        toName: item.recipientName,
        subject: item.subject,
        html: htmlToSend,
        text: item.textContent,
      });

      await db
        .update(emailMessages)
        .set({
          status: result.deliveredAt ? "delivered" : "sent",
          provider: account.provider,
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          deliveredAt: result.deliveredAt ?? null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(emailMessages.id, item.id));

      await trackEmailEvent({
        companyId: item.companyId,
        emailMessageId: item.id,
        trackingToken: item.trackingToken,
        eventType: "sent",
        eventKey: `sent:${item.id}:${result.providerMessageId}`,
      });

      if (result.deliveredAt) {
        await trackEmailEvent({
          companyId: item.companyId,
          emailMessageId: item.id,
          trackingToken: item.trackingToken,
          eventType: "delivered",
          eventKey: `delivered:${item.id}:${result.providerMessageId}`,
        });
      }

      if (item.campaignId) {
        await recalculateCampaignAnalytics(item.companyId, item.campaignId);
      }

      processed += 1;
    } catch (error) {
      await db
        .update(emailMessages)
        .set({
          status: "failed",
          failedAt: new Date(),
          lastError: error instanceof Error ? error.message : "Email dispatch failed",
          updatedAt: new Date(),
        })
        .where(eq(emailMessages.id, item.id));
      await trackEmailEvent({
        companyId: item.companyId,
        emailMessageId: item.id,
        trackingToken: item.trackingToken,
        eventType: "failed",
        eventKey: `failed:${item.id}:${Date.now()}`,
        payload: {
          message: error instanceof Error ? error.message : "Email dispatch failed",
        },
      });
    }
  }

  return processed;
}

export async function getEmailMessageByTrackingToken(token: string) {
  const [message] = await db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.trackingToken, token))
    .limit(1);

  return message ?? null;
}

export async function recordEmailOpen(token: string) {
  const message = await getEmailMessageByTrackingToken(token);
  if (!message) {
    return null;
  }

  const event = await trackEmailEvent({
    companyId: message.companyId,
    emailMessageId: message.id,
    trackingToken: token,
    eventType: "opened",
    eventKey: `opened:${message.id}:${new Date().toISOString().slice(0, 16)}`,
  });

  if (message.campaignId) {
    await recalculateCampaignAnalytics(message.companyId, message.campaignId);
  }

  if (message.outreachContactId) {
    await db
      .update(outreachContacts)
      .set({
        status: "opened",
        openedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(outreachContacts.id, message.outreachContactId));
  }

  return { message, event };
}

export async function recordEmailClick(token: string, url: string) {
  const message = await getEmailMessageByTrackingToken(token);
  if (!message) {
    return null;
  }

  const event = await trackEmailEvent({
    companyId: message.companyId,
    emailMessageId: message.id,
    trackingToken: token,
    eventType: "clicked",
    eventKey: `clicked:${message.id}:${url}`,
    url,
  });

  if (message.campaignId) {
    await recalculateCampaignAnalytics(message.companyId, message.campaignId);
  }

  return { message, event };
}

export async function recordEmailReply(input: {
  trackingToken?: string;
  providerMessageId?: string;
  body: string;
  fromEmail: string;
}) {
  const [message] = input.trackingToken
    ? await db.select().from(emailMessages).where(eq(emailMessages.trackingToken, input.trackingToken)).limit(1)
    : await db.select().from(emailMessages).where(eq(emailMessages.providerMessageId, input.providerMessageId ?? "")).limit(1);

  if (!message) {
    throw AppError.notFound("Email message not found for reply webhook");
  }

  const event = await trackEmailEvent({
    companyId: message.companyId,
    emailMessageId: message.id,
    trackingToken: message.trackingToken,
    eventType: "replied",
    eventKey: `replied:${message.id}:${input.fromEmail}:${input.body.slice(0, 24)}`,
    payload: {
      fromEmail: input.fromEmail,
      body: input.body,
    },
  });

  if (message.campaignId) {
    await recalculateCampaignAnalytics(message.companyId, message.campaignId);
  }

  if (message.outreachContactId) {
    await db
      .update(outreachContacts)
      .set({
        status: "replied",
        repliedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(outreachContacts.id, message.outreachContactId));
  }

  return { message, event };
}

function normalizeResendEventType(type: string) {
  switch (type) {
    case "email.sent":
      return "sent";
    case "email.delivered":
      return "delivered";
    case "email.opened":
      return "opened";
    case "email.clicked":
      return "clicked";
    case "email.bounced":
      return "failed";
    case "email.complained":
      return "failed";
    case "email.received":
      return "replied";
    default:
      return null;
  }
}

export function verifyResendWebhook(rawBody: string, headers: Headers) {
  if (!env.RESEND_WEBHOOK_SECRET) {
    throw AppError.conflict("RESEND_WEBHOOK_SECRET is not configured");
  }

  const svixId = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    throw AppError.unauthorized("Missing Resend webhook signature headers");
  }

  const webhook = new Webhook(env.RESEND_WEBHOOK_SECRET);
  return webhook.verify(rawBody, {
    "svix-id": svixId,
    "svix-timestamp": svixTimestamp,
    "svix-signature": svixSignature,
  }) as Record<string, unknown>;
}

function extractResendMessageId(data: Record<string, unknown>) {
  return [
    data.email_id,
    data.id,
    typeof data.data === "object" && data.data ? (data.data as Record<string, unknown>).email_id : undefined,
    typeof data.data === "object" && data.data ? (data.data as Record<string, unknown>).id : undefined,
    typeof data.in_reply_to === "string" ? data.in_reply_to : undefined,
  ].find((value): value is string => typeof value === "string" && value.length > 0);
}

export async function handleResendWebhook(rawBody: string, headers: Headers) {
  const payload = verifyResendWebhook(rawBody, headers);
  const eventTypeRaw = typeof payload.type === "string" ? payload.type : "";
  const mappedType = normalizeResendEventType(eventTypeRaw);
  if (!mappedType) {
    return { accepted: true, ignored: true as const };
  }

  const data = typeof payload.data === "object" && payload.data ? (payload.data as Record<string, unknown>) : payload;
  const providerMessageId = extractResendMessageId(data);
  if (!providerMessageId) {
    throw AppError.badRequest("Resend webhook payload is missing a provider message id");
  }

  const [message] = await db.select().from(emailMessages).where(eq(emailMessages.providerMessageId, providerMessageId)).limit(1);
  if (!message) {
    return { accepted: true, ignored: true as const };
  }

  const eventKey = `resend:${eventTypeRaw}:${providerMessageId}:${String(payload.created_at ?? data.created_at ?? Date.now())}`;
  const clickedUrl =
    typeof data.url === "string"
      ? data.url
      : typeof data.link === "string"
        ? data.link
        : null;

  if (mappedType === "replied") {
    await recordEmailReply({
      providerMessageId,
      fromEmail: typeof data.from === "string" ? data.from : "unknown@reply.local",
      body: typeof data.text === "string" ? data.text : typeof data.html === "string" ? data.html : "Reply received",
    });
  } else {
    await trackEmailEvent({
      companyId: message.companyId,
      emailMessageId: message.id,
      trackingToken: message.trackingToken,
      eventType: mappedType,
      eventKey,
      url: mappedType === "clicked" ? clickedUrl : null,
      payload: data,
    });
  }

  const updateFields: Partial<typeof emailMessages.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (mappedType === "delivered") {
    updateFields.status = "delivered";
    updateFields.deliveredAt = new Date();
  } else if (mappedType === "sent") {
    updateFields.status = "sent";
    updateFields.sentAt = new Date();
  } else if (mappedType === "failed") {
    updateFields.status = "failed";
    updateFields.failedAt = new Date();
  }

  if (Object.keys(updateFields).length > 1) {
    await db.update(emailMessages).set(updateFields).where(eq(emailMessages.id, message.id));
  }

  if (message.outreachContactId && mappedType === "failed") {
    await db
      .update(outreachContacts)
      .set({
        status: "bounced",
        updatedAt: new Date(),
      })
      .where(eq(outreachContacts.id, message.outreachContactId));
  }

  if (message.campaignId) {
    await recalculateCampaignAnalytics(message.companyId, message.campaignId);
  }

  return {
    accepted: true,
    eventType: mappedType,
    providerMessageId,
    messageId: message.id,
    message,
  };
}

export async function queueLeadEmail(input: {
  companyId: string;
  automationId?: string | null;
  automationRunId?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  subjectTemplate: string;
  bodyTemplate: string;
  variables?: Record<string, unknown>;
  createdBy?: string | null;
}) {
  let recipientEmail = input.recipientEmail ?? null;
  let recipientName = input.recipientName ?? null;

  if (!recipientEmail && input.leadId) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
    recipientEmail = lead?.email ?? null;
    recipientName = lead?.fullName ?? lead?.title ?? null;
  }

  if (!recipientEmail && input.customerId) {
    const [customer] = await db.select().from(customers).where(eq(customers.id, input.customerId)).limit(1);
    recipientEmail = customer?.email ?? null;
    recipientName = customer?.fullName ?? null;
  }

  if (!recipientEmail) {
    throw AppError.badRequest("Email action requires a deliverable recipient email");
  }

  const rendered = await renderTemplateContent({
    companyId: input.companyId,
    subject: input.subjectTemplate,
    content: input.bodyTemplate,
    leadId: input.leadId,
    customerId: input.customerId,
    variables: input.variables,
  });

  return queueEmailMessage({
    companyId: input.companyId,
    automationId: input.automationId ?? null,
    automationRunId: input.automationRunId ?? null,
    leadId: input.leadId ?? null,
    customerId: input.customerId ?? null,
    recipientEmail,
    recipientName,
    subject: rendered.subject ?? input.subjectTemplate,
    htmlContent: rendered.content,
    createdBy: input.createdBy ?? null,
    metadata: {
      source: "automation",
    },
  });
}
