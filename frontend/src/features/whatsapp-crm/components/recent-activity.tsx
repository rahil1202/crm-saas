import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/features/whatsapp-crm/format";
import type { WhatsappRecentActivityItem } from "@/features/whatsapp-crm/types";

interface RecentActivityListProps {
  items: WhatsappRecentActivityItem[];
}

export function RecentActivityList({ items }: RecentActivityListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-white/50 p-4 text-sm text-muted-foreground">
        No recent WhatsApp conversations yet.
      </div>
    );
  }

  return (
    <ul className="grid gap-2">
      {items.map((item) => {
        const isInbound = item.direction === "inbound";
        return (
          <li
            key={item.id}
            className="grid gap-2 rounded-xl border border-border/70 bg-white/70 px-3 py-2.5 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-start"
          >
            <span
              aria-hidden
              className={
                isInbound
                  ? "flex size-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"
                  : "flex size-8 items-center justify-center rounded-full bg-sky-50 text-sky-700"
              }
            >
              {isInbound ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-semibold text-slate-900">
                  {item.contactName ?? item.contactHandle}
                </span>
                <span className="truncate text-xs text-muted-foreground">via {item.accountName}</span>
                <Badge variant={item.deliveryStatus === "failed" ? "destructive" : "outline"}>
                  {item.deliveryStatus}
                </Badge>
              </div>
              <div className="mt-0.5 line-clamp-2 text-sm text-slate-700">{item.body ?? "[empty message]"}</div>
            </div>
            <span className="text-xs text-muted-foreground sm:text-right">{formatRelativeTime(item.sentAt)}</span>
          </li>
        );
      })}
    </ul>
  );
}
