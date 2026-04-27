"use client";

import { usePathname } from "next/navigation";

import { AppShell } from "@/components/app-shell";

const dashboardMeta: Record<string, { title: string; description: string }> = {
  "/dashboard": {
    title: "CRM Dashboard",
    description: "Operational overview for pipeline, meetings, follow-ups, documents, campaigns, and partner-driven revenue.",
  },
  "/dashboard/analytics": {
    title: "Dashboard Analytics",
    description: "Deep analytics for lead velocity, source mix, forecast trends, and pipeline stage value concentration.",
  },
  "/dashboard/health": {
    title: "Workspace Health",
    description: "Conversion quality, task pressure, meeting cadence, and campaign performance diagnostics.",
  },
  "/dashboard/company": {
    title: "Company",
    description: "Choose the company you want to work in, review the active company profile, and manage your partner access.",
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
  "/dashboard/contacts": {
    title: "Contact",
    description: "Sort, search, and filter contact records with linked lead, deal, task, and campaign history.",
  },
  "/dashboard/deals": {
    title: "Deals",
    description: "Tenant-scoped deals workspace with timeline tracking for lifecycle changes.",
  },
  "/dashboard/forms": {
    title: "Forms",
    description: "Create hosted lead capture forms, publish them, and review response submissions from one workspace.",
  },
  "/dashboard/forms/new": {
    title: "New Form",
    description: "Build a multi-step form, configure submission behavior, and publish a hosted or embedded version.",
  },
  "/dashboard/documents": {
    title: "Files and documents",
    description: "Search uploaded files, manage shared folders, and keep lead and deal attachments in one company-scoped index.",
  },
  "/dashboard/integrations": {
    title: "Integrations",
    description: "Configure supported integrations from one clean workspace.",
  },
  "/dashboard/integrations/email": {
    title: "Email Integration",
    description: "Set up sender identity, OAuth provider link, and event webhook.",
  },
  "/dashboard/integrations/whatsapp": {
    title: "WhatsApp Integration",
    description: "Configure WhatsApp provider, business IDs, and webhook verification.",
  },
  "/dashboard/integrations/linkedin": {
    title: "LinkedIn Integration",
    description: "Connect LinkedIn OAuth and configure lead sync settings.",
  },
  "/dashboard/integrations/documents": {
    title: "Documents Integration",
    description: "Configure intake email, storage path, and auto-attach behavior.",
  },
  "/dashboard/integrations/webhooks": {
    title: "Webhooks Integration",
    description: "Configure inbound/outbound endpoints and signing hints.",
  },
  "/dashboard/invite": {
    title: "Invites",
    description: "Send invites to outside users, track delivery state, and manage shareable invite links from one workspace.",
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
    title: "Stats & Reports",
    description: "Detailed CRM stats, lead and deal analysis, forecast charts, and campaign reporting for the active workspace.",
  },
  "/dashboard/settings": {
    title: "Settings",
    description: "Manage operator security, company profile, branches, and team access for the active CRM workspace.",
  },
  "/dashboard/team": {
    title: "Team Management",
    description: "Manage workspace members, roles, and invites in one clean view.",
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
  "/dashboard/meetings": {
    title: "Meetings",
    description: "Schedule instant meetings, manage booking links, and track public bookings in one workspace.",
  },
  "/dashboard/templates": {
    title: "Templates",
    description: "Review and manage reusable campaign templates for the active company.",
  },
};

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const meta =
    (pathname.startsWith("/dashboard/contacts/") && pathname !== "/dashboard/contacts"
      ? {
          title: "Contact Profile",
          description: "Detailed contact record with activity, company context, notes, and deal visibility.",
        }
      : pathname.startsWith("/dashboard/leads/") && pathname !== "/dashboard/leads"
        ? {
            title: "Lead Profile",
            description: "Detailed lead record with timeline, linked records, and edit controls.",
          }
        : pathname.startsWith("/dashboard/deals/") && pathname !== "/dashboard/deals"
          ? {
              title: "Deal Profile",
              description: "Detailed deal record with timeline, linked records, and update controls.",
            }
          : pathname.startsWith("/dashboard/tasks/") && pathname !== "/dashboard/tasks"
            ? {
                title: "Task Detail",
                description: "Review task details, assignment, and due-date context with edit and delete controls.",
              }
            : pathname.startsWith("/dashboard/forms/") && pathname !== "/dashboard/forms" && pathname !== "/dashboard/forms/new"
              ? {
                  title: "Form Detail",
                  description: "Review live configuration, hosted link, embed snippet, and captured responses for this form.",
                }
       : dashboardMeta[pathname]) ?? {
    title: "Dashboard",
    description: "Workspace overview for the active CRM company.",
  };

  return (
    <AppShell title={meta.title} description={meta.description}>
      {children}
    </AppShell>
  );
}
