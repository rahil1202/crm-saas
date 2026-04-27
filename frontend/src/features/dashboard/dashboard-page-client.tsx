"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoadingState } from "@/components/ui/page-patterns";
import { useDashboardWorkspace } from "@/features/dashboard/use-dashboard-workspace";

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

export default function DashboardPageClient() {
  const { mode, companyDashboard, partnerDashboard, loading, error } = useDashboardWorkspace();

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
