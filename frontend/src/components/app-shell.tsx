/* eslint-disable @next/next/no-html-link-for-pages */
"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ChartColumnBig,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  FileBox,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  Link2,
  LogOut,
  Megaphone,
  MessageSquareShare,
  Network,
  PanelsTopLeft,
  Puzzle,
  ScanSearch,
  Settings2,
  Shield,
  Sparkles,
  Target,
  TextCursorInput,
  Users,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CrmModalShell } from "@/components/crm/crm-list-primitives";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError, apiRequest } from "@/lib/api";
import {
  clearCompanyCookie,
  clearStoreCookie,
  getCompanyCookie,
  setCompanyCookie,
  setStoreCookie,
} from "@/lib/cookies";
import { clearCachedMe, getCachedMe, loadMe as loadCachedMe, type MeResponse } from "@/lib/me-cache";
import {
  clearRememberedPartnerCompanySelection,
  getRememberedPartnerCompanySelection,
  hasMultiplePartnerCompanies,
  isPartnerUser,
} from "@/lib/partner-access";
import { cn } from "@/lib/utils";
import {
  addNotificationsChangedListener,
  connectNotificationEventStream,
  emitNotificationsChanged,
  fetchNotificationPreview,
  normalizeNotificationHref,
  patchNotificationRead,
  removeNotification,
  type NotificationItem,
} from "@/features/notifications/client";
import websiteLogo from "@/assets/logo-png.png";

type CompanyRole = "owner" | "admin" | "member";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  minRole: CompanyRole;
  moduleKey?: "contacts" | "leads" | "deals" | "forms" | "tasks" | "meetings" | "documents" | "templates" | "reports" | "campaigns" | "automation" | "integrations" | "social" | "notifications" | "partners" | "settings" | "teams";
  superAdminOnly?: boolean;
  partnerAccessOnly?: boolean;
};

const navItems: NavItem[] = [
  { href: "/dashboard/company", label: "Company", icon: Building2, minRole: "member", partnerAccessOnly: true },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, minRole: "member" },
  { href: "/dashboard/leads", label: "Leads", icon: Target, minRole: "member", moduleKey: "leads" },
  { href: "/dashboard/deals", label: "Deals", icon: BriefcaseBusiness, minRole: "member", moduleKey: "deals" },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users, minRole: "member", moduleKey: "contacts" },
  { href: "/dashboard/documents", label: "Files", icon: FileBox, minRole: "member", moduleKey: "documents" },
  { href: "/dashboard/tasks", label: "Tasks", icon: PanelsTopLeft, minRole: "member", moduleKey: "tasks" },
  { href: "/dashboard/meetings", label: "Meetings", icon: CalendarClock, minRole: "member", moduleKey: "meetings" },
  { href: "/dashboard/partners", label: "Partners", icon: Building2, minRole: "admin", moduleKey: "partners" },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone, minRole: "admin", moduleKey: "campaigns" },
  { href: "/dashboard/templates", label: "Templates", icon: FileText, minRole: "admin", moduleKey: "templates" },
  { href: "/dashboard/automation", label: "Automation", icon: Sparkles, minRole: "admin", moduleKey: "automation" },
  { href: "/dashboard/chatbot-flows", label: "Chatbot Flows", icon: Network, minRole: "admin", moduleKey: "automation" },
  { href: "/dashboard/reports", label: "Stats", icon: ChartColumnBig, minRole: "admin", moduleKey: "reports" },
  { href: "/dashboard/forms", label: "Forms", icon: TextCursorInput, minRole: "admin", moduleKey: "forms" },
  { href: "/dashboard/integrations", label: "Integrations", icon: Link2, minRole: "admin", moduleKey: "integrations" },
  { href: "/dashboard/social", label: "Social", icon: MessageSquareShare, minRole: "admin", moduleKey: "social" },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell, minRole: "admin", moduleKey: "notifications" },
  { href: "/dashboard/team", label: "Team", icon: Users, minRole: "admin", moduleKey: "teams" },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2, minRole: "admin", moduleKey: "settings" },
  { href: "/dashboard/invite", label: "Invite", icon: HeartHandshake, minRole: "member" },
  { href: "/dashboard/super-admin", label: "Super Admin", icon: Shield, minRole: "member", superAdminOnly: true },
];

const navGroups = [
  { id: "home", label: "Home", hrefs: ["/dashboard/company", "/dashboard"] },
  // { id: "agent", label: "Agent", hrefs: ["/dashboard/automation", "/dashboard/chatbot-flows"] },
  { id: "crm", label: "CRM", hrefs: ["/dashboard/contacts", "/dashboard/leads", "/dashboard/deals", "/dashboard/tasks"] },
  { id: "marketing", label: "Marketing", hrefs: ["/dashboard/campaigns", "/dashboard/templates", "/dashboard/documents", "/dashboard/notifications", "/dashboard/social"] },
  { id: "users", label: "Users", hrefs: ["/dashboard/meetings", "/dashboard/team", "/dashboard/partners", "/dashboard/settings", "/dashboard/invite"] },
  { id: "addons", label: "Add Ons", hrefs: ["/dashboard/forms", "/dashboard/integrations", "/dashboard/reports", "/dashboard/super-admin"] },
];

const navGroupItemOverrides: Record<string, Record<string, { label?: string; icon?: NavItem["icon"] }>> = {
  // agent: {
  //   "/dashboard/automation": { label: "Workflow", icon: Sparkles },
  //   "/dashboard/chatbot-flows": { label: "LinkedIn", icon: HeartHandshake },
  // },
  marketing: {
    "/dashboard/campaigns": { label: "Campaigns", icon: Megaphone },
    "/dashboard/templates": { label: "Templates", icon: FileText },
    "/dashboard/documents": { label: "Files", icon: FileBox },
    "/dashboard/notifications": { label: "Notifications", icon: Bell },
    "/dashboard/social": { label: "Social", icon: MessageSquareShare },
  },
  users: {
    "/dashboard/meetings": { label: "Meetings", icon: CalendarClock },
    "/dashboard/team": { label: "Team", icon: Users },
    "/dashboard/settings": { label: "Settings", icon: Settings2 },
    "/dashboard/partners": { label: "Partners", icon: Building2 },
    "/dashboard/invite": { label: "Invite", icon: HeartHandshake },
  },
  addons: {
    "/dashboard/forms": { label: "Forms", icon: TextCursorInput },
    "/dashboard/integrations": { label: "Integrations", icon: Link2 },
    "/dashboard/reports": { label: "Stats", icon: ChartColumnBig },
    "/dashboard/super-admin": { label: "Super Admin", icon: Shield },
  },
};

function formatBreadcrumbLabel(value: string) {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getMembershipRoleLabel(membership?: {
  role?: string | null;
  customRoleName?: string | null;
} | null) {
  if (!membership) {
    return "member";
  }

  return membership.customRoleName?.trim() || membership.role || "member";
}

export function AppShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [activeMembershipId, setActiveMembershipId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [notificationPreviewOpen, setNotificationPreviewOpen] = useState(false);
  const [notificationPreviewItems, setNotificationPreviewItems] = useState<NotificationItem[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationPreviewLoading, setNotificationPreviewLoading] = useState(false);
  const [notificationWorkingId, setNotificationWorkingId] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationPreviewLoadedAt, setNotificationPreviewLoadedAt] = useState(0);

  const activeMembership = useMemo(
    () => me?.memberships.find((membership) => membership.membershipId === activeMembershipId) ?? null,
    [activeMembershipId, me?.memberships],
  );
  const partnerUser = useMemo(() => isPartnerUser(me), [me]);
  const multiPartnerCompanyUser = useMemo(() => hasMultiplePartnerCompanies(me), [me]);

  const visibleNavItems = useMemo(() => {
    const roleRank: Record<CompanyRole, number> = { owner: 3, admin: 2, member: 1 };
    const activeRole = activeMembership?.role ?? "member";
    const customRoleModules = activeMembership?.customRoleModules ?? [];
    const hasScopedModules = activeRole === "member" && customRoleModules.length > 0;
    return navItems.filter((item) => {
      if (item.superAdminOnly && !me?.isSuperAdmin) {
        return false;
      }

      if (item.partnerAccessOnly && !partnerUser) {
        return false;
      }

      if (!item.partnerAccessOnly && item.href === "/dashboard/settings" && activeMembership?.isPartnerAccess) {
        return false;
      }

      if (hasScopedModules && item.moduleKey) {
        return customRoleModules.includes(item.moduleKey);
      }

      return roleRank[activeRole] >= roleRank[item.minRole];
    });
  }, [activeMembership?.customRoleModules, activeMembership?.isPartnerAccess, activeMembership?.role, me?.isSuperAdmin, partnerUser]);

  const canAccessNotifications = useMemo(
    () => visibleNavItems.some((item) => item.href === "/dashboard/notifications"),
    [visibleNavItems],
  );

  const visibleNavGroups = useMemo(() => {
    const itemMap = new Map(visibleNavItems.map((item) => [item.href, item]));
    return navGroups
      .map((group) => ({
        ...group,
        items: group.hrefs
          .map((href) => {
            const item = itemMap.get(href);
            if (!item) {
              return null;
            }

            const override = navGroupItemOverrides[group.id]?.[href];
            return override ? { ...item, ...override } : item;
          })
          .filter(Boolean) as NavItem[],
      }))
      .filter((group) => group.items.length > 0);
  }, [visibleNavItems]);

  const breadcrumbItems = useMemo(() => {
    const itemMap = new Map(navItems.map((item) => [item.href, item.label]));
    const items = [{ href: "/dashboard", label: "Home" }];

    if (pathname.startsWith("/dashboard/contacts/")) {
      items.push({ href: "/dashboard/contacts", label: "Contact" });
      items.push({ href: pathname, label: title });
    } else if (pathname.startsWith("/dashboard/leads/")) {
      items.push({ href: "/dashboard/leads", label: "Leads" });
      items.push({ href: pathname, label: title });
    } else if (pathname.startsWith("/dashboard/deals/")) {
      items.push({ href: "/dashboard/deals", label: "Deals" });
      items.push({ href: pathname, label: title });
    } else if (pathname.startsWith("/dashboard/tasks/")) {
      items.push({ href: "/dashboard/tasks", label: "Tasks" });
      items.push({ href: pathname, label: title });
    } else if (pathname.startsWith("/dashboard/meetings/")) {
      items.push({ href: "/dashboard/meetings", label: "Meetings" });
      items.push({ href: pathname, label: title });
    } else if (pathname.startsWith("/dashboard/forms/")) {
      items.push({ href: "/dashboard/forms", label: "Forms" });
      items.push({ href: pathname, label: title });
    } else if (pathname.startsWith("/dashboard/documents/files/")) {
      items.push({ href: "/dashboard/documents", label: "Files" });
      items.push({ href: pathname, label: title });
    } else if (pathname !== "/dashboard") {
      items.push({
        href: pathname,
        label: itemMap.get(pathname) ?? formatBreadcrumbLabel(pathname.split("/").filter(Boolean).at(-1) ?? title),
      });
    }

    if (activeTab) {
      items.push({
        href: `${pathname}?tab=${encodeURIComponent(activeTab)}`,
        label: formatBreadcrumbLabel(activeTab),
      });
    }

    return items;
  }, [activeTab, pathname, title]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem("crm.sidebarExpanded");
    if (stored !== null) {
      setSidebarExpanded(stored === "true");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem("crm.sidebarExpanded", String(sidebarExpanded));
  }, [sidebarExpanded]);

  useEffect(() => {
    let disposed = false;
    const cached = getCachedMe();

    if (cached) {
      setMe(cached);
      setLoading(false);
    }

    const loadWorkspace = async () => {
      try {
        const response = await loadCachedMe();
        if (disposed) {
          return;
        }

        if (response.needsOnboarding && !response.isSuperAdmin) {
          router.replace("/onboarding");
          return;
        }

        setMe(response);

        const cookieCompanyId = getCompanyCookie();
        const initialMembership =
          response.memberships.find((membership) => membership.companyId === cookieCompanyId) ??
          response.memberships[0] ??
          null;

        if (initialMembership) {
          setActiveMembershipId(initialMembership.membershipId);
          setCompanyCookie(initialMembership.companyId);
          if (initialMembership.storeId) {
            setStoreCookie(initialMembership.storeId);
          } else {
            clearStoreCookie();
          }
        }
      } catch (error) {
        const fallbackMessage = "Failed to load workspace context.";
        if (error instanceof ApiError && error.status === 401) {
          clearCachedMe();
          clearCompanyCookie();
          clearStoreCookie();
          clearRememberedPartnerCompanySelection();
          router.replace("/auth/login");
          return;
        }

        setLoadError(error instanceof Error ? error.message : fallbackMessage);
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void loadWorkspace();

    return () => {
      disposed = true;
    };
  }, [router]);

  useEffect(() => {
    if (loading || !activeMembership || !multiPartnerCompanyUser) {
      return;
    }

    if (pathname === "/dashboard/company") {
      return;
    }

    const rememberedCompanyId = getRememberedPartnerCompanySelection();
    if (rememberedCompanyId !== activeMembership.companyId) {
      router.replace("/dashboard/company");
    }
  }, [activeMembership, loading, multiPartnerCompanyUser, pathname, router]);

  useEffect(() => {
    setProfileMenuOpen(false);
    setNotificationPreviewOpen(false);
  }, [pathname, activeTab]);

  useEffect(() => {
    const syncActiveTab = () => {
      if (typeof window === "undefined") {
        return;
      }

      setActiveTab(new URLSearchParams(window.location.search).get("tab"));
    };

    syncActiveTab();
    window.addEventListener("app-tab-change", syncActiveTab);
    window.addEventListener("popstate", syncActiveTab);

    return () => {
      window.removeEventListener("app-tab-change", syncActiveTab);
      window.removeEventListener("popstate", syncActiveTab);
    };
  }, [pathname]);

  const loadNotificationPreview = useCallback(
    async (skipCache = true) => {
      if (!canAccessNotifications || !activeMembership) {
        return;
      }

      setNotificationPreviewLoading(true);
      setNotificationError(null);
      try {
        const response = await fetchNotificationPreview(3, skipCache);
        setNotificationPreviewItems(response.items);
        setNotificationUnreadCount(response.unreadCount);
        setNotificationPreviewLoadedAt(Date.now());
      } catch (requestError) {
        setNotificationError(requestError instanceof ApiError ? requestError.message : "Unable to load notifications");
      } finally {
        setNotificationPreviewLoading(false);
      }
    },
    [activeMembership, canAccessNotifications],
  );

  useEffect(() => {
    if (loading || !canAccessNotifications || !activeMembership) {
      return;
    }

    void loadNotificationPreview(false);
  }, [activeMembership, canAccessNotifications, loadNotificationPreview, loading]);

  useEffect(() => {
    return addNotificationsChangedListener(() => {
      void loadNotificationPreview(true);
    });
  }, [loadNotificationPreview]);

  useEffect(() => {
    if (!canAccessNotifications || loading || !activeMembership) {
      return;
    }

    return connectNotificationEventStream(() => {
      void loadNotificationPreview(true);
    });
  }, [activeMembership, canAccessNotifications, loadNotificationPreview, loading]);

  const handleNotificationReadToggle = async (item: NotificationItem, nextRead: boolean) => {
    const previousItems = notificationPreviewItems;
    const previousUnreadCount = notificationUnreadCount;
    setNotificationWorkingId(item.id);

    setNotificationPreviewItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              readAt: nextRead ? new Date().toISOString() : null,
              isRead: nextRead,
            }
          : entry,
      ),
    );

    if (item.readAt && !nextRead) {
      setNotificationUnreadCount((current) => current + 1);
    } else if (!item.readAt && nextRead) {
      setNotificationUnreadCount((current) => Math.max(0, current - 1));
    }

    try {
      const result = await patchNotificationRead(item.id, nextRead);
      setNotificationUnreadCount(result.unreadCount);
      emitNotificationsChanged();
    } catch (requestError) {
      setNotificationPreviewItems(previousItems);
      setNotificationUnreadCount(previousUnreadCount);
      setNotificationError(requestError instanceof ApiError ? requestError.message : "Unable to update notification");
    } finally {
      setNotificationWorkingId(null);
    }
  };

  const handleNotificationDelete = async (item: NotificationItem) => {
    const previousItems = notificationPreviewItems;
    const previousUnreadCount = notificationUnreadCount;
    setNotificationWorkingId(item.id);
    setNotificationPreviewItems((current) => current.filter((entry) => entry.id !== item.id));

    if (!item.readAt) {
      setNotificationUnreadCount((current) => Math.max(0, current - 1));
    }

    try {
      const result = await removeNotification(item.id);
      setNotificationUnreadCount(result.unreadCount);
      emitNotificationsChanged();
    } catch (requestError) {
      setNotificationPreviewItems(previousItems);
      setNotificationUnreadCount(previousUnreadCount);
      setNotificationError(requestError instanceof ApiError ? requestError.message : "Unable to delete notification");
    } finally {
      setNotificationWorkingId(null);
    }
  };

  const openNotificationTarget = (item: NotificationItem) => {
    setNotificationPreviewOpen(false);
    router.push(normalizeNotificationHref(item));
  };

  const handleWorkspaceChange = (membershipId: string) => {
    if (!me) {
      return;
    }

    const selected = me.memberships.find((membership) => membership.membershipId === membershipId);
    if (!selected) {
      return;
    }

    setActiveMembershipId(selected.membershipId);
    setCompanyCookie(selected.companyId);

    if (selected.storeId) {
      setStoreCookie(selected.storeId);
    } else {
      clearStoreCookie();
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await apiRequest("/auth/logout", {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch {
      // ignore
    }
    clearCompanyCookie();
    clearStoreCookie();
    clearCachedMe();
    clearRememberedPartnerCompanySelection();
    router.replace("/auth/login");
  };

  const userInitials = useMemo(() => {
    const fullName = me?.user.fullName?.trim();
    if (!fullName) {
      return "CR";
    }

    return fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }, [me?.user.fullName]);

  return (
    <main className="relative min-h-screen bg-slate-50 lg:h-screen lg:overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-[-12%] opacity-70 [background:radial-gradient(circle_at_18%_22%,rgba(73,148,255,0.18),transparent_24%),radial-gradient(circle_at_82%_18%,rgba(126,210,255,0.16),transparent_22%),radial-gradient(circle_at_54%_78%,rgba(48,120,255,0.12),transparent_28%)] [animation:ambient-blue-orb-a_16s_ease-in-out_infinite_alternate]" />
        <div className="absolute inset-[-16%] opacity-60 [background:radial-gradient(circle_at_22%_76%,rgba(158,223,255,0.16),transparent_24%),radial-gradient(circle_at_76%_64%,rgba(70,145,255,0.13),transparent_26%),radial-gradient(circle_at_52%_18%,rgba(97,184,255,0.12),transparent_20%)] [animation:ambient-blue-orb-b_20s_ease-in-out_infinite_alternate]" />
        <div className="absolute inset-[-18%] opacity-50 [background:conic-gradient(from_180deg_at_50%_50%,rgba(255,255,255,0)_0deg,rgba(104,177,255,0.08)_110deg,rgba(210,241,255,0.05)_220deg,rgba(255,255,255,0)_360deg)] [animation:ambient-blue-wash_18s_ease-in-out_infinite_alternate]" />
      </div>

      <div
        className={cn(
          "relative min-h-screen px-4 py-4 transition-[padding] duration-200 lg:h-full lg:min-h-0 lg:px-4 lg:py-4",
          sidebarExpanded ? "lg:pl-[280px]" : "lg:pl-[120px]",
        )}
      >
        <aside
          className={cn(
            "z-40 mb-4 w-full rounded-[2rem] border border-sky-200/70 bg-white p-3 shadow-[0_28px_80px_-42px_rgba(56,122,199,0.26)] transition-[width] duration-200 lg:fixed lg:bottom-4 lg:left-4 lg:top-4 lg:mb-0 lg:overflow-y-auto lg:rounded-[2rem] lg:border lg:p-3",
            sidebarExpanded ? "lg:w-[240px]" : "lg:w-[84px]",
          )}
        >
          <div className="flex h-full flex-col gap-4 lg:min-h-0">
            <div className={cn("flex items-center gap-3 rounded-[1.5rem] border border-sky-200/70 bg-white p-3 text-sky-900", sidebarExpanded ? "justify-between" : "justify-center")}>
              <div className={cn("flex items-center gap-3 overflow-hidden", !sidebarExpanded && "justify-center")}>
                <Link href="/dashboard" aria-label="Go to dashboard home" className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-sky-200/70 bg-white shadow-[0_14px_30px_-20px_rgba(56,122,199,0.32)] transition-transform hover:scale-[1.02]">
                  <Image src={websiteLogo} alt="The One CRM logo" className="h-8 w-8 object-contain" priority />
                </Link>
                {sidebarExpanded ? (
                  <div className="min-w-0">
                    <Link href="/dashboard" className="truncate font-heading text-xs font-extrabold text-sky-950 transition-colors hover:text-sky-700">
                      The One CRM
                    </Link>
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="hidden lg:inline-flex"
                onClick={() => setSidebarExpanded((current) => !current)}
                aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
              >
                {sidebarExpanded ? <ChevronsLeft className="size-6" /> : <ChevronsRight className="size-6" />}
              </Button>
            </div>

            {sidebarExpanded && !partnerUser ? (
              <div className="rounded-[1.5rem] border border-sky-200/70 bg-white p-2.5">
                <label htmlFor="workspace-picker" className="mb-1.5 block text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-sky-700/90">
                  Active company
                </label>
                <NativeSelect
                  id="workspace-picker"
                  className="h-9 rounded-xl px-3 text-xs"
                  value={activeMembershipId ?? ""}
                  onChange={(event) => handleWorkspaceChange(event.target.value)}
                >
                  {me?.memberships.map((membership) => (
                    <option key={membership.membershipId} value={membership.membershipId}>
                      {membership.companyName} ({getMembershipRoleLabel(membership)})
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden">
              <nav className="hide-scrollbar flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
                {visibleNavGroups.map((group) => (
                  <div key={group.id} className="grid gap-2 border-t border-sky-200/70 pt-1 first:border-t-0 first:pt-0">
                    {sidebarExpanded ? (
                      <div className="px-2 text-[0.64rem] font-semibold uppercase tracking-[0.1em] text-sky-700/90">
                        {group.label}
                      </div>
                    ) : null}
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname === item.href || pathname.startsWith(`${item.href}/`);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          title={!sidebarExpanded ? item.label : undefined}
                          className={cn(
                            "group relative flex items-center rounded-xl text-sm font-medium transition-all text-sky-900",
                            sidebarExpanded ? "gap-1 px-2 py-2" : "justify-center px-0 py-2",
                            isActive
                              ? "bg-sky-200/90 text-sky-900"
                              : "border border-transparent text-sky-800/90 hover:bg-sky-50 hover:text-sky-950",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-lg transition-colors text-sky-700",
                              isActive ? "text-sky-900" : "text-sky-700",
                            )}
                          >
                            <Icon className="size-4" />
                          </span>
                          {sidebarExpanded ? <span className="truncate">{item.label}</span> : null}
                          {!sidebarExpanded ? (
                            <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-20 -translate-y-1/2 rounded-xl border border-sky-200/80 bg-white px-2 py-1.5 text-xs font-semibold text-slate-900 opacity-0 shadow-[0_14px_34px_-20px_rgba(35,86,166,0.35)] transition-opacity group-hover:opacity-100">
                              {item.label}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 flex-col lg:h-full">
          <header className="z-30 mb-4 shrink-0 rounded-[1.4rem] border border-sky-200/70 bg-white px-3 py-2 shadow-[0_18px_45px_-32px_rgba(56,122,199,0.22)] lg:sticky lg:top-4 lg:mb-4 lg:rounded-[1.4rem] lg:border lg:px-4">
            <div className="flex gap-3 lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <nav className="flex flex-wrap items-center gap-1 text-xs text-sky-700 lg:text-sm">
                  {breadcrumbItems.map((item, index) => {
                    const isLast = index === breadcrumbItems.length - 1;

                    return (
                      <div key={`${item.href}-${item.label}`} className="flex items-center gap-1">
                        {index > 0 ? <ChevronRight className="size-3.5 text-sky-600/80" /> : null}
                        {isLast ? (
                          <span className="font-bold text-sky-950">{item.label}</span>
                        ) : (
                          <Link href={item.href} className="transition-colors hover:text-sky-950">
                            {item.label}
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </nav>
                <p className="mt-0.5 text-sm text-sky-700">{description}</p>
              </div>

              <div className="flex shrink-0 items-start gap-2 self-start">
                {canAccessNotifications ? (
                  <button
                    type="button"
                    className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200/70 bg-white text-sky-900 transition-colors hover:bg-sky-50"
                    aria-label="Open notifications"
                    onClick={() => {
                      setNotificationPreviewOpen(true);
                      const stale = Date.now() - notificationPreviewLoadedAt > 45_000;
                      if (stale) {
                        void loadNotificationPreview(true);
                      }
                    }}
                  >
                    <Bell className="size-4" />
                    {notificationUnreadCount > 0 ? (
                      <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[0.65rem] font-semibold text-white">
                        {notificationUnreadCount > 99 ? "99+" : notificationUnreadCount}
                      </span>
                    ) : null}
                  </button>
                ) : null}

                <div className="relative">
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-xl border border-sky-200/70 bg-white px-2.5 py-1.5 text-sky-900 transition-colors hover:bg-sky-50"
                    onClick={() => setProfileMenuOpen((current) => !current)}
                  >
                    <Avatar>
                      <AvatarFallback>{userInitials}</AvatarFallback>
                    </Avatar>
                    <div className="hidden min-w-0 text-left lg:block">
                      <div className="max-w-44 truncate text-sm font-semibold text-sky-950">{me?.user.fullName ?? "CRM Operator"}</div>
                      <div className="text-xs text-sky-700">{getMembershipRoleLabel(activeMembership)}</div>
                    </div>
                    <ChevronDown className="size-4 text-sky-600/80" />
                  </button>

                  {profileMenuOpen ? (
                    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 min-w-72 rounded-2xl border border-white/80 bg-white/96 p-2 shadow-[0_22px_60px_-30px_rgba(35,86,166,0.38)] backdrop-blur-xl">
                      <div className="rounded-xl border border-border/70 bg-secondary/30 px-3 py-3">
                        <div className="truncate text-sm font-semibold text-slate-900">{me?.user.fullName ?? "CRM Operator"}</div>
                        <div className="truncate text-sm text-muted-foreground">{me?.user.email ?? "No email loaded"}</div>
                        <div className="border my-2" />
                        <div className="inline-flex mt-2 mr-2 truncate text-base text-slate-700">{activeMembership?.companyName ?? "Workspace"} </div>
                        <div className="inline-flex mt-1 text-base uppercase text-primary/70">{getMembershipRoleLabel(activeMembership)}</div>
                      </div>
                      <Link
                        href={partnerUser ? "/dashboard/company" : "/dashboard/settings"}
                        className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-secondary/65"
                      >
                        {partnerUser ? <Building2 className="size-4 text-primary" /> : <Settings2 className="size-4 text-primary" />}
                        {partnerUser ? "Company" : "Settings"}
                      </Link>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/8"
                        onClick={() => {
                          setProfileMenuOpen(false);
                          setConfirmLogoutOpen(true);
                        }}
                      >
                        <LogOut className="size-4" />
                        Logout
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <section className="hide-scrollbar min-w-0 pb-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            <div className="grid gap-5">
              {loading ? <div className="rounded-2xl border border-dashed border-border/80 bg-white/55 px-4 py-3 text-sm text-muted-foreground">Loading workspace...</div> : null}
              {loadError ? <div className="rounded-2xl border border-destructive/15 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</div> : null}
              {!loading && !loadError ? <div className="grid gap-6">{children}</div> : null}
            </div>
          </section>
        </div>
      </div>

      <CrmModalShell
        open={notificationPreviewOpen}
        title="Recent notifications"
        description="Latest updates across your CRM workspace."
        onClose={() => setNotificationPreviewOpen(false)}
        maxWidthClassName="max-w-2xl"
        headerActions={
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              setNotificationPreviewOpen(false);
              router.push("/dashboard/notifications");
            }}
          >
            Open inbox
          </Button>
        }
      >
        <div className="grid gap-3">
          {notificationError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{notificationError}</div>
          ) : null}

          {notificationPreviewLoading ? (
            <div className="rounded-xl border border-border/60 bg-slate-50 px-3 py-4 text-sm text-muted-foreground">Loading notifications...</div>
          ) : null}

          {!notificationPreviewLoading && notificationPreviewItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/70 px-3 py-6 text-sm text-muted-foreground">No notifications yet.</div>
          ) : null}

          {!notificationPreviewLoading
            ? notificationPreviewItems.map((item) => (
                <div key={item.id} className="grid gap-2 rounded-xl border border-border/70 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => openNotificationTarget(item)}
                    >
                      <div className="truncate text-sm font-semibold text-slate-900 hover:text-sky-700">{item.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div>
                    </button>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="capitalize">
                        {item.type}
                      </Badge>
                      <Badge variant={item.readAt ? "outline" : "secondary"}>{item.readAt ? "read" : "unread"}</Badge>
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground">{item.message}</div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" size="xs" variant="ghost" onClick={() => openNotificationTarget(item)}>
                      Open
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={notificationWorkingId === item.id}
                      onClick={() => void handleNotificationReadToggle(item, !item.readAt)}
                    >
                      {item.readAt ? "Mark unread" : "Mark read"}
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="text-rose-600 hover:text-rose-700"
                      disabled={notificationWorkingId === item.id}
                      onClick={() => void handleNotificationDelete(item)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            : null}
        </div>
      </CrmModalShell>

      {confirmLogoutOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] border border-white/80 bg-white p-5 shadow-[0_30px_90px_-45px_rgba(15,23,42,0.45)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">Logout?</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Your current workspace session will end and you will be returned to the login screen.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl bg-destructive p-2 text-white transition-colors hover:bg-destructive/90"
                onClick={() => setConfirmLogoutOpen(false)}
                aria-label="Close logout confirmation"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <Badge variant="outline">{activeMembership?.companyName ?? "Current workspace"}</Badge>
              <div className="flex gap-3">
                <Button type="button" variant="destructive" onClick={() => setConfirmLogoutOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" variant="default" disabled={loggingOut} onClick={() => void handleLogout()}>
                  {loggingOut ? "Logging out..." : "Confirm logout"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
