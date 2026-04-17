"use client";

import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-2xl border border-slate-400 bg-white/90 px-4 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition-[border-color,box-shadow,background-color] focus-visible:border-slate-950 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-slate-950/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-input/30 dark:focus-visible:border-white dark:focus-visible:ring-white/15",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
