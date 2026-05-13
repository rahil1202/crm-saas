"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { COMPANY_TOUR_QUERY, COMPANY_TOUR_START_KEY } from "@/features/onboarding/company-joyride-tour";

export default function CompanyOnboardingTourStartPage() {
  const router = useRouter();

  useEffect(() => {
    window.sessionStorage.setItem(COMPANY_TOUR_START_KEY, String(Date.now()));
    router.replace(`/dashboard?tour=${COMPANY_TOUR_QUERY}`);
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="rounded-2xl border border-sky-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
        Starting your guided tour...
      </div>
    </main>
  );
}
