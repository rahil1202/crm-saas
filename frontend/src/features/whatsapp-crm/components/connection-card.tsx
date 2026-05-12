"use client";

import { CheckCircle2, Phone, Shield, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { connectionStatusTone, formatRelativeTime } from "@/features/whatsapp-crm/format";
import type { WhatsappConnectionSummary } from "@/features/whatsapp-crm/types";

interface ConnectionCardProps {
  connection: WhatsappConnectionSummary;
  onSync?: (connection: WhatsappConnectionSummary) => void;
  onDisconnect?: (connection: WhatsappConnectionSummary) => void;
  onReconnect?: (connection: WhatsappConnectionSummary) => void;
  syncing?: boolean;
  disconnecting?: boolean;
}

export function WhatsappConnectionCard({
  connection,
  onSync,
  onDisconnect,
  onReconnect,
  syncing,
  disconnecting,
}: ConnectionCardProps) {
  const tone = connectionStatusTone(connection.status);
  const displayNumber = connection.displayPhoneNumber ?? connection.phoneNumberId;

  return (
    <Card className="border-border/70 bg-card/95">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Phone className="size-5" />
            </span>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{connection.name}</CardTitle>
              <CardDescription className="truncate">{displayNumber}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={tone.variant}>{tone.label}</Badge>
            {connection.isVerified ? (
              <Badge variant="outline">
                <Shield className="mr-1 size-3" />
                Webhook verified
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Phone number ID</dt>
            <dd className="font-mono text-xs text-slate-800 break-all">{connection.phoneNumberId}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Business account</dt>
            <dd className="font-mono text-xs text-slate-800 break-all">{connection.businessAccountId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Quality rating</dt>
            <dd className="text-slate-800">{connection.qualityRating ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Messaging limit</dt>
            <dd className="text-slate-800">{connection.messagingLimit ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Phone status</dt>
            <dd className="text-slate-800">{connection.phoneRegistrationStatus ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Last synced</dt>
            <dd className="text-slate-800">{formatRelativeTime(connection.lastMetaSyncAt ?? connection.updatedAt)}</dd>
          </div>
        </dl>

        {connection.webhookKey ? (
          <div className="rounded-xl border border-border/70 bg-white/70 p-3 text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              Webhook route
            </div>
            <code className="mt-1 block break-all text-slate-800">
              /api/v1/public/whatsapp/webhook/{connection.webhookKey}
            </code>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {onSync ? (
            <Button variant="outline" size="sm" onClick={() => onSync(connection)} disabled={syncing}>
              <Sparkles className="mr-2 size-3.5" />
              {syncing ? "Syncing…" : "Sync with Meta"}
            </Button>
          ) : null}
          {onReconnect && connection.status !== "ready" ? (
            <Button variant="outline" size="sm" onClick={() => onReconnect(connection)}>
              Reconnect
            </Button>
          ) : null}
          {onDisconnect ? (
            <Button variant="ghost" size="sm" onClick={() => onDisconnect(connection)} disabled={disconnecting}>
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
