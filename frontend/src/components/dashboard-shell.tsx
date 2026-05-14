"use client";

import { usePathname } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { resolveDashboardMeta } from "@/components/dashboard-meta";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const meta = resolveDashboardMeta(pathname);

  return (
    <AppShell title={meta.title}>
      {children}
    </AppShell>
  );
}
