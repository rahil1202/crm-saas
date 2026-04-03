/* eslint-disable @next/next/no-html-link-for-pages */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

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
  { href: "/dashboard", label: "Dashboard", minRole: "member" as CompanyRole },
  { href: "/dashboard/leads", label: "Leads", minRole: "member" as CompanyRole },
  { href: "/dashboard/deals", label: "Deals", minRole: "member" as CompanyRole },
  { href: "/dashboard/customers", label: "Customers", minRole: "member" as CompanyRole },
  { href: "/dashboard/documents", label: "Files", minRole: "member" as CompanyRole },
  { href: "/dashboard/tasks", label: "Tasks", minRole: "member" as CompanyRole },
  { href: "/dashboard/partners", label: "Partners", minRole: "admin" as CompanyRole },
  { href: "/dashboard/campaigns", label: "Campaigns", minRole: "admin" as CompanyRole },
  { href: "/dashboard/automation", label: "Automation", minRole: "admin" as CompanyRole },
  { href: "/dashboard/chatbot-flows", label: "Chatbot Flows", minRole: "admin" as CompanyRole },
  { href: "/dashboard/reports", label: "Reports", minRole: "admin" as CompanyRole },
  { href: "/dashboard/social", label: "Social", minRole: "admin" as CompanyRole },
  { href: "/dashboard/notifications", label: "Notifications", minRole: "admin" as CompanyRole },
  { href: "/dashboard/settings", label: "Settings", minRole: "admin" as CompanyRole },
  { href: "/dashboard/company-admin", label: "Company Admin", minRole: "admin" as CompanyRole },
  { href: "/dashboard/super-admin", label: "Super Admin", minRole: "member" as CompanyRole, superAdminOnly: true },
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
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [activeMembershipId, setActiveMembershipId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-5 border-b border-border/70 bg-slate-950 px-6 py-6 text-slate-100 lg:min-h-screen lg:border-b-0 lg:border-r lg:px-5">
        <div className="grid gap-1">
          <div className="text-xs tracking-[0.18em] text-slate-300">CRM SAAS</div>
          <h2 className="text-xl font-semibold tracking-tight">Workspace</h2>
        </div>

        {me?.memberships && me.memberships.length > 0 ? (
          <div className="grid gap-2">
            <label htmlFor="workspace-picker" className="text-xs text-slate-300">
              Active company
            </label>
            <NativeSelect
              id="workspace-picker"
              value={activeMembershipId ?? ""}
              onChange={(event) => handleWorkspaceChange(event.target.value)}
              className="border-white/15 bg-white/10 text-slate-100"
            >
              {me.memberships.map((membership) => (
                <option key={membership.membershipId} value={membership.membershipId} className="text-foreground">
                  {membership.companyName} ({membership.role})
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}

        <nav className="grid gap-2">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-sm font-medium text-inherit transition-colors hover:bg-white/10"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Button type="button" variant="outline" className="mt-auto border-white/20 bg-transparent text-slate-100 hover:bg-white/10 hover:text-slate-100" onClick={handleLogout}>
          Logout
        </Button>
      </aside>

      <section className="px-6 py-7 lg:px-8">
        <header className="mb-6 grid gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </header>
        {loading ? <p className="text-sm text-muted-foreground">Loading workspace...</p> : null}
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        {!loading && !loadError ? children : null}
      </section>
    </main>
  );
}
