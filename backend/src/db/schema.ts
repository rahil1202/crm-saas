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

export const companyRelations = relations(companies, ({ many }) => ({
  stores: many(stores),
  memberships: many(companyMemberships),
  invites: many(companyInvites),
  leads: many(leads),
}));
