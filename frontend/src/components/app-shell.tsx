/* eslint-disable @next/next/no-html-link-for-pages */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { apiRequest, ApiError } from "@/lib/api";
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
  user: {
    id: string;
    email: string | null;
    fullName: string | null;
  };
  memberships: Membership[];
  needsOnboarding: boolean;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", minRole: "member" as CompanyRole },
  { href: "/dashboard/leads", label: "Leads", minRole: "member" as CompanyRole },
  { href: "/dashboard/deals", label: "Deals", minRole: "member" as CompanyRole },
  { href: "/dashboard/customers", label: "Customers", minRole: "member" as CompanyRole },
  { href: "/dashboard/tasks", label: "Tasks", minRole: "member" as CompanyRole },
  { href: "/dashboard/partners", label: "Partners", minRole: "admin" as CompanyRole },
  { href: "/dashboard/campaigns", label: "Campaigns", minRole: "admin" as CompanyRole },
  { href: "/dashboard/settings", label: "Settings", minRole: "admin" as CompanyRole },
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
    return navItems.filter((item) => roleRank[activeRole] >= roleRank[item.minRole]);
  }, [activeMembership?.role]);

  useEffect(() => {
    let disposed = false;

    const loadMe = async () => {
      try {
        const response = await apiRequest<MeResponse>("/auth/me");
        if (disposed) {
          return;
        }

        if (response.needsOnboarding) {
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
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "260px 1fr",
      }}
    >
      <aside
        style={{
          background: "#102031",
          color: "#f5f7fa",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div>
          <div style={{ fontSize: 12, letterSpacing: 1.5, opacity: 0.7 }}>CRM SAAS</div>
          <h2 style={{ margin: "8px 0 0" }}>Workspace</h2>
        </div>
        {me?.memberships && me.memberships.length > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            <label htmlFor="workspace-picker" style={{ fontSize: 12, opacity: 0.8 }}>
              Active company
            </label>
            <select
              id="workspace-picker"
              value={activeMembershipId ?? ""}
              onChange={(event) => handleWorkspaceChange(event.target.value)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.08)",
                color: "white",
              }}
            >
              {me.memberships.map((membership) => (
                <option key={membership.membershipId} value={membership.membershipId} style={{ color: "black" }}>
                  {membership.companyName} ({membership.role})
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <nav style={{ display: "grid", gap: 8 }}>
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                color: "inherit",
                textDecoration: "none",
                background: "rgba(255,255,255,0.06)",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={handleLogout}
          style={{
            marginTop: "auto",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "transparent",
            color: "white",
            padding: "10px 12px",
            borderRadius: 10,
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </aside>
      <section style={{ padding: 28 }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0 }}>{title}</h1>
          <p style={{ margin: "8px 0 0", color: "#556371" }}>{description}</p>
        </header>
        {loading ? <p>Loading workspace...</p> : null}
        {loadError ? <p style={{ color: "#b02020" }}>{loadError}</p> : null}
        {!loading && !loadError ? children : null}
      </section>
    </main>
  );
}
