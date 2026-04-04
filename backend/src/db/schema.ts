import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const companyRoleEnum = pgEnum("company_role", ["owner", "admin", "member"]);
export const membershipStatusEnum = pgEnum("membership_status", ["active", "invited", "disabled"]);
export const inviteStatusEnum = pgEnum("invite_status", ["pending", "accepted", "revoked", "expired"]);
export const referralAttributionStatusEnum = pgEnum("referral_attribution_status", [
  "captured",
  "registered",
  "verified",
  "joined_company",
  "completed_onboarding",
]);
export const leadStatusEnum = pgEnum("lead_status", ["new", "qualified", "proposal", "won", "lost"]);
export const dealStatusEnum = pgEnum("deal_status", ["open", "won", "lost"]);
export const taskStatusEnum = pgEnum("task_status", ["todo", "in_progress", "done", "overdue"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high"]);
export const followUpStatusEnum = pgEnum("follow_up_status", ["pending", "completed", "missed", "canceled"]);
export const partnerStatusEnum = pgEnum("partner_status", ["active", "inactive"]);
export const partnerAccessLevelEnum = pgEnum("partner_access_level", ["restricted", "standard", "manager"]);
export const campaignStatusEnum = pgEnum("campaign_status", ["draft", "scheduled", "active", "completed", "paused"]);
export const templateTypeEnum = pgEnum("template_type", ["email", "whatsapp", "sms", "task", "pipeline"]);
export const automationStatusEnum = pgEnum("automation_status", ["active", "paused"]);
export const automationRunStatusEnum = pgEnum("automation_run_status", ["queued", "running", "completed", "failed", "canceled"]);
export const automationStepStatusEnum = pgEnum("automation_step_status", ["pending", "running", "completed", "failed", "canceled", "scheduled"]);
export const chatbotFlowStatusEnum = pgEnum("chatbot_flow_status", ["draft", "published", "archived"]);
export const chatbotFlowEntryChannelEnum = pgEnum("chatbot_flow_entry_channel", ["whatsapp"]);
export const chatbotFlowVersionStateEnum = pgEnum("chatbot_flow_version_state", ["draft", "published"]);
export const chatbotFlowExecutionStatusEnum = pgEnum("chatbot_flow_execution_status", ["running", "paused", "completed", "failed", "canceled"]);
export const notificationTypeEnum = pgEnum("notification_type", ["lead", "deal", "task", "campaign"]);
export const documentEntityTypeEnum = pgEnum("document_entity_type", ["general", "lead", "deal", "customer"]);
export const socialPlatformEnum = pgEnum("social_platform", ["instagram", "facebook", "whatsapp", "linkedin"]);
export const socialAccountStatusEnum = pgEnum("social_account_status", ["connected", "disconnected"]);
export const socialConversationStatusEnum = pgEnum("social_conversation_status", ["open", "assigned", "closed"]);
export const socialMessageDirectionEnum = pgEnum("social_message_direction", ["inbound", "outbound"]);
export const companyPlanStatusEnum = pgEnum("company_plan_status", ["trial", "active", "past_due", "canceled"]);
export const companyPlanIntervalEnum = pgEnum("company_plan_interval", ["monthly", "yearly", "custom"]);
export const emailAccountStatusEnum = pgEnum("email_account_status", ["connected", "disconnected"]);
export const emailMessageStatusEnum = pgEnum("email_message_status", ["queued", "sending", "sent", "delivered", "failed"]);
export const emailEventTypeEnum = pgEnum("email_event_type", ["sent", "delivered", "opened", "clicked", "replied", "failed"]);
export const conversationStateStatusEnum = pgEnum("conversation_state_status", ["active", "paused", "completed", "expired"]);
export const whatsappTemplateStatusEnum = pgEnum("whatsapp_template_status", ["draft", "approved", "rejected", "paused"]);
export const sequenceStatusEnum = pgEnum("sequence_status", ["draft", "active", "paused", "archived"]);
export const sequenceStepChannelEnum = pgEnum("sequence_step_channel", ["email", "whatsapp"]);
export const sequenceRunStatusEnum = pgEnum("sequence_run_status", ["queued", "running", "completed", "failed", "skipped", "canceled"]);
export const authSessionStatusEnum = pgEnum("auth_session_status", ["active", "revoked", "expired"]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  fullName: varchar("full_name", { length: 180 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  timezone: varchar("timezone", { length: 80 }).notNull().default("UTC"),
  currency: varchar("currency", { length: 8 }).notNull().default("USD"),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const companyPlans = pgTable(
  "company_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    planCode: varchar("plan_code", { length: 80 }).notNull().default("starter"),
    planName: varchar("plan_name", { length: 120 }).notNull().default("Starter"),
    status: companyPlanStatusEnum("status").notNull().default("trial"),
    billingInterval: companyPlanIntervalEnum("billing_interval").notNull().default("monthly"),
    seatLimit: integer("seat_limit").notNull().default(5),
    monthlyPrice: integer("monthly_price").notNull().default(0),
    currency: varchar("currency", { length: 8 }).notNull().default("USD"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    renewalDate: timestamp("renewal_date", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    companyUnique: uniqueIndex("company_plans_company_unique").on(table.companyId),
    byStatusIdx: index("company_plans_status_idx").on(table.status),
  }),
);

export const superAdmins = pgTable(
  "super_admins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userUnique: uniqueIndex("super_admins_user_unique").on(table.userId),
    emailUnique: uniqueIndex("super_admins_email_unique").on(table.email),
    activeIdx: index("super_admins_active_idx").on(table.isActive),
  }),
);

export const companySettings = pgTable(
  "company_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    defaultDealPipeline: varchar("default_deal_pipeline", { length: 100 }).notNull().default("default"),
    dealPipelines: jsonb("deal_pipelines")
      .$type<Array<{ key: string; label: string; stages: Array<{ key: string; label: string }> }>>()
      .notNull()
      .default([
        {
          key: "default",
          label: "Default Pipeline",
          stages: [
            { key: "new", label: "New" },
            { key: "qualified", label: "Qualified" },
            { key: "proposal", label: "Proposal" },
            { key: "negotiation", label: "Negotiation" },
            { key: "won", label: "Won" },
          ],
        },
      ]),
    leadSources: jsonb("lead_sources")
      .$type<Array<{ key: string; label: string }>>()
      .notNull()
      .default([
        { key: "website", label: "Website" },
        { key: "referral", label: "Referral" },
        { key: "walk_in", label: "Walk In" },
        { key: "campaign", label: "Campaign" },
      ]),
    businessHours: jsonb("business_hours")
      .$type<Array<{ day: string; enabled: boolean; open: string; close: string }>>()
      .notNull()
      .default([
        { day: "monday", enabled: true, open: "09:00", close: "18:00" },
        { day: "tuesday", enabled: true, open: "09:00", close: "18:00" },
        { day: "wednesday", enabled: true, open: "09:00", close: "18:00" },
        { day: "thursday", enabled: true, open: "09:00", close: "18:00" },
        { day: "friday", enabled: true, open: "09:00", close: "18:00" },
        { day: "saturday", enabled: false, open: "10:00", close: "14:00" },
        { day: "sunday", enabled: false, open: "00:00", close: "00:00" },
      ]),
    branding: jsonb("branding")
      .$type<{ companyLabel: string; primaryColor: string; accentColor: string; logoUrl: string | null }>()
      .notNull()
      .default({
        companyLabel: "",
        primaryColor: "#102031",
        accentColor: "#d97706",
        logoUrl: null,
      }),
    customFields: jsonb("custom_fields")
      .$type<
        Array<{
          key: string;
          label: string;
          entity: "lead" | "customer" | "deal";
          type: "text" | "number" | "date" | "select";
          options?: string[];
          required: boolean;
        }>
      >()
      .notNull()
      .default([]),
    tags: jsonb("tags")
      .$type<Array<{ key: string; label: string; color: string }>>()
      .notNull()
      .default([]),
    notificationRules: jsonb("notification_rules")
      .$type<{
        emailAlerts: boolean;
        taskReminders: boolean;
        overdueDigest: boolean;
        dealStageAlerts: boolean;
        campaignAlerts: boolean;
      }>()
      .notNull()
      .default({
        emailAlerts: true,
        taskReminders: true,
        overdueDigest: true,
        dealStageAlerts: true,
        campaignAlerts: true,
      }),
    integrations: jsonb("integrations")
      .$type<{
        slackWebhookUrl: string | null;
        whatsappProvider: string | null;
        emailProvider: string | null;
        webhookUrl: string | null;
        workspaceMode?: "guided" | "legacy";
        email?: {
          provider: string | null;
          deliveryMethod: "api" | "smtp" | "hybrid";
          oauthScopes: string[];
          fromEmail: string | null;
          fromName: string | null;
          replyToEmail: string | null;
          domain: string | null;
          webhookUrl: string | null;
          smtpHost: string | null;
          smtpPort: number | null;
          notes: string | null;
        };
        whatsapp?: {
          provider: string | null;
          onboardingMethod: "cloud_api" | "embedded_signup" | "manual_token";
          workspaceId: string | null;
          phoneNumberId: string | null;
          businessAccountId: string | null;
          verifyToken: string | null;
          appSecret: string | null;
          webhookUrl: string | null;
          notes: string | null;
        };
        linkedin?: {
          provider: string | null;
          syncMode: "oauth_pull" | "oauth_push" | "hybrid";
          organizationUrn: string | null;
          adAccountUrns: string[];
          webhookUrl: string | null;
          scopes: string[];
          features: {
            leadSync: boolean;
            orgPosting: boolean;
          };
          notes: string | null;
        };
        documents?: {
          intakeEmail: string | null;
          autoAttachToRecords: boolean;
          storageFolder: string | null;
          notes: string | null;
        };
        genericWebhooks?: {
          inboundUrl: string | null;
          outboundUrl: string | null;
          signingSecretHint: string | null;
        };
      }>()
      .notNull()
      .default({
        slackWebhookUrl: null,
        whatsappProvider: null,
        emailProvider: null,
        webhookUrl: null,
        workspaceMode: "guided",
        email: {
          provider: null,
          deliveryMethod: "api",
          oauthScopes: [],
          fromEmail: null,
          fromName: null,
          replyToEmail: null,
          domain: null,
          webhookUrl: null,
          smtpHost: null,
          smtpPort: null,
          notes: null,
        },
        whatsapp: {
          provider: null,
          onboardingMethod: "cloud_api",
          workspaceId: null,
          phoneNumberId: null,
          businessAccountId: null,
          verifyToken: null,
          appSecret: null,
          webhookUrl: null,
          notes: null,
        },
        linkedin: {
          provider: null,
          syncMode: "oauth_pull",
          organizationUrn: null,
          adAccountUrns: [],
          webhookUrl: null,
          scopes: [],
          features: {
            leadSync: true,
            orgPosting: false,
          },
          notes: null,
        },
        documents: {
          intakeEmail: null,
          autoAttachToRecords: true,
          storageFolder: null,
          notes: null,
        },
        genericWebhooks: {
          inboundUrl: null,
          outboundUrl: null,
          signingSecretHint: null,
        },
      }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    companyUnique: uniqueIndex("company_settings_company_unique").on(table.companyId),
  }),
  );

export const partnerCompanies = pgTable(
  "partner_companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    contactName: varchar("contact_name", { length: 180 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    notes: text("notes"),
    status: partnerStatusEnum("status").notNull().default("active"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    byCompanyIdx: index("partner_companies_company_idx").on(table.companyId),
    byStatusIdx: index("partner_companies_status_idx").on(table.companyId, table.status),
  }),
);

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    companyCodeUnique: uniqueIndex("stores_company_code_unique").on(table.companyId, table.code),
  }),
);

export const companyMemberships = pgTable(
  "company_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: companyRoleEnum("role").notNull().default("member"),
    status: membershipStatusEnum("status").notNull().default("active"),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    companyUserUnique: uniqueIndex("company_memberships_company_user_unique").on(table.companyId, table.userId),
    byUserIdx: index("company_memberships_user_idx").on(table.userId),
    byCompanyIdx: index("company_memberships_company_idx").on(table.companyId),
  }),
);

export const companyInvites = pgTable(
  "company_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    role: companyRoleEnum("role").notNull().default("member"),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    token: text("token").notNull(),
    referralCode: varchar("referral_code", { length: 80 }),
    inviteMessage: text("invite_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    status: inviteStatusEnum("status").notNull().default("pending"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => profiles.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("company_invites_token_unique").on(table.token),
    companyEmailIdx: index("company_invites_company_email_idx").on(table.companyId, table.email),
  }),
);

export const referralCodes = pgTable(
  "referral_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    referrerUserId: uuid("referrer_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 80 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    codeUnique: uniqueIndex("referral_codes_code_unique").on(table.code),
    companyReferrerIdx: index("referral_codes_company_referrer_idx").on(table.companyId, table.referrerUserId, table.createdAt),
  }),
);

export const referralAttributions = pgTable(
  "referral_attributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    referralCodeId: uuid("referral_code_id")
      .notNull()
      .references(() => referralCodes.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    referrerUserId: uuid("referrer_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    referredUserId: uuid("referred_user_id").references(() => profiles.id, { onDelete: "set null" }),
    referredEmail: varchar("referred_email", { length: 320 }),
    inviteId: uuid("invite_id").references(() => companyInvites.id, { onDelete: "set null" }),
    status: referralAttributionStatusEnum("status").notNull().default("captured"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    joinedCompanyAt: timestamp("joined_company_at", { withTimezone: true }),
    completedOnboardingAt: timestamp("completed_onboarding_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    codeUserUnique: uniqueIndex("referral_attributions_code_user_unique").on(table.referralCodeId, table.referredUserId),
    codeEmailUnique: uniqueIndex("referral_attributions_code_email_unique").on(table.referralCodeId, table.referredEmail),
    companyStatusIdx: index("referral_attributions_company_status_idx").on(table.companyId, table.status, table.createdAt),
    referrerIdx: index("referral_attributions_referrer_idx").on(table.referrerUserId, table.createdAt),
  }),
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    partnerCompanyId: uuid("partner_company_id").references(() => partnerCompanies.id, { onDelete: "set null" }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => profiles.id, { onDelete: "set null" }),
    title: varchar("title", { length: 180 }).notNull(),
    fullName: varchar("full_name", { length: 180 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    source: varchar("source", { length: 100 }),
    status: leadStatusEnum("status").notNull().default("new"),
    score: integer("score").notNull().default(0),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
      byCompanyIdx: index("leads_company_idx").on(table.companyId),
      byCompanyStatusIdx: index("leads_company_status_idx").on(table.companyId, table.status),
      byAssignedIdx: index("leads_assigned_idx").on(table.assignedToUserId),
      byPartnerIdx: index("leads_partner_idx").on(table.partnerCompanyId),
    }),
  );

export const leadActivities = pgTable("lead_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => profiles.id),
  type: varchar("type", { length: 80 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    fullName: varchar("full_name", { length: 180 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    byCompanyIdx: index("customers_company_idx").on(table.companyId),
    byLeadIdx: index("customers_lead_idx").on(table.leadId),
    byEmailIdx: index("customers_email_idx").on(table.email),
  }),
);

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    partnerCompanyId: uuid("partner_company_id").references(() => partnerCompanies.id, { onDelete: "set null" }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => profiles.id, { onDelete: "set null" }),
    title: varchar("title", { length: 180 }).notNull(),
    pipeline: varchar("pipeline", { length: 100 }).notNull().default("default"),
    stage: varchar("stage", { length: 100 }).notNull().default("new"),
    status: dealStatusEnum("status").notNull().default("open"),
    value: integer("value").notNull().default(0),
    expectedCloseDate: timestamp("expected_close_date", { withTimezone: true }),
    lostReason: varchar("lost_reason", { length: 250 }),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
      byCompanyIdx: index("deals_company_idx").on(table.companyId),
      byCompanyStatusIdx: index("deals_company_status_idx").on(table.companyId, table.status),
      byAssignedIdx: index("deals_assigned_idx").on(table.assignedToUserId),
      byPartnerIdx: index("deals_partner_idx").on(table.partnerCompanyId),
    }),
  );

export const dealActivities = pgTable("deal_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => profiles.id),
  type: varchar("type", { length: 80 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => profiles.id, { onDelete: "set null" }),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    reminderMinutesBefore: integer("reminder_minutes_before").notNull().default(24 * 60),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    isRecurring: boolean("is_recurring").notNull().default(false),
    recurrenceRule: varchar("recurrence_rule", { length: 120 }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    byCompanyIdx: index("tasks_company_idx").on(table.companyId),
    byStatusIdx: index("tasks_company_status_idx").on(table.companyId, table.status),
    byDueIdx: index("tasks_due_idx").on(table.dueAt),
  }),
);

export const followUps = pgTable(
  "follow_ups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => profiles.id, { onDelete: "set null" }),
    subject: varchar("subject", { length: 180 }).notNull(),
    channel: varchar("channel", { length: 40 }).notNull().default("call"),
    status: followUpStatusEnum("status").notNull().default("pending"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    outcome: varchar("outcome", { length: 240 }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    byCompanyIdx: index("follow_ups_company_idx").on(table.companyId, table.scheduledAt),
    byStatusIdx: index("follow_ups_status_idx").on(table.companyId, table.status),
    byAssignedIdx: index("follow_ups_assigned_idx").on(table.companyId, table.assignedToUserId),
  }),
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    channel: varchar("channel", { length: 40 }).notNull().default("email"),
    channelMetadata: jsonb("channel_metadata").$type<Record<string, unknown>>().notNull().default({}),
    status: campaignStatusEnum("status").notNull().default("draft"),
    audienceDescription: varchar("audience_description", { length: 240 }),
    sequenceDefinitionId: uuid("sequence_definition_id"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sentCount: integer("sent_count").notNull().default(0),
    deliveredCount: integer("delivered_count").notNull().default(0),
    openedCount: integer("opened_count").notNull().default(0),
    clickedCount: integer("clicked_count").notNull().default(0),
    replyCount: integer("reply_count").notNull().default(0),
    bounceCount: integer("bounce_count").notNull().default(0),
    engagementScore: integer("engagement_score").notNull().default(0),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    byCompanyIdx: index("campaigns_company_idx").on(table.companyId),
    byStatusIdx: index("campaigns_status_idx").on(table.companyId, table.status),
    byScheduledIdx: index("campaigns_scheduled_idx").on(table.scheduledAt),
  }),
);

export const partnerUsers = pgTable(
  "partner_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    partnerCompanyId: uuid("partner_company_id")
      .notNull()
      .references(() => partnerCompanies.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 180 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    title: varchar("title", { length: 120 }),
    status: partnerStatusEnum("status").notNull().default("active"),
    accessLevel: partnerAccessLevelEnum("access_level").notNull().default("restricted"),
    permissions: jsonb("permissions")
      .$type<{
        leads: boolean;
        deals: boolean;
        reports: boolean;
        documents: boolean;
      }>()
      .notNull()
      .default({
        leads: true,
        deals: true,
        reports: false,
        documents: false,
      }),
    lastAccessAt: timestamp("last_access_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    partnerEmailUnique: uniqueIndex("partner_users_partner_email_unique").on(table.partnerCompanyId, table.email),
    byCompanyIdx: index("partner_users_company_idx").on(table.companyId, table.createdAt),
    byPartnerIdx: index("partner_users_partner_idx").on(table.partnerCompanyId, table.createdAt),
    byStatusIdx: index("partner_users_status_idx").on(table.companyId, table.status),
  }),
);

export const campaignCustomers = pgTable(
  "campaign_customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    campaignCustomerUnique: uniqueIndex("campaign_customers_campaign_customer_unique").on(table.campaignId, table.customerId),
    byCompanyIdx: index("campaign_customers_company_idx").on(table.companyId),
    byCustomerIdx: index("campaign_customers_customer_idx").on(table.customerId),
  }),
);

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    type: templateTypeEnum("type").notNull(),
    subject: varchar("subject", { length: 240 }),
    content: text("content").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    byCompanyIdx: index("templates_company_idx").on(table.companyId),
    byTypeIdx: index("templates_type_idx").on(table.companyId, table.type),
  }),
);

export const automations = pgTable(
  "automations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    status: automationStatusEnum("status").notNull().default("active"),
    triggerType: varchar("trigger_type", { length: 80 }).notNull(),
    triggerConfig: jsonb("trigger_config").$type<Record<string, unknown>>().notNull().default({}),
    actions: jsonb("actions").$type<Array<Record<string, unknown>>>().notNull().default([]),
    testModeEnabled: boolean("test_mode_enabled").notNull().default(false),
    branchMode: varchar("branch_mode", { length: 40 }).notNull().default("none"),
    channelMetadata: jsonb("channel_metadata").$type<Record<string, unknown>>().notNull().default({}),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    byCompanyIdx: index("automations_company_idx").on(table.companyId),
    byStatusIdx: index("automations_status_idx").on(table.companyId, table.status),
  }),
);

export const chatbotFlows = pgTable(
  "chatbot_flows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    status: chatbotFlowStatusEnum("status").notNull().default("draft"),
    entryChannel: chatbotFlowEntryChannelEnum("entry_channel").notNull().default("whatsapp"),
    publishedVersionId: uuid("published_version_id"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    byCompanyIdx: index("chatbot_flows_company_idx").on(table.companyId, table.updatedAt),
    byStatusIdx: index("chatbot_flows_status_idx").on(table.companyId, table.status),
  }),
);

export const chatbotFlowVersions = pgTable(
  "chatbot_flow_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => chatbotFlows.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    state: chatbotFlowVersionStateEnum("state").notNull().default("draft"),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull().default({}),
    validationErrors: jsonb("validation_errors").$type<Array<Record<string, unknown>>>().notNull().default([]),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    flowVersionUnique: uniqueIndex("chatbot_flow_versions_flow_version_unique").on(table.flowId, table.versionNumber),
    flowStateIdx: index("chatbot_flow_versions_flow_state_idx").on(table.flowId, table.state, table.createdAt),
  }),
);

export const chatbotFlowExecutions = pgTable(
  "chatbot_flow_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    flowId: uuid("flow_id")
      .notNull()
      .references(() => chatbotFlows.id, { onDelete: "cascade" }),
    flowVersionId: uuid("flow_version_id")
      .notNull()
      .references(() => chatbotFlowVersions.id, { onDelete: "cascade" }),
    conversationStateId: uuid("conversation_state_id").notNull(),
    status: chatbotFlowExecutionStatusEnum("status").notNull().default("running"),
    currentNodeId: varchar("current_node_id", { length: 120 }).notNull(),
    triggerSource: varchar("trigger_source", { length: 80 }).notNull().default("manual_test"),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    lastInboundMessageId: uuid("last_inbound_message_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastError: text("last_error"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    byFlowIdx: index("chatbot_flow_executions_flow_idx").on(table.flowId, table.startedAt),
    byConversationIdx: index("chatbot_flow_executions_conversation_idx").on(table.conversationStateId, table.updatedAt),
    byStatusIdx: index("chatbot_flow_executions_status_idx").on(table.companyId, table.status, table.updatedAt),
  }),
);

export const chatbotFlowExecutionLogs = pgTable(
  "chatbot_flow_execution_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => chatbotFlowExecutions.id, { onDelete: "cascade" }),
    nodeId: varchar("node_id", { length: 120 }),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    message: varchar("message", { length: 240 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    byExecutionIdx: index("chatbot_flow_execution_logs_execution_idx").on(table.executionId, table.createdAt),
    byCompanyIdx: index("chatbot_flow_execution_logs_company_idx").on(table.companyId, table.createdAt),
  }),
);

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    status: automationRunStatusEnum("status").notNull().default("queued"),
    triggerType: varchar("trigger_type", { length: 80 }).notNull().default("manual"),
    currentActionIndex: integer("current_action_index").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    message: varchar("message", { length: 240 }).notNull().default("Queued for execution"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    correlationKey: varchar("correlation_key", { length: 180 }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    lastError: text("last_error"),
    executedAt: timestamp("executed_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    byAutomationIdx: index("automation_runs_automation_idx").on(table.automationId, table.executedAt),
    byCompanyIdx: index("automation_runs_company_idx").on(table.companyId),
    byStatusIdx: index("automation_runs_status_idx").on(table.companyId, table.status, table.nextRunAt),
    correlationIdx: index("automation_runs_correlation_idx").on(table.companyId, table.correlationKey),
  }),
);

export const automationRunSteps = pgTable(
  "automation_run_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    automationRunId: uuid("automation_run_id")
      .notNull()
      .references(() => automationRuns.id, { onDelete: "cascade" }),
    actionIndex: integer("action_index").notNull(),
    actionType: varchar("action_type", { length: 80 }).notNull(),
    status: automationStepStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    parallelKey: varchar("parallel_key", { length: 80 }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    runActionUnique: uniqueIndex("automation_run_steps_run_action_unique").on(table.automationRunId, table.actionIndex),
    byRunIdx: index("automation_run_steps_run_idx").on(table.automationRunId, table.actionIndex),
    byCompanyStatusIdx: index("automation_run_steps_company_status_idx").on(table.companyId, table.status),
  }),
);

export const automationTriggerEvents = pgTable(
  "automation_trigger_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    triggerType: varchar("trigger_type", { length: 80 }).notNull(),
    eventKey: varchar("event_key", { length: 180 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }),
    entityId: uuid("entity_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventKeyUnique: uniqueIndex("automation_trigger_events_key_unique").on(table.companyId, table.eventKey),
    byTriggerIdx: index("automation_trigger_events_trigger_idx").on(table.companyId, table.triggerType, table.createdAt),
  }),
);

export const emailAccounts = pgTable(
  "email_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    label: varchar("label", { length: 180 }).notNull(),
    provider: varchar("provider", { length: 80 }).notNull().default("mock"),
    fromName: varchar("from_name", { length: 180 }),
    fromEmail: varchar("from_email", { length: 320 }).notNull(),
    status: emailAccountStatusEnum("status").notNull().default("connected"),
    isDefault: boolean("is_default").notNull().default(false),
    credentials: jsonb("credentials").$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    byCompanyIdx: index("email_accounts_company_idx").on(table.companyId, table.createdAt),
    byDefaultIdx: index("email_accounts_default_idx").on(table.companyId, table.isDefault),
    companyEmailUnique: uniqueIndex("email_accounts_company_email_unique").on(table.companyId, table.fromEmail),
  }),
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    automationId: uuid("automation_id").references(() => automations.id, { onDelete: "set null" }),
    automationRunId: uuid("automation_run_id").references(() => automationRuns.id, { onDelete: "set null" }),
    emailAccountId: uuid("email_account_id").references(() => emailAccounts.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    recipientEmail: varchar("recipient_email", { length: 320 }).notNull(),
    recipientName: varchar("recipient_name", { length: 180 }),
    subject: varchar("subject", { length: 240 }).notNull(),
    htmlContent: text("html_content").notNull(),
    textContent: text("text_content"),
    status: emailMessageStatusEnum("status").notNull().default("queued"),
    provider: varchar("provider", { length: 80 }).notNull().default("mock"),
    providerMessageId: varchar("provider_message_id", { length: 180 }),
    trackingToken: varchar("tracking_token", { length: 180 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    queuedAt: timestamp("queued_at", { withTimezone: true }).defaultNow().notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    trackingTokenUnique: uniqueIndex("email_messages_tracking_token_unique").on(table.trackingToken),
    byStatusIdx: index("email_messages_status_idx").on(table.companyId, table.status, table.queuedAt),
    byCampaignIdx: index("email_messages_campaign_idx").on(table.campaignId, table.createdAt),
    byRunIdx: index("email_messages_run_idx").on(table.automationRunId, table.createdAt),
  }),
);

export const emailTrackingEvents = pgTable(
  "email_tracking_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    emailMessageId: uuid("email_message_id")
      .notNull()
      .references(() => emailMessages.id, { onDelete: "cascade" }),
    eventType: emailEventTypeEnum("event_type").notNull(),
    trackingToken: varchar("tracking_token", { length: 180 }).notNull(),
    eventKey: varchar("event_key", { length: 180 }).notNull(),
    url: text("url"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    eventKeyUnique: uniqueIndex("email_tracking_events_key_unique").on(table.eventKey),
    byMessageIdx: index("email_tracking_events_message_idx").on(table.emailMessageId, table.occurredAt),
    byCompanyTypeIdx: index("email_tracking_events_company_type_idx").on(table.companyId, table.eventType, table.occurredAt),
  }),
);

export const conversationStates = pgTable(
  "conversation_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    socialConversationId: uuid("social_conversation_id")
      .notNull()
      .references(() => socialConversations.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id").references(() => automations.id, { onDelete: "set null" }),
    automationRunId: uuid("automation_run_id").references(() => automationRuns.id, { onDelete: "set null" }),
    sessionKey: varchar("session_key", { length: 180 }).notNull(),
    currentNode: varchar("current_node", { length: 120 }).notNull().default("start"),
    status: conversationStateStatusEnum("status").notNull().default("active"),
    state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
    resumedAt: timestamp("resumed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sessionKeyUnique: uniqueIndex("conversation_states_session_key_unique").on(table.companyId, table.sessionKey),
    byConversationIdx: index("conversation_states_conversation_idx").on(table.socialConversationId, table.updatedAt),
    byStatusIdx: index("conversation_states_status_idx").on(table.companyId, table.status, table.expiresAt),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    message: varchar("message", { length: 320 }).notNull(),
    entityId: uuid("entity_id"),
    entityPath: varchar("entity_path", { length: 240 }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    readBy: uuid("read_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    byCompanyIdx: index("notifications_company_idx").on(table.companyId, table.createdAt),
    byTypeIdx: index("notifications_type_idx").on(table.companyId, table.type),
    byReadIdx: index("notifications_read_idx").on(table.companyId, table.readAt),
  }),
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    entityType: documentEntityTypeEnum("entity_type").notNull().default("general"),
    entityId: uuid("entity_id"),
    folder: varchar("folder", { length: 120 }).notNull().default("general"),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    storagePath: varchar("storage_path", { length: 512 }).notNull(),
    mimeType: varchar("mime_type", { length: 180 }),
    sizeBytes: integer("size_bytes").notNull().default(0),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    byCompanyIdx: index("documents_company_idx").on(table.companyId, table.createdAt),
    byEntityIdx: index("documents_entity_idx").on(table.companyId, table.entityType, table.entityId),
    byFolderIdx: index("documents_folder_idx").on(table.companyId, table.folder),
  }),
);

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    platform: socialPlatformEnum("platform").notNull(),
    accountName: varchar("account_name", { length: 180 }).notNull(),
    handle: varchar("handle", { length: 180 }).notNull(),
    status: socialAccountStatusEnum("status").notNull().default("connected"),
    accessMode: varchar("access_mode", { length: 40 }).notNull().default("manual"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    byCompanyIdx: index("social_accounts_company_idx").on(table.companyId, table.createdAt),
    byPlatformIdx: index("social_accounts_platform_idx").on(table.companyId, table.platform),
  }),
);

export const socialConversations = pgTable(
  "social_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccounts.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => profiles.id, { onDelete: "set null" }),
    platform: socialPlatformEnum("platform").notNull(),
    contactName: varchar("contact_name", { length: 180 }),
    contactHandle: varchar("contact_handle", { length: 180 }).notNull(),
    status: socialConversationStatusEnum("status").notNull().default("open"),
    humanTakeoverEnabled: boolean("human_takeover_enabled").notNull().default(false),
    botState: varchar("bot_state", { length: 40 }).notNull().default("bot_active"),
    subject: varchar("subject", { length: 240 }),
    latestMessage: text("latest_message"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    lastOutboundAt: timestamp("last_outbound_at", { withTimezone: true }),
    messageStatusSummary: jsonb("message_status_summary").$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    unreadCount: integer("unread_count").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    byCompanyIdx: index("social_conversations_company_idx").on(table.companyId, table.lastMessageAt),
    byAccountIdx: index("social_conversations_account_idx").on(table.socialAccountId, table.lastMessageAt),
    byAssignedIdx: index("social_conversations_assigned_idx").on(table.companyId, table.assignedToUserId),
  }),
);

export const socialMessages = pgTable(
  "social_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => socialConversations.id, { onDelete: "cascade" }),
    direction: socialMessageDirectionEnum("direction").notNull(),
    messageType: varchar("message_type", { length: 40 }).notNull().default("text"),
    deliveryStatus: varchar("delivery_status", { length: 40 }).notNull().default("sent"),
    providerMessageId: varchar("provider_message_id", { length: 180 }),
    parentMessageId: uuid("parent_message_id"),
    senderName: varchar("sender_name", { length: 180 }),
    body: text("body").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    byConversationIdx: index("social_messages_conversation_idx").on(table.conversationId, table.sentAt),
    byCompanyIdx: index("social_messages_company_idx").on(table.companyId, table.sentAt),
  }),
);

export const whatsappWorkspaces = pgTable(
  "whatsapp_workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    phoneNumberId: varchar("phone_number_id", { length: 120 }).notNull(),
    businessAccountId: varchar("business_account_id", { length: 120 }),
    accessToken: text("access_token"),
    verifyToken: varchar("verify_token", { length: 240 }),
    appSecret: varchar("app_secret", { length: 240 }),
    isActive: boolean("is_active").notNull().default(true),
    isVerified: boolean("is_verified").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    companyPhoneUnique: uniqueIndex("whatsapp_workspaces_company_phone_unique").on(table.companyId, table.phoneNumberId),
    companyActiveIdx: index("whatsapp_workspaces_company_active_idx").on(table.companyId, table.isActive),
  }),
);

export const whatsappPhoneMappings = pgTable(
  "whatsapp_phone_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    phoneE164: varchar("phone_e164", { length: 24 }).notNull(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    socialConversationId: uuid("social_conversation_id").references(() => socialConversations.id, { onDelete: "set null" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    companyPhoneUnique: uniqueIndex("whatsapp_phone_mappings_company_phone_unique").on(table.companyId, table.phoneE164),
    lookupIdx: index("whatsapp_phone_mappings_lookup_idx").on(table.companyId, table.leadId, table.customerId),
  }),
);

export const whatsappTemplates = pgTable(
  "whatsapp_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => whatsappWorkspaces.id, { onDelete: "set null" }),
    name: varchar("name", { length: 180 }).notNull(),
    category: varchar("category", { length: 80 }),
    language: varchar("language", { length: 16 }).notNull().default("en"),
    status: whatsappTemplateStatusEnum("status").notNull().default("draft"),
    body: text("body").notNull(),
    variables: jsonb("variables").$type<Array<{ key: string; fallback?: string }>>().notNull().default([]),
    providerTemplateId: varchar("provider_template_id", { length: 180 }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    companyIdx: index("whatsapp_templates_company_idx").on(table.companyId, table.status, table.updatedAt),
    companyNameLangUnique: uniqueIndex("whatsapp_templates_company_name_lang_unique").on(table.companyId, table.name, table.language),
  }),
);

export const whatsappWebhookEvents = pgTable(
  "whatsapp_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").references(() => whatsappWorkspaces.id, { onDelete: "set null" }),
    eventKey: varchar("event_key", { length: 220 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    companyEventUnique: uniqueIndex("whatsapp_webhook_events_company_key_unique").on(table.companyId, table.eventKey),
  }),
);

export const leadScoringRules = pgTable(
  "lead_scoring_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    channel: varchar("channel", { length: 40 }),
    conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull().default({}),
    weight: integer("weight").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    priority: integer("priority").notNull().default(100),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    companyEventIdx: index("lead_scoring_rules_company_event_idx").on(table.companyId, table.eventType, table.isActive, table.priority),
  }),
);

export const leadScoreEvents = pgTable(
  "lead_score_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    channel: varchar("channel", { length: 40 }),
    sourceId: varchar("source_id", { length: 180 }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    leadIdx: index("lead_score_events_lead_idx").on(table.companyId, table.leadId, table.createdAt),
  }),
);

export const leadScoreHistory = pgTable(
  "lead_score_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    previousScore: integer("previous_score").notNull().default(0),
    newScore: integer("new_score").notNull().default(0),
    delta: integer("delta").notNull().default(0),
    reason: varchar("reason", { length: 240 }),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    leadIdx: index("lead_score_history_lead_idx").on(table.companyId, table.leadId, table.createdAt),
  }),
);

export const leadRoutingRules = pgTable(
  "lead_routing_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    priority: integer("priority").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),
    strategy: varchar("strategy", { length: 40 }).notNull().default("rule_match"),
    predicates: jsonb("predicates").$type<Record<string, unknown>>().notNull().default({}),
    assignmentConfig: jsonb("assignment_config").$type<Record<string, unknown>>().notNull().default({}),
    state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    companyPriorityIdx: index("lead_routing_rules_company_priority_idx").on(table.companyId, table.isActive, table.priority),
  }),
);

export const leadAssignmentAudits = pgTable(
  "lead_assignment_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    previousAssignedToUserId: uuid("previous_assigned_to_user_id").references(() => profiles.id, { onDelete: "set null" }),
    newAssignedToUserId: uuid("new_assigned_to_user_id").references(() => profiles.id, { onDelete: "set null" }),
    ruleId: uuid("rule_id").references(() => leadRoutingRules.id, { onDelete: "set null" }),
    reason: varchar("reason", { length: 180 }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    leadIdx: index("lead_assignment_audits_lead_idx").on(table.companyId, table.leadId, table.createdAt),
  }),
);

export const sequenceDefinitions = pgTable(
  "sequence_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    status: sequenceStatusEnum("status").notNull().default("draft"),
    description: text("description"),
    triggerConfig: jsonb("trigger_config").$type<Record<string, unknown>>().notNull().default({}),
    analytics: jsonb("analytics").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    companyStatusIdx: index("sequence_definitions_company_status_idx").on(table.companyId, table.status),
  }),
);

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => sequenceDefinitions.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    channel: sequenceStepChannelEnum("channel").notNull(),
    stepType: varchar("step_type", { length: 80 }).notNull(),
    delayMinutes: integer("delay_minutes").notNull().default(0),
    conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull().default({}),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sequenceIndexUnique: uniqueIndex("sequence_steps_sequence_index_unique").on(table.sequenceId, table.stepIndex),
  }),
);

export const sequenceEnrollments = pgTable(
  "sequence_enrollments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => sequenceDefinitions.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    status: sequenceRunStatusEnum("status").notNull().default("queued"),
    currentStepIndex: integer("current_step_index").notNull().default(0),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).defaultNow().notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    companyStatusIdx: index("sequence_enrollments_company_status_idx").on(table.companyId, table.status, table.nextRunAt),
    targetIdx: index("sequence_enrollments_target_idx").on(table.companyId, table.leadId, table.customerId),
  }),
);

export const sequenceRuns = pgTable(
  "sequence_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => sequenceDefinitions.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => sequenceEnrollments.id, { onDelete: "cascade" }),
    stepId: uuid("step_id").references(() => sequenceSteps.id, { onDelete: "set null" }),
    stepIndex: integer("step_index").notNull().default(0),
    status: sequenceRunStatusEnum("status").notNull().default("queued"),
    runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    companyStatusIdx: index("sequence_runs_company_status_idx").on(table.companyId, table.status, table.runAt),
    enrollmentIdx: index("sequence_runs_enrollment_idx").on(table.enrollmentId, table.createdAt),
  }),
);

export const emailAnalyticsDaily = pgTable(
  "email_analytics_daily",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    day: timestamp("day", { mode: "date" }).notNull(),
    sentCount: integer("sent_count").notNull().default(0),
    deliveredCount: integer("delivered_count").notNull().default(0),
    openedCount: integer("opened_count").notNull().default(0),
    clickedCount: integer("clicked_count").notNull().default(0),
    repliedCount: integer("replied_count").notNull().default(0),
    bouncedCount: integer("bounced_count").notNull().default(0),
    engagementScore: integer("engagement_score").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    companyCampaignDayUnique: uniqueIndex("email_analytics_daily_company_campaign_day_unique").on(table.companyId, table.campaignId, table.day),
    companyDayIdx: index("email_analytics_daily_company_day_idx").on(table.companyId, table.day),
  }),
);

export const authRefreshTokens = pgTable(
  "auth_refresh_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    jti: uuid("jti").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedByTokenId: uuid("replaced_by_token_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("auth_refresh_tokens_token_hash_unique").on(table.tokenHash),
    jtiUnique: uniqueIndex("auth_refresh_tokens_jti_unique").on(table.jti),
    userSessionIdx: index("auth_refresh_tokens_user_session_idx").on(table.userId, table.sessionId),
  }),
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: authSessionStatusEnum("status").notNull().default("active"),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: varchar("revoke_reason", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userStatusIdx: index("auth_sessions_user_status_idx").on(table.userId, table.status, table.createdAt),
    expiresIdx: index("auth_sessions_expires_idx").on(table.expiresAt),
  }),
);

export const requestRateLimits = pgTable(
  "request_rate_limits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scope: varchar("scope", { length: 80 }).notNull(),
    bucketKey: varchar("bucket_key", { length: 255 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    hitCount: integer("hit_count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    bucketUnique: uniqueIndex("request_rate_limits_bucket_unique").on(table.scope, table.bucketKey, table.windowStart),
    expiresIdx: index("request_rate_limits_expires_idx").on(table.expiresAt),
  }),
);

export const webhookReplayGuards = pgTable(
  "webhook_replay_guards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: varchar("provider", { length: 80 }).notNull(),
    replayKey: varchar("replay_key", { length: 255 }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    providerReplayUnique: uniqueIndex("webhook_replay_guards_provider_key_unique").on(table.provider, table.replayKey),
    expiresIdx: index("webhook_replay_guards_expires_idx").on(table.expiresAt),
  }),
);

export const securityAuditLogs = pgTable(
  "security_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: varchar("request_id", { length: 120 }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    sessionId: uuid("session_id"),
    route: varchar("route", { length: 255 }).notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    result: varchar("result", { length: 60 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    routeCreatedIdx: index("security_audit_logs_route_created_idx").on(table.route, table.createdAt),
    companyCreatedIdx: index("security_audit_logs_company_created_idx").on(table.companyId, table.createdAt),
    userCreatedIdx: index("security_audit_logs_user_created_idx").on(table.userId, table.createdAt),
  }),
);

export const companyRelations = relations(companies, ({ many }) => ({
  plans: many(companyPlans),
  stores: many(stores),
  memberships: many(companyMemberships),
  invites: many(companyInvites),
  partners: many(partnerCompanies),
  partnerUsers: many(partnerUsers),
  campaigns: many(campaigns),
  templates: many(templates),
  automations: many(automations),
  notifications: many(notifications),
  documents: many(documents),
  socialAccounts: many(socialAccounts),
  socialConversations: many(socialConversations),
  leads: many(leads),
  customers: many(customers),
  deals: many(deals),
  tasks: many(tasks),
  followUps: many(followUps),
}));
