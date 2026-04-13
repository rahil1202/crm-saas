"use client";

import { usePathname } from "next/navigation";

import { AppShell } from "@/components/app-shell";

const dashboardMeta: Record<string, { title: string; description: string }> = {
  "/dashboard": {
    title: "CRM Dashboard",
    description: "Operational overview for pipeline, follow-ups, campaigns, and partner-driven revenue.",
  },
  "/dashboard/automation": {
    title: "Automation",
    description: "Trigger-based workflows with multi-step actions and recent execution logs.",
  },
  "/dashboard/campaigns": {
    title: "Campaigns & Templates",
    description: "Manage outbound campaigns, template rendering, sender identities, and runtime delivery hooks.",
  },
  "/dashboard/chatbot-flows": {
    title: "Chatbot Flows",
    description: "Build WhatsApp chatbot flows visually, validate them against the backend, and test execution without leaving the canvas.",
  },
  "/dashboard/company-admin": {
    title: "Company Admin",
    description: "Manage workspace footprint, teammate invites, and referral attribution from one admin surface.",
  },
  "/dashboard/customers": {
    title: "Customers",
    description: "Customer directory with linked lead, deal, task, and campaign history.",
  },
  "/dashboard/deals": {
    title: "Deals",
    description: "Tenant-scoped deals workspace with timeline tracking for lifecycle changes.",
  },
  "/dashboard/documents": {
    title: "Files and documents",
    description: "Search uploaded files, manage shared folders, and keep lead and deal attachments in one company-scoped index.",
  },
  "/dashboard/integrations": {
    title: "Integrations",
    description: "Centralize provider setup, readiness, and rollout notes for every external channel.",
  },
  "/dashboard/leads": {
    title: "Leads",
    description: "Import, triage, and convert tenant-scoped leads from one workspace.",
  },
  "/dashboard/notifications": {
    title: "Notifications",
    description: "Company-scoped alert inbox for lead, deal, task, and campaign activity with read state management.",
  },
  "/dashboard/partners": {
    title: "Partners",
    description: "Manage partner companies that can receive assigned leads and deals.",
  },
  "/dashboard/reports": {
    title: "Reports",
    description: "Lead, deal, forecast, partner, and campaign reporting for the active company workspace.",
  },
  "/dashboard/settings": {
    title: "Settings",
    description: "Manage operator security, company profile, branches, and team access for the active CRM workspace.",
  },
  "/dashboard/social": {
    title: "Social",
    description: "Manage connected social accounts, capture inbound conversations, assign ownership, and convert them into leads.",
  },
  "/dashboard/super-admin": {
    title: "Super Admin",
    description: "Cross-tenant workspace oversight for company inventory, subscription plans, and platform administration.",
  },
  "/dashboard/tasks": {
    title: "Tasks & Follow-ups",
    description: "Task execution workspace with overdue visibility, due-date planning, and month calendar coverage.",
  },
};

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const meta = dashboardMeta[pathname] ?? {
    title: "Dashboard",
    description: "Workspace overview for the active CRM company.",
  };

  return (
    <AppShell title={meta.title} description={meta.description}>
      {children}
    </AppShell>
  );
}
