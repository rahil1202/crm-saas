"use client";

import { CheckCheck, Pin, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  formatMessageClock,
  initialsFromName,
} from "@/features/whatsapp-crm/format";
import type { ConversationSummary, ConversationTag } from "@/features/whatsapp-crm/types";

interface ConversationListProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (conversation: ConversationSummary) => void;
  loading: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  tagsById: Map<string, ConversationTag>;
  emptyLabel?: string;
}

/**
 * WhatsApp-style conversation sidebar list with avatar, two-line preview,
 * delivery ticks, unread badge, and pin indicator.
 */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
  loading,
  searchQuery,
  onSearchChange,
  onLoadMore,
  hasMore,
  tagsById,
  emptyLabel,
}: ConversationListProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search bar */}
      <div className="px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search or start new chat"
            className="h-9 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm placeholder:text-slate-400 focus:bg-white"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {conversations.length === 0 && !loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">
            {emptyLabel ?? "No conversations match the current filters."}
          </div>
        ) : null}
        <ul>
          {conversations.map((conversation) => {
            const active = conversation.id === activeId;
            const hasUnread = conversation.unreadCount > 0;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => onSelect(conversation)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                    active
                      ? "bg-emerald-50/80 border-l-[3px] border-l-emerald-500"
                      : "border-l-[3px] border-l-transparent hover:bg-slate-50/80",
                  )}
                >
                  {/* Avatar */}
                  <Avatar className="size-12 shrink-0">
                    <AvatarFallback
                      className={cn(
                        "text-sm font-semibold",
                        active ? "bg-emerald-200 text-emerald-800" : "bg-slate-200 text-slate-600",
                      )}
                    >
                      {initialsFromName(conversation.contactName ?? conversation.contactHandle)}
                    </AvatarFallback>
                  </Avatar>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {/* Top row: name + time */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {conversation.pinnedAt ? (
                          <Pin aria-label="Pinned" className="size-3 shrink-0 rotate-45 text-slate-400" />
                        ) : null}
                        <span
                          className={cn(
                            "truncate text-[0.9rem] leading-tight",
                            hasUnread ? "font-bold text-slate-900" : "font-medium text-slate-800",
                          )}
                        >
                          {conversation.contactName ?? conversation.contactHandle}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-[0.68rem]",
                          hasUnread ? "font-semibold text-emerald-600" : "text-slate-400",
                        )}
                      >
                        {formatMessageClock(conversation.lastMessageAt)}
                      </span>
                    </div>

                    {/* Bottom row: preview + unread badge */}
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1">
                        {/* Delivery indicator for last outbound */}
                        {conversation.lastOutboundAt && !hasUnread ? (
                          <LastMessageTick />
                        ) : null}
                        <span
                          className={cn(
                            "truncate text-[0.8rem] leading-tight",
                            hasUnread ? "font-medium text-slate-700" : "text-slate-500",
                          )}
                        >
                          {conversation.latestMessage ?? "No messages yet"}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {conversation.priority !== "normal" ? (
                          <span className={cn("size-2 rounded-full", priorityDot(conversation.priority))} />
                        ) : null}
                        {hasUnread ? (
                          <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-[0.6rem] font-bold text-white">
                            {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Tags row (compact) */}
                    {conversation.tagIds.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {conversation.tagIds.slice(0, 3).map((tagId) => {
                          const tag = tagsById.get(tagId);
                          if (!tag) return null;
                          return (
                            <span
                              key={tag.id}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[0.58rem] font-semibold leading-none",
                                tagColorClass(tag.color),
                              )}
                            >
                              {tag.name}
                            </span>
                          );
                        })}
                        {conversation.tagIds.length > 3 ? (
                          <span className="text-[0.58rem] text-slate-400">+{conversation.tagIds.length - 3}</span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </button>
                {/* Divider */}
                <div className="ml-[4.5rem] border-b border-slate-100" />
              </li>
            );
          })}
        </ul>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <span className="inline-block size-5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
          </div>
        ) : hasMore && onLoadMore ? (
          <div className="px-3 py-3">
            <button
              type="button"
              onClick={onLoadMore}
              className="w-full rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              Load older conversations
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LastMessageTick() {
  return <CheckCheck className="size-3.5 shrink-0 text-sky-500" />;
}

function priorityDot(priority: string): string {
  switch (priority) {
    case "urgent":
      return "bg-rose-500";
    case "high":
      return "bg-amber-500";
    case "low":
      return "bg-slate-300";
    default:
      return "bg-slate-300";
  }
}

export function tagColorClass(color: string): string {
  switch (color.toLowerCase()) {
    case "amber":
      return "bg-amber-100 text-amber-800";
    case "rose":
      return "bg-rose-100 text-rose-700";
    case "sky":
      return "bg-sky-100 text-sky-700";
    case "violet":
      return "bg-violet-100 text-violet-700";
    case "slate":
      return "bg-slate-200 text-slate-700";
    case "emerald":
    default:
      return "bg-emerald-100 text-emerald-700";
  }
}
