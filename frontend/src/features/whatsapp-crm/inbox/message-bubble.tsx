"use client";

import { AlertTriangle, Check, CheckCheck, Clock, FileText } from "lucide-react";

import { buildApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { deliveryLabel, formatMessageClock } from "@/features/whatsapp-crm/format";
import type { ConversationMessage } from "@/features/whatsapp-crm/types";

interface MessageBubbleProps {
  message: ConversationMessage;
  showTail?: boolean;
}

/**
 * WhatsApp-style message bubble with tail notch, delivery ticks,
 * and media rendering. Uses the SaaS emerald/sky theme.
 */
export function MessageBubble({ message, showTail = true }: MessageBubbleProps) {
  const outbound = message.direction === "outbound";
  const hasMedia = message.attachments.length > 0;

  return (
    <div className={cn("flex w-full px-2", outbound ? "justify-end" : "justify-start")}>
      <div className="relative max-w-[75%] sm:max-w-[65%]">
        {/* Tail notch */}
        {showTail ? (
          <span
            aria-hidden
            className={cn(
              "absolute top-0 size-3",
              outbound
                ? "-right-1.5 border-l-[6px] border-t-[6px] border-l-transparent border-t-emerald-100"
                : "-left-1.5 border-r-[6px] border-t-[6px] border-r-transparent border-t-white",
            )}
          />
        ) : null}

        <div
          className={cn(
            "relative overflow-hidden rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.08)]",
            outbound
              ? "rounded-tr-none bg-emerald-100 text-slate-900"
              : "rounded-tl-none bg-white text-slate-900",
          )}
        >
          {/* Media attachments */}
          {hasMedia ? (
            <div className="grid gap-0.5">
              {message.attachments.map((attachment) => {
                const url = buildApiUrl(`/whatsapp/attachments/${attachment.id}/content`);
                if (attachment.mediaType === "image" || attachment.mediaType === "sticker") {
                  return (
                    <a key={attachment.id} href={url} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={attachment.originalName ?? "Image"}
                        className="block max-h-72 w-full object-cover"
                        loading="lazy"
                      />
                    </a>
                  );
                }
                if (attachment.mediaType === "video") {
                  return (
                    <video
                      key={attachment.id}
                      src={url}
                      controls
                      preload="metadata"
                      className="max-h-72 w-full bg-black"
                    />
                  );
                }
                if (attachment.mediaType === "audio") {
                  return (
                    <div key={attachment.id} className="px-3 pt-2">
                      <audio src={url} controls className="w-full h-10" />
                    </div>
                  );
                }
                // Document
                return (
                  <a
                    key={attachment.id}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "mx-2 mt-2 flex items-center gap-2.5 rounded-lg px-3 py-2.5",
                      outbound ? "bg-emerald-200/60" : "bg-slate-100",
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white">
                      <FileText className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-slate-900">
                        {attachment.originalName ?? "Document"}
                      </div>
                      {attachment.sizeBytes ? (
                        <div className="text-[0.62rem] text-muted-foreground">
                          {formatFileSize(attachment.sizeBytes)}
                        </div>
                      ) : null}
                    </div>
                  </a>
                );
              })}
            </div>
          ) : null}

          {/* Text body */}
          {message.body ? (
            <div className={cn("px-2.5 pt-1.5 pb-1", hasMedia ? "pt-1" : "")}>
              <p className="whitespace-pre-wrap break-words text-[0.84rem] leading-[1.35rem]">
                {message.body}
              </p>
            </div>
          ) : null}

          {/* Timestamp + delivery ticks (WhatsApp-style bottom-right) */}
          <div
            className={cn(
              "flex items-center justify-end gap-1 px-2 pb-1.5",
              !message.body && hasMedia ? "absolute bottom-1 right-1 rounded-full bg-black/40 px-2 py-0.5" : "",
            )}
          >
            <span
              className={cn(
                "text-[0.62rem] leading-none",
                !message.body && hasMedia ? "text-white/90" : "text-slate-500",
              )}
            >
              {formatMessageClock(message.sentAt)}
            </span>
            {outbound ? (
              <DeliveryTick
                status={message.deliveryStatus}
                light={!message.body && hasMedia}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Date separator between message groups (like WhatsApp's "TODAY", "YESTERDAY").
 */
export function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-3">
      <span className="rounded-lg bg-white/90 px-3 py-1 text-[0.68rem] font-medium uppercase tracking-wide text-slate-500 shadow-sm">
        {label}
      </span>
    </div>
  );
}

function DeliveryTick({ status, light }: { status: string; light?: boolean }) {
  const normalized = status.toLowerCase();
  const baseClass = light ? "text-white/90" : "";

  if (normalized === "failed") {
    return <AlertTriangle className={cn("size-3.5 text-rose-500", baseClass)} aria-label={deliveryLabel(status)} />;
  }
  if (normalized === "queued" || normalized === "sending") {
    return <Clock className={cn("size-3 text-slate-400", baseClass)} aria-label={deliveryLabel(status)} />;
  }
  if (normalized === "read") {
    return <CheckCheck className={cn("size-3.5 text-sky-500", baseClass)} aria-label="Read" />;
  }
  if (normalized === "delivered") {
    return <CheckCheck className={cn("size-3.5 text-slate-400", baseClass)} aria-label="Delivered" />;
  }
  return <Check className={cn("size-3 text-slate-400", baseClass)} aria-label="Sent" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
