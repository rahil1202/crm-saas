export interface OnboardingTourStep {
  id: string;
  title: string;
  description: string;
  highlights: string[];
  href?: string;
  ctaLabel?: string;
  minRole?: "owner" | "admin" | "member";
  moduleKey?:
    | "outreach"
    | "contacts"
    | "leads"
    | "deals"
    | "forms"
    | "tasks"
    | "meetings"
    | "documents"
    | "templates"
    | "reports"
    | "campaigns"
    | "automation"
    | "integrations"
    | "social"
    | "notifications"
    | "partners"
    | "settings"
    | "teams";
  hiddenForPartnerAccess?: boolean;
}

export const onboardingTourSteps: OnboardingTourStep[] = [
  {
    id: "company-setup",
    title: "Company and branches",
    description: "Start in Settings to keep company profile, timezone, currency, and branch list accurate.",
    highlights: ["Company profile", "Branch management", "Default workspace context"],
    href: "/dashboard/settings?tab=company",
    ctaLabel: "Open company settings",
    minRole: "admin",
    moduleKey: "settings",
    hiddenForPartnerAccess: true,
  },
  {
    id: "team-invites",
    title: "Team invitations",
    description: "Invite teammates early so lead ownership, activities, and assignments are shared from day one.",
    highlights: ["Invite by email", "Store-scoped access", "Pending invite tracking"],
    href: "/dashboard/team",
    ctaLabel: "Open team",
    minRole: "admin",
    moduleKey: "teams",
  },
  {
    id: "roles",
    title: "Roles and access",
    description: "Use owner/admin/member roles first, then refine permissions with custom roles in team management.",
    highlights: ["Role changes", "Custom role support", "Owner safety guardrails"],
    href: "/dashboard/team",
    ctaLabel: "Review permissions",
    minRole: "admin",
    moduleKey: "teams",
  },
  {
    id: "contacts",
    title: "Contacts",
    description: "Maintain customer context in one place with timeline-ready profiles and reusable tags.",
    highlights: ["Unified profiles", "Tags", "Custom fields"],
    href: "/dashboard/customers",
    ctaLabel: "Open contacts",
    minRole: "member",
    moduleKey: "contacts",
  },
  {
    id: "leads",
    title: "Leads",
    description: "Capture and qualify inbound opportunities with source tracking and assignment rules.",
    highlights: ["Capture and import", "Qualification", "Assignment"],
    href: "/dashboard/leads",
    ctaLabel: "Open leads",
    minRole: "member",
    moduleKey: "leads",
  },
  {
    id: "deals",
    title: "Deals and pipelines",
    description: "Track revenue progression through stages, values, and won/lost outcomes.",
    highlights: ["Pipeline board", "Stage movement", "Forecast inputs"],
    href: "/dashboard/deals",
    ctaLabel: "Open deals",
    minRole: "member",
    moduleKey: "deals",
  },
  {
    id: "tasks",
    title: "Tasks and follow-ups",
    description: "Keep follow-ups on schedule with reminders, recurring work, and owner visibility.",
    highlights: ["Reminders", "Recurring tasks", "Overdue queue"],
    href: "/dashboard/tasks",
    ctaLabel: "Open tasks",
    minRole: "member",
    moduleKey: "tasks",
  },
  {
    id: "meetings",
    title: "Meetings",
    description: "Coordinate internal and external meetings with user availability and booking links.",
    highlights: ["Booking links", "Availability", "Manual scheduling"],
    href: "/dashboard/meetings",
    ctaLabel: "Open meetings",
    minRole: "member",
    moduleKey: "meetings",
  },
  {
    id: "campaigns",
    title: "Campaigns and templates",
    description: "Launch repeatable outreach with targeted audiences and reusable message templates.",
    highlights: ["Audience targeting", "Template library", "Delivery analytics"],
    href: "/dashboard/campaigns",
    ctaLabel: "Open campaigns",
    minRole: "admin",
    moduleKey: "campaigns",
  },
  {
    id: "files",
    title: "Files and documents",
    description: "Centralize collateral and attachments so lead and deal records stay audit-friendly.",
    highlights: ["Shared files", "Folders", "Deal attachments"],
    href: "/dashboard/documents",
    ctaLabel: "Open files",
    minRole: "member",
    moduleKey: "documents",
  },
  {
    id: "forms",
    title: "Forms",
    description: "Publish hosted or embedded forms and route responses into CRM attribution.",
    highlights: ["Form builder", "Hosted links", "Response inbox"],
    href: "/dashboard/forms",
    ctaLabel: "Open forms",
    minRole: "admin",
    moduleKey: "forms",
  },
  {
    id: "automation",
    title: "Automation and chatbot flows",
    description: "Automate repetitive CRM workflows using trigger-action sequences and run logs.",
    highlights: ["Workflow builder", "Execution logs", "Chatbot flow support"],
    href: "/dashboard/automation",
    ctaLabel: "Open automation",
    minRole: "admin",
    moduleKey: "automation",
  },
  {
    id: "integrations",
    title: "Integrations and social readiness",
    description: "Set up email, WhatsApp, webhooks, and social channels before scaling outreach.",
    highlights: ["Runtime readiness", "Provider setup", "Webhook policy"],
    href: "/dashboard/settings?tab=notifications",
    ctaLabel: "Open integrations",
    minRole: "admin",
    moduleKey: "integrations",
    hiddenForPartnerAccess: true,
  },
  {
    id: "reports",
    title: "Reports and dashboard",
    description: "Use dashboards and reports to monitor team activity, pipeline health, and campaign impact.",
    highlights: ["Dashboard overview", "Revenue and funnel trends", "Operational follow-up"],
    href: "/dashboard",
    ctaLabel: "Open dashboard",
    minRole: "member",
  },
  {
    id: "replay",
    title: "Replay from settings",
    description: "You can reopen this full tour from Settings at any time to onboard new managers.",
    highlights: ["Settings replay", "Setup shortcuts", "No data reset required"],
    href: "/dashboard/settings?tab=tour",
    ctaLabel: "Open tour settings",
    minRole: "admin",
    moduleKey: "settings",
    hiddenForPartnerAccess: true,
  },
];
