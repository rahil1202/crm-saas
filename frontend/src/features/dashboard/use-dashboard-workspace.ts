"use client";

import { useCallback, useEffect, useState } from "react";

import { DashboardInsightsResponse, PartnerDashboardResponse } from "@/features/dashboard/types";
import { ApiError, apiRequest } from "@/lib/api";
import { getCompanyCookie } from "@/lib/cookies";
import { loadMe } from "@/lib/me-cache";

type DashboardMode = "company" | "partner";

type DashboardWorkspaceOptions = {
  activityLimit?: number;
  topDealsLimit?: number;
};

export function useDashboardWorkspace({ activityLimit = 10, topDealsLimit = 5 }: DashboardWorkspaceOptions = {}) {
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

      const params = new URLSearchParams({
        periodDays: "30",
        forecastMonths: "6",
        activityLimit: String(activityLimit),
        topDealsLimit: String(topDealsLimit),
      });
      const data = await apiRequest<DashboardInsightsResponse>(`/reports/dashboard?${params.toString()}`);
      setMode("company");
      setCompanyDashboard(data);
      setPartnerDashboard(null);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load dashboard metrics");
    } finally {
      setLoading(false);
    }
  }, [activityLimit, topDealsLimit]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return {
    mode,
    companyDashboard,
    partnerDashboard,
    loading,
    error,
    reload: loadDashboard,
  };
}
