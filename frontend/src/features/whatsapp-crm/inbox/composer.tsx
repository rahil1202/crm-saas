"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Paperclip, Send, Smile, X } from "lucide-react";
import { toast } from "sonner";

import { ApiError, apiRequest } from "@/lib/api";
import { getFrontendEnv } from "@/lib/env";
import { getCompanyCookie, getStoreCookie } from "@/lib/cookies";
import { cn } from "@/lib/utils";
import type { MessageAttachment } from "@/features/whatsapp-crm/types";

interface ComposerProps {
  conversationId: string;
  disabled?: boolean;
  onSent: () => void;
  onTyping?: (state: "start" | "stop") => void;
}

const QUICK_EMOJIS = ["😊", "👍", "🙏", "❤️", "😂", "🔥", "✅", "👀", "🎉", "💡", "📞", "🤝", "⭐", "💬", "🙌"];

/**
 * WhatsApp-style composer bar with rounded pill input, emoji tray,
 * attachment button, and send/mic toggle.
 */
export function InboxComposer({ conversationId, disabled, onSent, onTyping }: ComposerProps) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachment, setAttachment] = useState<MessageAttachment | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStateRef = useRef<"start" | "stop">("stop");

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  const signalTyping = (state: "start" | "stop") => {
    if (!onTyping) return;
    if (typingStateRef.current === state) return;
    typingStateRef.current = state;
    onTyping(state);
  };

  const handleChange = (next: string) => {
    setValue(next);
    if (next.length > 0) {
      signalTyping("start");
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => signalTyping("stop"), 3500);
    } else {
      signalTyping("stop");
    }
  };

  const resetState = () => {
    setValue("");
    setAttachment(null);
    setCaption("");
    setEmojiOpen(false);
    signalTyping("stop");
  };

  const send = async () => {
    const trimmed = value.trim();
    if (!trimmed && !attachment) return;
    if (sending || disabled) return;
    setSending(true);
    try {
      if (attachment) {
        await apiRequest(`/whatsapp/inbox/${conversationId}/messages/media`, {
          method: "POST",
          body: JSON.stringify({
            attachmentId: attachment.id,
            caption: caption.trim() || trimmed || undefined,
          }),
        });
      } else {
        await apiRequest(`/whatsapp/inbox/${conversationId}/messages/text`, {
          method: "POST",
          body: JSON.stringify({ body: trimmed }),
        });
      }
      resetState();
      onSent();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to send message.");
    } finally {
      setSending(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (file.size > 95 * 1024 * 1024) {
      toast.error("File exceeds the 95 MB WhatsApp media limit.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("conversationId", conversationId);
      const env = getFrontendEnv();
      const response = await fetch(`${env.apiUrl}/api/v1/whatsapp/attachments`, {
        method: "POST",
        credentials: "include",
        headers: {
          ...(getCompanyCookie() ? { "x-company-id": getCompanyCookie()! } : {}),
          ...(getStoreCookie() ? { "x-store-id": getStoreCookie()! } : {}),
        },
        body: form,
      });
      const json = (await response.json()) as { success?: boolean; data?: MessageAttachment; error?: { message?: string } };
      if (!response.ok || !json.success || !json.data) {
        throw new Error(json.error?.message ?? "Unable to upload file.");
      }
      setAttachment(json.data);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to upload file.");
    } finally {
      setUploading(false);
    }
  };

  const hasContent = value.trim().length > 0 || attachment !== null;

  return (
    <div className="border-t border-emerald-200/50 bg-emerald-50/30 px-3 py-2.5">
      {/* Emoji tray */}
      {emojiOpen ? (
        <div className="mb-2 flex flex-wrap gap-1 rounded-xl border border-border/60 bg-white p-2.5 shadow-sm">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="rounded-lg px-2 py-1.5 text-xl transition-transform hover:scale-125 hover:bg-slate-100"
              onClick={() => handleChange(value + emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {/* Attachment preview */}
      {attachment ? (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-2">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Paperclip className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-900">
              {attachment.originalName ?? "Attachment"}
            </div>
            <div className="text-xs text-muted-foreground">
              {attachment.mediaType}
              {attachment.sizeBytes ? ` · ${Math.round(attachment.sizeBytes / 1024)} KB` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setAttachment(null); setCaption(""); }}
            className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-destructive"
            aria-label="Remove attachment"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {/* Input bar */}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file);
            event.target.value = "";
          }}
        />

        {/* Emoji + Attach buttons */}
        <div className="flex shrink-0 items-center gap-0.5 pb-1">
          <button
            type="button"
            onClick={() => setEmojiOpen((prev) => !prev)}
            disabled={disabled}
            className={cn(
              "flex size-9 items-center justify-center rounded-full transition-colors",
              emojiOpen ? "bg-emerald-100 text-emerald-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
            )}
            aria-label="Emoji"
          >
            <Smile className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            className="flex size-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Attach file"
          >
            <Paperclip className="size-5" />
          </button>
        </div>

        {/* Text input (WhatsApp pill shape) */}
        <div className="relative flex-1">
          <textarea
            value={attachment ? caption : value}
            onChange={(event) => (attachment ? setCaption(event.target.value) : handleChange(event.target.value))}
            placeholder={attachment ? "Add a caption…" : "Type a message"}
            rows={1}
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            className={cn(
              "w-full resize-none rounded-3xl border border-slate-200 bg-white px-4 py-2.5 pr-4",
              "text-sm leading-5 text-slate-900 placeholder:text-slate-400",
              "outline-none transition-shadow focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100",
              "max-h-32 min-h-[42px]",
              disabled && "cursor-not-allowed opacity-50",
            )}
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
        </div>

        {/* Send / Mic button */}
        <div className="shrink-0 pb-0.5">
          {hasContent ? (
            <button
              type="button"
              onClick={() => void send()}
              disabled={disabled || sending}
              className={cn(
                "flex size-10 items-center justify-center rounded-full transition-all",
                "bg-emerald-500 text-white shadow-md hover:bg-emerald-600 active:scale-95",
                (disabled || sending) && "opacity-50 cursor-not-allowed",
              )}
              aria-label="Send message"
            >
              <Send className="size-5 -translate-x-[1px]" />
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="flex size-10 items-center justify-center rounded-full text-slate-400"
              aria-label="Voice message (coming soon)"
            >
              <Mic className="size-5" />
            </button>
          )}
        </div>
      </div>

      {uploading ? (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-emerald-700">
          <span className="inline-block size-3 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
          Uploading…
        </div>
      ) : null}
    </div>
  );
}
