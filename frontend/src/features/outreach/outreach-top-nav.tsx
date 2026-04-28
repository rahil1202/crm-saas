"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard/outreach", label: "Dashboard" },
  { href: "/dashboard/outreach/leads", label: "Leads" },
  { href: "/dashboard/outreach/add-lead", label: "Add Lead" },
  { href: "/dashboard/outreach/templates", label: "Email Templates" },
  { href: "/dashboard/outreach/settings", label: "Settings" },
];

export function OutreachTopNav() {
  const pathname = usePathname();

  return (
    <div className="rounded-2xl border border-border/70 bg-white p-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition",
                active ? "bg-slate-900 text-white" : "hover:bg-slate-100",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
