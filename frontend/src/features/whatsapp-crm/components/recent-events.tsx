import { AlertTriangle, Clock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { eventStatusTone, formatRelativeTime } from "@/features/whatsapp-crm/format";
import type { WhatsappWebhookEventSummary } from "@/features/whatsapp-crm/types";

interface RecentEventsListProps {
  items: WhatsappWebhookEventSummary[];
}

export function RecentEventsList({ items }: RecentEventsListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-white/50 p-4 text-sm text-muted-foreground">
        No webhook events have been received yet. Connect a WhatsApp account and send a test message to see activity here.
      </div>
    );
  }

  return (
    <ul className="grid gap-2">
      {items.map((event) => {
        const tone = eventStatusTone(event.status);
        return (
          <li
            key={event.id}
            className="grid gap-2 rounded-xl border border-border/70 bg-white/70 px-3 py-2.5 text-sm sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-[0.68rem] uppercase">
                  {event.eventType}
                </Badge>
                <Badge variant={tone.variant}>{tone.label}</Badge>
                {event.attempts > 1 ? <span className="text-xs text-muted-foreground">attempt {event.attempts}</span> : null}
              </div>
              <div className="mt-1 truncate font-mono text-[0.72rem] text-slate-700">{event.eventKey}</div>
              {event.lastError ? (
                <div className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span className="truncate">{event.lastError}</span>
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground sm:justify-end">
              <Clock className="size-3.5" />
              {formatRelativeTime(event.receivedAt)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
