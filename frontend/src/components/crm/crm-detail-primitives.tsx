"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function CrmDetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

export function CrmDetailItem({ label, value, subtle }: { label: string; value: ReactNode; subtle?: boolean }) {
  return (
    <div className="grid gap-1">
      <div className="text-[0.8rem] font-medium text-slate-500">{label}</div>
      <div className={cn("text-[0.95rem] text-slate-900", subtle && "text-slate-400")}>{value}</div>
    </div>
  );
}
