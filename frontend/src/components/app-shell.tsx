/* eslint-disable @next/next/no-html-link-for-pages */
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  ChartColumnBig,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleUserRound,
  FileText,
  LayoutDashboard,
  Link2,
  LogOut,
  Megaphone,
  MessageSquareShare,
  Network,
  PanelsTopLeft,
  Settings2,
  Shield,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError, apiRequest } from "@/lib/api";
import {
  clearCompanyCookie,
  clearStoreCookie,
  getCompanyCookie,
  setCompanyCookie,
  setStoreCookie,
} from "@/lib/cookies";
import { cn } from "@/lib/utils";

type CompanyRole = "owner" | "admin" | "member";

interface Membership {
  membershipId: string;
  companyId: string;
  role: CompanyRole;
  status: string;
  storeId: string | null;
  companyName: string;
  storeName: string | null;
}

interface MeResponse {
  isSuperAdmin: boolean;
  user: {
    id: string;
    email: string | null;
    fullName: string | null;
    isSuperAdmin?: boolean;
  };
  memberships: Membership[];
  needsOnboarding: boolean;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, minRole: "member" as CompanyRole },
  { href: "/dashboard/leads", label: "Leads", icon: Target, minRole: "member" as CompanyRole },
  { href: "/dashboard/deals", label: "Deals", icon: BriefcaseBusiness, minRole: "member" as CompanyRole },
  { href: "/dashboard/customers", label: "Customers", icon: Users, minRole: "member" as CompanyRole },
  { href: "/dashboard/documents", label: "Files", icon: FileText, minRole: "member" as CompanyRole },
  { href: "/dashboard/tasks", label: "Tasks", icon: PanelsTopLeft, minRole: "member" as CompanyRole },
  { href: "/dashboard/partners", label: "Partners", icon: Building2, minRole: "admin" as CompanyRole },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone, minRole: "admin" as CompanyRole },
  { href: "/dashboard/automation", label: "Automation", icon: Sparkles, minRole: "admin" as CompanyRole },
  { href: "/dashboard/chatbot-flows", label: "Chatbot Flows", icon: Network, minRole: "admin" as CompanyRole },
  { href: "/dashboard/reports", label: "Reports", icon: ChartColumnBig, minRole: "admin" as CompanyRole },
  { href: "/dashboard/integrations", label: "Integrations", icon: Link2, minRole: "admin" as CompanyRole },
  { href: "/dashboard/social", label: "Social", icon: MessageSquareShare, minRole: "admin" as CompanyRole },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell, minRole: "admin" as CompanyRole },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2, minRole: "admin" as CompanyRole },
  { href: "/dashboard/company-admin", label: "Company Admin", icon: Building2, minRole: "admin" as CompanyRole },
  { href: "/dashboard/super-admin", label: "Super Admin", icon: Shield, minRole: "member" as CompanyRole, superAdminOnly: true },
];

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
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const activeMembership = useMemo(
    () => me?.memberships.find((membership) => membership.membershipId === activeMembershipId) ?? null,
    [activeMembershipId, me?.memberships],
  );

  const visibleNavItems = useMemo(() => {
    const roleRank: Record<CompanyRole, number> = { owner: 3, admin: 2, member: 1 };
    const activeRole = activeMembership?.role ?? "member";
    return navItems.filter((item) => {
      if ("superAdminOnly" in item && item.superAdminOnly && !me?.isSuperAdmin) {
        return false;
      }

      return roleRank[activeRole] >= roleRank[item.minRole];
    });
  }, [activeMembership?.role, me?.isSuperAdmin]);

  useEffect(() => {
    let disposed = false;

    const loadMe = async () => {
      try {
        const response = await apiRequest<MeResponse>("/auth/me");
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
          clearCompanyCookie();
          clearStoreCookie();
          router.replace("/login");
          return;
        }

        setLoadError(error instanceof Error ? error.message : fallbackMessage);
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void loadMe();

    return () => {
      disposed = true;
    };
  }, [router]);

  useEffect(() => {
    setProfileMenuOpen(false);
  }, [pathname]);

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
    router.replace("/login");
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
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-[-12%] opacity-100 [background:radial-gradient(circle_at_18%_22%,rgba(73,148,255,0.32),transparent_24%),radial-gradient(circle_at_82%_18%,rgba(126,210,255,0.3),transparent_22%),radial-gradient(circle_at_54%_78%,rgba(48,120,255,0.22),transparent_28%)] [animation:ambient-blue-orb-a_16s_ease-in-out_infinite_alternate]" />
        <div className="absolute inset-[-16%] opacity-95 [background:radial-gradient(circle_at_22%_76%,rgba(158,223,255,0.34),transparent_24%),radial-gradient(circle_at_76%_64%,rgba(70,145,255,0.24),transparent_26%),radial-gradient(circle_at_52%_18%,rgba(97,184,255,0.22),transparent_20%)] [animation:ambient-blue-orb-b_20s_ease-in-out_infinite_alternate]" />
        <div className="absolute inset-[-18%] opacity-80 [background:conic-gradient(from_180deg_at_50%_50%,rgba(255,255,255,0)_0deg,rgba(104,177,255,0.14)_110deg,rgba(210,241,255,0.08)_220deg,rgba(255,255,255,0)_360deg)] [animation:ambient-blue-wash_18s_ease-in-out_infinite_alternate]" />
      </div>
      <div className="relative mx-auto flex min-h-screen max-w-[1720px] flex-col gap-5 px-4 py-4 lg:flex-row lg:px-5 lg:py-5">
        <aside
          className={cn(
            "w-full shrink-0 rounded-[2rem] border border-white/75 bg-sidebar/92 p-3 shadow-[0_28px_80px_-42px_rgba(34,92,191,0.35)] backdrop-blur-xl transition-[width] duration-200 lg:h-[calc(100vh-2.5rem)] lg:p-4",
            sidebarExpanded ? "lg:w-[280px]" : "lg:w-[92px]",
          )}
        >
          <div className="flex h-full flex-col gap-4">
            <div className={cn("flex items-center gap-3 rounded-[1.5rem] border border-white/80 bg-white/72 p-3", sidebarExpanded ? "justify-between" : "justify-center")}>
              <div className={cn("flex items-center gap-3 overflow-hidden", !sidebarExpanded && "justify-center")}>
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                  <Sparkles className="size-5" />
                </div>
                {sidebarExpanded ? (
                  <div className="min-w-0">
                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-primary/75">CRM</div>
                    <div className="truncate font-heading text-lg font-semibold text-slate-900">
                      {activeMembership?.companyName ?? "Workspace"}
                    </div>
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
                {sidebarExpanded ? <ChevronsLeft className="size-4" /> : <ChevronsRight className="size-4" />}
              </Button>
            </div>

            {sidebarExpanded ? (
              <div className="rounded-[1.5rem] border border-white/80 bg-white/72 p-3">
                <label htmlFor="workspace-picker" className="mb-2 block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Active company
                </label>
                <NativeSelect
                  id="workspace-picker"
                  value={activeMembershipId ?? ""}
                  onChange={(event) => handleWorkspaceChange(event.target.value)}
                >
                  {me?.memberships.map((membership) => (
                    <option key={membership.membershipId} value={membership.membershipId}>
                      {membership.companyName} ({membership.role})
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden">
              <nav className="hide-scrollbar flex h-full flex-col gap-1.5 overflow-y-auto pr-1">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={!sidebarExpanded ? item.label : undefined}
                      className={cn(
                        "group relative flex items-center rounded-2xl text-sm font-medium transition-all",
                        sidebarExpanded ? "gap-3 px-3 py-3" : "justify-center px-0 py-3",
                        isActive
                          ? "border border-primary/10 bg-primary text-primary-foreground shadow-[0_16px_30px_-20px_rgba(45,116,230,0.8)]"
                          : "border border-transparent text-muted-foreground hover:bg-white/75 hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                          isActive ? "bg-white/18 text-white" : "bg-secondary text-primary",
                        )}
                      >
                        <Icon className="size-4.5" />
                      </span>
                      {sidebarExpanded ? <span className="truncate">{item.label}</span> : null}
                      {!sidebarExpanded ? (
                        <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] top-1/2 z-20 -translate-y-1/2 rounded-xl border border-white/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 opacity-0 shadow-[0_14px_34px_-20px_rgba(35,86,166,0.35)] transition-opacity group-hover:opacity-100">
                          {item.label}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className={cn("rounded-[1.5rem] border border-white/75 bg-white/75 p-3", !sidebarExpanded && "px-2")}>
              <div className={cn("flex items-center gap-3", !sidebarExpanded && "justify-center")}>
                <Avatar size="lg">
                  <AvatarFallback>{userInitials}</AvatarFallback>
                </Avatar>
                {sidebarExpanded ? (
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-900">{me?.user.fullName ?? "CRM Operator"}</div>
                    <div className="truncate text-sm text-muted-foreground">{me?.user.email ?? "No email loaded"}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 rounded-[2.2rem] border border-white/75 bg-white/58 p-4 shadow-[0_28px_90px_-48px_rgba(34,92,191,0.3)] backdrop-blur-xl lg:p-5">
          <div className="grid gap-5">
            <header className="rounded-[1.8rem] border border-white/80 bg-white/78 px-5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-primary/70">
                    {activeMembership?.companyName ?? "CRM SaaS"}
                  </div>
                  <h1 className="mt-1 text-[1.7rem] font-semibold tracking-tight text-slate-900 lg:text-[1.85rem]">{title}</h1>
                  <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                </div>

                <div className="relative self-start">
                  <button
                    type="button"
                    className="flex items-center gap-3 rounded-2xl border border-white/85 bg-secondary/55 px-3 py-2 transition-colors hover:bg-secondary/75"
                    onClick={() => setProfileMenuOpen((current) => !current)}
                  >
                    <Avatar>
                      <AvatarFallback>{userInitials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 text-left">
                      <div className="max-w-40 truncate text-sm font-semibold text-slate-900">{me?.user.fullName ?? "CRM Operator"}</div>
                      <div className="text-xs text-muted-foreground">{activeMembership?.role ?? "member"}</div>
                    </div>
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </button>

                  {profileMenuOpen ? (
                    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-30 min-w-52 rounded-2xl border border-white/80 bg-white/96 p-2 shadow-[0_22px_60px_-30px_rgba(35,86,166,0.38)] backdrop-blur-xl">
                      <Link
                        href="/dashboard/settings"
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 transition-colors hover:bg-secondary/65"
                      >
                        <Settings2 className="size-4 text-primary" />
                        Settings
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
            </header>

            {loading ? <div className="rounded-2xl border border-dashed border-border/80 bg-white/55 px-4 py-3 text-sm text-muted-foreground">Loading workspace...</div> : null}
            {loadError ? <div className="rounded-2xl border border-destructive/15 bg-destructive/5 px-4 py-3 text-sm text-destructive">{loadError}</div> : null}
            {!loading && !loadError ? <div className="grid gap-6">{children}</div> : null}
          </div>
        </section>
      </div>

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
                className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
                onClick={() => setConfirmLogoutOpen(false)}
                aria-label="Close logout confirmation"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <Badge variant="outline">{activeMembership?.companyName ?? "Current workspace"}</Badge>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setConfirmLogoutOpen(false)}>
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
