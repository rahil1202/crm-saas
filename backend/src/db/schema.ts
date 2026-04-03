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
export const automationRunStatusEnum = pgEnum("automation_run_status", ["success", "failed"]);
export const notificationTypeEnum = pgEnum("notification_type", ["lead", "deal", "task", "campaign"]);
export const documentEntityTypeEnum = pgEnum("document_entity_type", ["general", "lead", "deal", "customer"]);
export const socialPlatformEnum = pgEnum("social_platform", ["instagram", "facebook", "whatsapp", "linkedin"]);
export const socialAccountStatusEnum = pgEnum("social_account_status", ["connected", "disconnected"]);
export const socialConversationStatusEnum = pgEnum("social_conversation_status", ["open", "assigned", "closed"]);
export const socialMessageDirectionEnum = pgEnum("social_message_direction", ["inbound", "outbound"]);
export const companyPlanStatusEnum = pgEnum("company_plan_status", ["trial", "active", "past_due", "canceled"]);
export const companyPlanIntervalEnum = pgEnum("company_plan_interval", ["monthly", "yearly", "custom"]);

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
      }>()
      .notNull()
      .default({
        slackWebhookUrl: null,
        whatsappProvider: null,
        emailProvider: null,
        webhookUrl: null,
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
    status: campaignStatusEnum("status").notNull().default("draft"),
    audienceDescription: varchar("audience_description", { length: 240 }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    launchedAt: timestamp("launched_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sentCount: integer("sent_count").notNull().default(0),
    deliveredCount: integer("delivered_count").notNull().default(0),
    openedCount: integer("opened_count").notNull().default(0),
    clickedCount: integer("clicked_count").notNull().default(0),
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
    status: automationRunStatusEnum("status").notNull(),
    message: varchar("message", { length: 240 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    executedAt: timestamp("executed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    byAutomationIdx: index("automation_runs_automation_idx").on(table.automationId, table.executedAt),
    byCompanyIdx: index("automation_runs_company_idx").on(table.companyId),
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
    subject: varchar("subject", { length: 240 }),
    latestMessage: text("latest_message"),
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
    senderName: varchar("sender_name", { length: 180 }),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    byConversationIdx: index("social_messages_conversation_idx").on(table.conversationId, table.sentAt),
    byCompanyIdx: index("social_messages_company_idx").on(table.companyId, table.sentAt),
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
