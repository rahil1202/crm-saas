import { and, count, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { documents, emailAccounts, socialAccounts, socialConversations, whatsappTemplates, whatsappWorkspaces } from "@/db/schema";
import { env } from "@/lib/config";
import { getCompanySettings } from "@/lib/company-settings";

type ReadinessItem = {
  key: string;
  label: string;
  ready: boolean;
  detail: string;
};

function summarizeReadiness(items: ReadinessItem[]) {
  const readyCount = items.filter((item) => item.ready).length;
  const score = items.length ? Math.round((readyCount / items.length) * 100) : 0;
  const status = score >= 85 ? "ready" : score >= 50 ? "in_progress" : "needs_setup";
  return { score, status, items };
}

const docsCheckedAt = "2026-04-04";

export async function getIntegrationHub(companyId: string) {
  const settings = await getCompanySettings(companyId);

  const [
    emailAccountStats,
    whatsappWorkspaceStats,
    whatsappTemplateStats,
    whatsappSocialStats,
    linkedinAccountStats,
    socialConversationStats,
    documentStats,
  ] = await Promise.all([
    db
      .select({
        total: count(),
      })
      .from(emailAccounts)
      .where(and(eq(emailAccounts.companyId, companyId), isNull(emailAccounts.deletedAt))),
    db
      .select({
        total: count(),
      })
      .from(whatsappWorkspaces)
      .where(and(eq(whatsappWorkspaces.companyId, companyId), isNull(whatsappWorkspaces.deletedAt))),
    db
      .select({
        total: count(),
      })
      .from(whatsappTemplates)
      .where(and(eq(whatsappTemplates.companyId, companyId), isNull(whatsappTemplates.deletedAt))),
    db
      .select({
        total: count(),
      })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.companyId, companyId), eq(socialAccounts.platform, "whatsapp"), isNull(socialAccounts.deletedAt))),
    db
      .select({
        total: count(),
      })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.companyId, companyId), eq(socialAccounts.platform, "linkedin"), isNull(socialAccounts.deletedAt))),
    db
      .select({
        total: count(),
      })
      .from(socialConversations)
      .where(and(eq(socialConversations.companyId, companyId), isNull(socialConversations.deletedAt))),
    db
      .select({
        total: count(),
      })
      .from(documents)
      .where(and(eq(documents.companyId, companyId), isNull(documents.deletedAt))),
  ]);

  const emailAccountsTotal = emailAccountStats[0]?.total ?? 0;
  const whatsappWorkspacesTotal = whatsappWorkspaceStats[0]?.total ?? 0;
  const whatsappTemplatesTotal = whatsappTemplateStats[0]?.total ?? 0;
  const whatsappAccountsTotal = whatsappSocialStats[0]?.total ?? 0;
  const linkedinAccountsTotal = linkedinAccountStats[0]?.total ?? 0;
  const socialConversationsTotal = socialConversationStats[0]?.total ?? 0;
  const documentsTotal = documentStats[0]?.total ?? 0;

  const emailReadiness = summarizeReadiness([
    {
      key: "provider",
      label: "Provider selected",
      ready: Boolean(settings.integrations.email.provider ?? settings.integrations.emailProvider),
      detail: settings.integrations.email.provider ?? settings.integrations.emailProvider ?? "Pick Resend, SMTP, or another delivery provider.",
    },
    {
      key: "domain",
      label: "From identity mapped",
      ready: Boolean(settings.integrations.email.fromEmail || settings.integrations.email.domain || emailAccountsTotal > 0),
      detail: settings.integrations.email.fromEmail ?? settings.integrations.email.domain ?? "Set a sending domain or default from address.",
    },
    {
      key: "delivery",
      label: "Delivery credentials ready",
      ready:
        settings.integrations.email.deliveryMethod === "smtp"
          ? Boolean(settings.integrations.email.smtpHost && settings.integrations.email.smtpPort)
          : Boolean(env.RESEND_API_KEY || emailAccountsTotal > 0),
      detail:
        settings.integrations.email.deliveryMethod === "smtp"
          ? settings.integrations.email.smtpHost
            ? `SMTP host ${settings.integrations.email.smtpHost}:${settings.integrations.email.smtpPort ?? "?"}`
            : "Add SMTP host and port for the selected MTA."
          : env.RESEND_API_KEY
            ? "Resend API key is configured in the environment."
            : "No global API key found. Use a connected email account or add provider credentials.",
    },
    {
      key: "webhooks",
      label: "Tracking webhook ready",
      ready: Boolean(env.RESEND_WEBHOOK_SECRET || settings.integrations.email.webhookUrl),
      detail: env.RESEND_WEBHOOK_SECRET
        ? `${env.BACKEND_URL}/api/v1/public/email/resend/webhook`
        : settings.integrations.email.webhookUrl ?? "Add a webhook target so delivery, open, click, and reply events can be ingested.",
    },
  ]);

  const whatsappReadiness = summarizeReadiness([
    {
      key: "provider",
      label: "Provider selected",
      ready: Boolean(settings.integrations.whatsapp.provider ?? settings.integrations.whatsappProvider),
      detail: settings.integrations.whatsapp.provider ?? settings.integrations.whatsappProvider ?? "Pick Meta Cloud API or the provider you route WhatsApp through.",
    },
    {
      key: "workspace",
      label: "Workspace or phone number mapped",
      ready: Boolean(settings.integrations.whatsapp.workspaceId || settings.integrations.whatsapp.phoneNumberId || whatsappWorkspacesTotal > 0),
      detail:
        settings.integrations.whatsapp.phoneNumberId ??
        settings.integrations.whatsapp.workspaceId ??
        (whatsappWorkspacesTotal > 0 ? `${whatsappWorkspacesTotal} workspace record(s) available.` : "Add a WhatsApp workspace and phone number mapping."),
    },
    {
      key: "verification",
      label: "Webhook verification ready",
      ready: Boolean(
        env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
          settings.integrations.whatsapp.verifyToken ||
          settings.integrations.whatsapp.webhookUrl,
      ),
      detail:
        env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || settings.integrations.whatsapp.verifyToken
          ? `${env.BACKEND_URL}/api/v1/public/whatsapp/webhook`
          : "Configure a verify token and webhook endpoint for the Meta app.",
    },
    {
      key: "secret",
      label: "App secret or token present",
      ready: Boolean(env.WHATSAPP_APP_SECRET || env.WHATSAPP_ACCESS_TOKEN || settings.integrations.whatsapp.appSecret),
      detail:
        env.WHATSAPP_APP_SECRET || env.WHATSAPP_ACCESS_TOKEN
          ? "Global WhatsApp credentials are present in the environment."
          : settings.integrations.whatsapp.appSecret
            ? "Workspace-specific app secret stored in settings."
            : "Add the app secret or long-lived access token before enabling live sending.",
    },
  ]);

  const linkedinReadiness = summarizeReadiness([
    {
      key: "product",
      label: "LinkedIn product flow chosen",
      ready: Boolean(settings.integrations.linkedin.provider),
      detail: settings.integrations.linkedin.provider ?? "Choose whether you are implementing Lead Sync, posting, or both.",
    },
    {
      key: "org",
      label: "Organization mapped",
      ready: Boolean(settings.integrations.linkedin.organizationUrn),
      detail: settings.integrations.linkedin.organizationUrn ?? "Map the LinkedIn organization URN used for lead routing or publishing.",
    },
    {
      key: "scopes",
      label: "Scopes documented",
      ready: settings.integrations.linkedin.scopes.length > 0,
      detail:
        settings.integrations.linkedin.scopes.join(", ") ||
        "List the approved scopes before implementing OAuth and production access.",
    },
    {
      key: "webhook",
      label: "Lead handoff endpoint planned",
      ready: Boolean(settings.integrations.linkedin.webhookUrl || settings.integrations.linkedin.adAccountUrns.length > 0),
      detail:
        settings.integrations.linkedin.webhookUrl ??
        (settings.integrations.linkedin.adAccountUrns.length > 0
          ? `${settings.integrations.linkedin.adAccountUrns.length} ad account URN(s) configured.`
          : "Add a lead sync webhook/polling endpoint and the ad accounts you plan to sync."),
    },
  ]);

  const documentsReadiness = summarizeReadiness([
    {
      key: "storage",
      label: "Storage path configured",
      ready: Boolean(env.FILE_STORAGE_DIR),
      detail: env.FILE_STORAGE_DIR,
    },
    {
      key: "auto_attach",
      label: "Auto-attach behavior defined",
      ready: settings.integrations.documents.autoAttachToRecords,
      detail: settings.integrations.documents.autoAttachToRecords
        ? "Inbound documents should be attached to CRM records when a match exists."
        : "Auto-attach is disabled. Operators will need to map documents manually.",
    },
    {
      key: "intake",
      label: "Document intake route planned",
      ready: Boolean(settings.integrations.documents.intakeEmail || settings.integrations.genericWebhooks.inboundUrl),
      detail:
        settings.integrations.documents.intakeEmail ??
        settings.integrations.genericWebhooks.inboundUrl ??
        "Add an intake email or inbound webhook for attachments and external document drops.",
    },
  ]);

  const genericWebhookReadiness = summarizeReadiness([
    {
      key: "inbound",
      label: "Inbound endpoint configured",
      ready: Boolean(settings.integrations.genericWebhooks.inboundUrl || settings.integrations.webhookUrl),
      detail: settings.integrations.genericWebhooks.inboundUrl ?? settings.integrations.webhookUrl ?? "Add an inbound webhook target.",
    },
    {
      key: "outbound",
      label: "Outbound endpoint configured",
      ready: Boolean(settings.integrations.genericWebhooks.outboundUrl || settings.integrations.slackWebhookUrl),
      detail:
        settings.integrations.genericWebhooks.outboundUrl ??
        settings.integrations.slackWebhookUrl ??
        "Add an outbound webhook or Slack destination.",
    },
    {
      key: "signing",
      label: "Signing strategy defined",
      ready: Boolean(settings.integrations.genericWebhooks.signingSecretHint),
      detail: settings.integrations.genericWebhooks.signingSecretHint ?? "Document how inbound/outbound payloads are signed and verified.",
    },
  ]);

  const channels = [
    {
      key: "email",
      title: "Email + MTA",
      description: "Delivery provider, sender identity, webhooks, and SMTP fallback for campaigns and automations.",
      docs: [
        { label: "Supabase social login", url: "https://supabase.com/docs/guides/auth/social-login", source: "Supabase", checkedAt: docsCheckedAt },
        { label: "Supabase Google OAuth", url: "https://supabase.com/docs/guides/auth/social-login/auth-google", source: "Supabase", checkedAt: docsCheckedAt },
        { label: "Supabase Azure OAuth", url: "https://supabase.com/docs/guides/auth/social-login/auth-azure", source: "Supabase", checkedAt: docsCheckedAt },
        { label: "Resend docs", url: "https://resend.com/docs/introduction", source: "Resend", checkedAt: docsCheckedAt },
        { label: "Resend domains", url: "https://resend.com/docs/dashboard/domains/introduction", source: "Resend", checkedAt: docsCheckedAt },
        { label: "Resend SMTP", url: "https://resend.com/docs/send-with-smtp", source: "Resend", checkedAt: docsCheckedAt },
        { label: "Resend webhooks", url: "https://resend.com/docs/dashboard/webhooks", source: "Resend", checkedAt: docsCheckedAt },
      ],
      recommendedFlow: [
        "Pick one primary delivery path per company: API-first provider or SMTP relay.",
        "Map a verified sender domain and default from/reply-to identity before enabling campaigns.",
        "Register delivery/open/click/reply webhooks before trusting analytics or automation triggers.",
        "Keep account-level credentials in provider records and company-level policy in settings.",
      ],
      readiness: emailReadiness,
      records: {
        emailAccounts: emailAccountsTotal,
      },
      config: settings.integrations.email,
    },
    {
      key: "whatsapp",
      title: "WhatsApp",
      description: "Meta Cloud API onboarding, workspace mapping, verification, and template/runtime readiness.",
      docs: [
        { label: "Cloud API get started", url: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started", source: "Meta", checkedAt: docsCheckedAt },
        { label: "Cloud API webhooks", url: "https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks", source: "Meta", checkedAt: docsCheckedAt },
        { label: "Embedded signup", url: "https://developers.facebook.com/docs/whatsapp/embedded-signup", source: "Meta", checkedAt: docsCheckedAt },
      ],
      recommendedFlow: [
        "Start with a single active workspace per phone number, then map templates and social inbox accounts onto it.",
        "Treat verify token, app secret, and access token as runtime prerequisites before enabling live sends.",
        "Keep phone number IDs and business account IDs in one place so runtime, inbox, and template sync use the same identifiers.",
      ],
      readiness: whatsappReadiness,
      records: {
        workspaces: whatsappWorkspacesTotal,
        templates: whatsappTemplatesTotal,
        socialAccounts: whatsappAccountsTotal,
      },
      config: settings.integrations.whatsapp,
    },
    {
      key: "linkedin",
      title: "LinkedIn",
      description: "Lead Sync and organization publishing planning, with the access constraints surfaced up front.",
      docs: [
        { label: "Supabase LinkedIn OAuth", url: "https://supabase.com/docs/guides/auth/social-login/auth-linkedin", source: "Supabase", checkedAt: docsCheckedAt },
        { label: "Marketing APIs overview", url: "https://learn.microsoft.com/en-us/linkedin/marketing/?view=li-lms-2026-03", source: "Microsoft Learn", checkedAt: docsCheckedAt },
        { label: "Lead sync requirements", url: "https://learn.microsoft.com/en-us/linkedin/marketing/lead-sync/marketing-leads-integration-requirements?view=li-lms-2026-01", source: "Microsoft Learn", checkedAt: docsCheckedAt },
        { label: "Lead Sync API", url: "https://learn.microsoft.com/en-us/linkedin/marketing/lead-sync/leadsync?view=li-lms-2025-11", source: "Microsoft Learn", checkedAt: docsCheckedAt },
      ],
      recommendedFlow: [
        "Decide whether the integration is for Lead Sync, organization posting, or both before requesting scopes.",
        "Capture organization URNs, ad account URNs, and required scopes in settings before implementing OAuth.",
        "Assume production access will require LinkedIn approval and partner/compliance review, not only a token exchange.",
      ],
      readiness: linkedinReadiness,
      records: {
        linkedAccounts: linkedinAccountsTotal,
      },
      config: settings.integrations.linkedin,
    },
    {
      key: "documents",
      title: "Documents",
      description: "Document intake and auto-association policy for uploaded files, forwarded attachments, and future inbound capture.",
      docs: [],
      recommendedFlow: [
        "Keep document intake separate from CRM entity assignment, then auto-attach only when a reliable match exists.",
        "Use one inbound intake path per company so support, campaigns, and partners do not invent their own upload routes.",
      ],
      readiness: documentsReadiness,
      records: {
        documents: documentsTotal,
      },
      config: settings.integrations.documents,
    },
    {
      key: "webhooks",
      title: "Generic webhooks",
      description: "Shared inbound and outbound endpoints for Slack, external tools, and non-native connectors.",
      docs: [],
      recommendedFlow: [
        "Separate inbound ingestion from outbound fan-out so retries and signing rules stay clear.",
        "Document the signing contract once and reuse it across Slack, custom automations, and document intake hooks.",
      ],
      readiness: genericWebhookReadiness,
      records: {
        socialConversations: socialConversationsTotal,
      },
      config: settings.integrations.genericWebhooks,
    },
  ];

  const attentionRequired = channels.filter((channel) => channel.readiness.status !== "ready").length;

  return {
    checkedAt: docsCheckedAt,
    overview: {
      attentionRequired,
      readyChannels: channels.filter((channel) => channel.readiness.status === "ready").length,
      connectedAssets: emailAccountsTotal + whatsappWorkspacesTotal + whatsappAccountsTotal + linkedinAccountsTotal,
      trackedDocuments: documentsTotal,
      socialConversations: socialConversationsTotal,
    },
    workspaceMode: settings.integrations.workspaceMode,
    compatibility: {
      legacyFields: {
        slackWebhookUrl: settings.integrations.slackWebhookUrl,
        whatsappProvider: settings.integrations.whatsappProvider,
        emailProvider: settings.integrations.emailProvider,
        webhookUrl: settings.integrations.webhookUrl,
      },
    },
    channels,
  };
}
