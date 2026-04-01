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
  }),
);

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

export const companyRelations = relations(companies, ({ many }) => ({
  stores: many(stores),
  memberships: many(companyMemberships),
  invites: many(companyInvites),
  leads: many(leads),
  customers: many(customers),
  deals: many(deals),
  tasks: many(tasks),
}));
