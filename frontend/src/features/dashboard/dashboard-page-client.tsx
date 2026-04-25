"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/page-patterns";
import { ApiError, apiRequest } from "@/lib/api";
import { getCompanyCookie } from "@/lib/cookies";
import { loadMe } from "@/lib/me-cache";
import type {
  DashboardInsightsResponse,
  PartnerDashboardResponse,
} from "@/features/dashboard/types";

const CompanyDashboardSections = dynamic(
  () => import("@/features/dashboard/company-dashboard-sections").then((mod) => mod.CompanyDashboardSections),
  {
    loading: () => <LoadingState label="Loading dashboard workspace..." />,
  },
);

const PartnerDashboardSections = dynamic(
  () => import("@/features/dashboard/partner-dashboard-sections").then((mod) => mod.PartnerDashboardSections),
  {
    loading: () => <LoadingState label="Loading partner workspace..." />,
  },
);

type DashboardMode = "company" | "partner";

export default function DashboardPageClient() {
  const [mode, setMode] = useState<DashboardMode>("company");
  const [companyDashboard, setCompanyDashboard] = useState<DashboardInsightsResponse | null>(null);
  const [partnerDashboard, setPartnerDashboard] = useState<PartnerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const me = await loadMe();
      const companyId = getCompanyCookie();
      const activeMembership =
        me.memberships.find((membership) => membership.companyId === companyId) ??
        me.memberships[0] ??
        null;

      if (activeMembership?.isPartnerAccess) {
        const data = await apiRequest<PartnerDashboardResponse>("/partners/me/dashboard");
        setMode("partner");
        setPartnerDashboard(data);
        setCompanyDashboard(null);
        return;
      }

      const data = await apiRequest<DashboardInsightsResponse>("/reports/dashboard?periodDays=30&forecastMonths=6&activityLimit=10");
      setMode("company");
      setCompanyDashboard(data);
      setPartnerDashboard(null);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load dashboard metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const content = useMemo(() => {
    if (loading) {
      return <LoadingState label="Loading dashboard metrics..." />;
    }

    if (mode === "partner" && partnerDashboard) {
      return <PartnerDashboardSections data={partnerDashboard} />;
    }

    if (companyDashboard) {
      return <CompanyDashboardSections data={companyDashboard} />;
    }

    return null;
  }, [companyDashboard, loading, mode, partnerDashboard]);

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Dashboard request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {content}
    </div>
  );
}
