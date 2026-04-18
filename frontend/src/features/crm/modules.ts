export interface CrmModuleDefinition {
  slug: string;
  title: string;
  summary: string;
  capabilities: string[];
}

export const crmModules: CrmModuleDefinition[] = [
  {
    slug: "dashboard",
    title: "Dashboard",
    summary: "Operational overview for tasks, pipeline, campaigns, partner work, and overdue follow-ups.",
    capabilities: ["My tasks", "Pipeline summary", "Forecast snapshot", "Recent activities"],
  },
  {
    slug: "leads",
    title: "Leads",
    summary: "Lead capture, qualification, assignment, scoring, partner routing, and conversion readiness.",
    capabilities: ["Kanban", "CSV import", "Assignment", "Lead scoring"],
  },
  {
    slug: "deals",
    title: "Deals",
    summary: "Deal pipelines, stages, notes, expected value, and won/lost lifecycle tracking.",
    capabilities: ["Pipeline board", "Multiple pipelines", "Forecast", "Lost reasons"],
  },
  {
    slug: "customers",
    title: "Customers",
    summary: "Unified customer profile with lead, deal, task, campaign, and attachment history.",
    capabilities: ["Profile", "Attachments", "Tags", "Custom fields"],
  },
  {
    slug: "documents",
    title: "Files",
    summary: "Shared file index with folder-based organization plus lead and deal attachment support.",
    capabilities: ["Upload", "Folders", "Search", "Attachments"],
  },
  {
    slug: "tasks",
    title: "Tasks & Follow-ups",
    summary: "Action engine for reminders, due work, recurring items, and calendar-based follow-up execution.",
    capabilities: ["Assignments", "Recurring tasks", "Calendar view", "Overdue alerts"],
  },
  {
    slug: "partners",
    title: "Partners",
    summary: "Partner company access, assigned lead/deal ownership, performance tracking, and scoped permissions.",
    capabilities: ["Partner companies", "Partner users", "Lead assignment", "Performance"],
  },
  {
    slug: "campaigns",
    title: "Campaigns & Templates",
    summary: "Audience targeting, email campaigns, template management, scheduling, and analytics.",
    capabilities: ["Email campaigns", "Template library", "Scheduling", "Analytics"],
  },
  {
    slug: "automation",
    title: "Automation",
    summary: "Trigger-based CRM workflows with multi-step actions and execution logs.",
    capabilities: ["Builder", "Triggers", "Actions", "Logs"],
  },
  {
    slug: "reports",
    title: "Reports",
    summary: "Lead, deal, revenue, partner, and campaign analytics for workspace planning and review.",
    capabilities: ["Lead reports", "Deal reports", "Forecast", "Partner performance"],
  },
  {
    slug: "forms",
    title: "Forms",
    summary: "Hosted and embeddable lead capture forms with submission inbox, publishing, and CRM lead attribution.",
    capabilities: ["Builder", "Hosted links", "Embed", "Responses"],
  },
  {
    slug: "integrations",
    title: "Integrations",
    summary: "Guided provider setup for email, MTA, WhatsApp, LinkedIn, document intake, and shared webhook policy.",
    capabilities: ["Readiness", "Provider policy", "Docs links", "Rollout notes"],
  },
  {
    slug: "social",
    title: "Social",
    summary: "Connected social handles, captured conversations, inbox assignment, and lead conversion workflows.",
    capabilities: ["Accounts", "Capture", "Inbox", "Lead assignment"],
  },
];
