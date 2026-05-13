"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Joyride, EVENTS, STATUS, type EventData, type Step } from "react-joyride";

type CompanyRole = "owner" | "admin" | "member";

interface MembershipLike {
  companyId: string;
  role: CompanyRole;
  customRoleModules?: string[];
  isPartnerAccess?: boolean;
}

interface UserLike {
  id: string;
}

interface TourDefinition extends Step {
  id: string;
  route: string;
  moduleKey?: string;
  minRole?: CompanyRole;
  hiddenForPartnerAccess?: boolean;
}

export const COMPANY_TOUR_START_KEY = "crm.company-onboarding-tour:start";
export const COMPANY_TOUR_QUERY = "company-onboarding";

const roleRank: Record<CompanyRole, number> = { owner: 3, admin: 2, member: 1 };

const tourDefinitions: TourDefinition[] = [
  {
    id: "role",
    route: "/dashboard",
    target: '[data-tour="profile-menu"]',
    placement: "bottom-end",
    title: "Your role controls access",
    content: "Owners see the full company workspace. Admins manage operations and setup. Members focus on the CRM modules assigned to them.",
  },
  {
    id: "dashboard",
    route: "/dashboard",
    target: '[data-tour="dashboard-content"]',
    title: "Dashboard",
    content: "Start here for live pipeline, activity, and operational health across the workspace.",
  },
  {
    id: "settings",
    route: "/dashboard/settings",
    target: '[data-tour="nav-settings"]',
    title: "Company settings",
    content: "Manage company profile, branches, preferences, integrations, and replay this tour later.",
    moduleKey: "settings",
    minRole: "admin",
    hiddenForPartnerAccess: true,
  },
  {
    id: "team",
    route: "/dashboard/team",
    target: '[data-tour="nav-teams"]',
    title: "Team and roles",
    content: "Invite users, set owner/admin/member roles, and configure custom module access.",
    moduleKey: "teams",
    minRole: "admin",
  },
  {
    id: "contacts",
    route: "/dashboard/contacts",
    target: '[data-tour="nav-contacts"]',
    title: "Contacts",
    content: "Keep customer and contact records organized with timelines, ownership, and tags.",
    moduleKey: "contacts",
  },
  {
    id: "leads",
    route: "/dashboard/leads",
    target: '[data-tour="nav-leads"]',
    title: "Leads",
    content: "Capture, qualify, assign, and move new opportunities into your sales process.",
    moduleKey: "leads",
  },
  {
    id: "deals",
    route: "/dashboard/deals",
    target: '[data-tour="nav-deals"]',
    title: "Deals",
    content: "Track pipeline progress, values, stages, and won or lost outcomes.",
    moduleKey: "deals",
  },
  {
    id: "tasks",
    route: "/dashboard/tasks",
    target: '[data-tour="nav-tasks"]',
    title: "Tasks",
    content: "Use tasks and reminders to keep follow-ups from slipping.",
    moduleKey: "tasks",
  },
  {
    id: "meetings",
    route: "/dashboard/meetings",
    target: '[data-tour="nav-meetings"]',
    title: "Meetings",
    content: "Create scheduling flows, booking links, and availability-aware meeting types.",
    moduleKey: "meetings",
  },
  {
    id: "campaigns",
    route: "/dashboard/campaigns",
    target: '[data-tour="nav-campaigns"]',
    title: "Campaigns and templates",
    content: "Launch campaigns and reuse templates for consistent customer outreach.",
    moduleKey: "campaigns",
    minRole: "admin",
  },
  {
    id: "documents",
    route: "/dashboard/documents",
    target: '[data-tour="nav-documents"]',
    title: "Documents",
    content: "Store files and sales collateral where the team can find them.",
    moduleKey: "documents",
  },
  {
    id: "forms",
    route: "/dashboard/forms",
    target: '[data-tour="nav-forms"]',
    title: "Forms",
    content: "Create public forms and route responses into CRM records.",
    moduleKey: "forms",
    minRole: "admin",
  },
  {
    id: "automation",
    route: "/dashboard/automation",
    target: '[data-tour="nav-automation"]',
    title: "Automation",
    content: "Automate repetitive work with workflow and chatbot flow tools.",
    moduleKey: "automation",
    minRole: "admin",
  },
  {
    id: "integrations",
    route: "/dashboard/integrations",
    target: '[data-tour="nav-integrations"]',
    title: "Integrations",
    content: "Connect email, WhatsApp, webhooks, and other business channels.",
    moduleKey: "integrations",
    minRole: "admin",
    hiddenForPartnerAccess: true,
  },
  {
    id: "reports",
    route: "/dashboard/reports",
    target: '[data-tour="nav-reports"]',
    title: "Reports",
    content: "Review performance and activity trends once your CRM data starts flowing.",
    moduleKey: "reports",
    minRole: "admin",
  },
];

function canAccessStep(step: TourDefinition, membership: MembershipLike | null) {
  if (!membership) {
    return false;
  }

  if (step.hiddenForPartnerAccess && membership.isPartnerAccess) {
    return false;
  }

  const role = membership.role;
  const requiredRole = step.minRole ?? "member";
  const customRoleModules = membership.customRoleModules ?? [];
  const hasScopedModules = role === "member" && customRoleModules.length > 0;

  if (hasScopedModules && step.moduleKey) {
    return customRoleModules.includes(step.moduleKey);
  }

  return roleRank[role] >= roleRank[requiredRole];
}

function completionKey(userId: string, companyId: string) {
  return `crm-saas-tour-completed:${userId}:${companyId}`;
}

export function CompanyJoyrideTour({
  user,
  activeMembership,
}: {
  user: UserLike | null;
  activeMembership: MembershipLike | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(() => tourDefinitions.filter((step) => canAccessStep(step, activeMembership)), [activeMembership]);

  useEffect(() => {
    if (!user || !activeMembership || steps.length === 0) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const shouldStart = params.get("tour") === COMPANY_TOUR_QUERY || window.sessionStorage.getItem(COMPANY_TOUR_START_KEY);
    if (!shouldStart) {
      return;
    }

    window.sessionStorage.removeItem(COMPANY_TOUR_START_KEY);
    setStepIndex(0);
    setRun(true);
  }, [activeMembership, steps.length, user]);

  useEffect(() => {
    if (!run) {
      return;
    }

    const current = steps[stepIndex];
    if (current && pathname !== current.route) {
      router.push(current.route);
    }
  }, [pathname, router, run, stepIndex, steps]);

  const finish = useCallback(() => {
    if (user && activeMembership) {
      window.localStorage.setItem(completionKey(user.id, activeMembership.companyId), "true");
    }
    setRun(false);
    setStepIndex(0);
    router.replace("/dashboard");
  }, [activeMembership, router, user]);

  const currentStep = steps[stepIndex];
  const isRouteReady = !currentStep || pathname === currentStep.route;

  const handleCallback = (data: EventData) => {
    const { action, index, status, type } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      finish();
      return;
    }

    if (type !== EVENTS.STEP_AFTER && type !== EVENTS.TARGET_NOT_FOUND) {
      return;
    }

    const nextIndex = action === "prev" ? Math.max(index - 1, 0) : Math.min(index + 1, steps.length - 1);
    setStepIndex(nextIndex);
  };

  if (!activeMembership || steps.length === 0) {
    return null;
  }

  return (
    <Joyride
      continuous
      onEvent={handleCallback}
      run={run && isRouteReady}
      scrollToFirstStep
      stepIndex={stepIndex}
      steps={steps}
      options={{
        buttons: ["back", "primary", "skip"],
        primaryColor: "#0369a1",
        showProgress: true,
        textColor: "#0f172a",
        zIndex: 10000,
      }}
    />
  );
}
