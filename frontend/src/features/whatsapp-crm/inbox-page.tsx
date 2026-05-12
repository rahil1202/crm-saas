"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Filter, Inbox, MessageSquareShare, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError, apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import { getCachedMe, loadMe } from "@/lib/me-cache";
import { InboxComposer } from "@/features/whatsapp-crm/inbox/composer";
import { ConversationDetails } from "@/features/whatsapp-crm/inbox/conversation-details";
import { ConversationList } from "@/features/whatsapp-crm/inbox/conversation-list";
import { DateSeparator, MessageBubble } from "@/features/whatsapp-crm/inbox/message-bubble";
import { initialsFromName } from "@/features/whatsapp-crm/format";
import { useRealtimeInbox } from "@/features/whatsapp-crm/use-realtime-inbox";
import type {
  ConversationMessage,
  ConversationNote,
  ConversationSummary,
  ConversationTag,
  RealtimeInboxEvent,
} from "@/features/whatsapp-crm/types";

type FilterTab = "all" | "unassigned" | "mine" | "archived";

interface TeamMember {
  userId: string;
  fullName: string | null;
  email: string;
}

export function WhatsappInboxPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [tags, setTags] = useState<ConversationTag[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [typingPresence, setTypingPresence] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeId) ?? null,
    [conversations, activeId],
  );

  useEffect(() => {
    const cached = getCachedMe();
    if (cached) {
      setCurrentUserId(cached.user.id);
    }
    void loadMe()
      .then((me) => setCurrentUserId(me.user.id))
      .catch(() => {
        /* auth failure handled elsewhere */
      });
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setSearchDebounced(searchQuery.trim()), 200);
    return () => clearTimeout(id);
  }, [searchQuery]);

  const loadInbox = useCallback(
    async (opts: { cursor?: string | null; append?: boolean } = {}) => {
      setInboxLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "30");
        if (opts.cursor) params.set("cursor", opts.cursor);
        if (priorityFilter) params.set("priority", priorityFilter);
        if (searchDebounced) params.set("search", searchDebounced);

        if (filterTab === "unassigned") {
          params.set("unassigned", "true");
        } else if (filterTab === "mine") {
          params.set("assignedToMe", "true");
        } else if (filterTab === "archived") {
          params.set("archived", "true");
        } else {
          params.set("archived", "false");
        }

        const payload = await apiRequest<{ items: ConversationSummary[]; nextCursor: string | null }>(
          `/whatsapp/inbox?${params.toString()}`,
          { skipCache: true },
        );
        setConversations((current) => (opts.append ? [...current, ...payload.items] : payload.items));
        setNextCursor(payload.nextCursor);
        setError(null);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : "Unable to load inbox.");
      } finally {
        setInboxLoading(false);
      }
    },
    [filterTab, priorityFilter, searchDebounced],
  );

  const loadMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    try {
      const [messagesPayload, notesPayload] = await Promise.all([
        apiRequest<{ items: ConversationMessage[]; hasMore: boolean; nextBefore: string | null }>(
          `/whatsapp/inbox/${conversationId}/messages?limit=60`,
          { skipCache: true },
        ),
        apiRequest<{ items: ConversationNote[] }>(`/whatsapp/inbox/${conversationId}/notes`, { skipCache: true }),
      ]);
      setMessages(messagesPayload.items);
      setNotes(notesPayload.items);
      // fire-and-forget read marker
      void apiRequest(`/whatsapp/inbox/${conversationId}/read`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to load conversation.");
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setNotes([]);
      return;
    }
    void loadMessages(activeId);
  }, [activeId, loadMessages]);

  useEffect(() => {
    (async () => {
      try {
        const [tagsPayload, membersPayload] = await Promise.all([
          apiRequest<{ items: ConversationTag[] }>("/whatsapp/tags"),
          apiRequest<{ items: TeamMember[] }>("/users/current-company"),
        ]);
        setTags(tagsPayload.items);
        setTeamMembers(membersPayload.items);
      } catch (caught) {
        // The members endpoint may be gated by module access for non-admins;
        // swallow errors so the inbox still loads.
        console.warn("Unable to bootstrap inbox settings", caught);
      }
    })();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length, activeId]);

  const realtimeHandler = useCallback(
    (event: RealtimeInboxEvent) => {
      if (event.type === "message.created") {
        if (event.conversationId === activeId) {
          void loadMessages(activeId!);
        }
        void loadInbox();
      } else if (event.type === "message.status") {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.messageId
              ? { ...message, deliveryStatus: event.status ?? message.deliveryStatus }
              : message,
          ),
        );
      } else if (event.type === "conversation.updated" || event.type === "conversation.assigned") {
        void loadInbox();
        if (event.conversationId === activeId) {
          void loadMessages(activeId!);
        }
      } else if (event.type === "conversation.note" && event.conversationId === activeId) {
        void loadMessages(activeId!);
      } else if (event.type === "conversation.typing" && event.conversationId === activeId) {
        const userId = typeof event.userId === "string" ? event.userId : null;
        if (userId && userId !== currentUserId) {
          setTypingPresence((current) => ({
            ...current,
            [activeId!]: event.state === "start" ? userId : null,
          }));
        }
      }
    },
    [activeId, currentUserId, loadInbox, loadMessages],
  );

  useRealtimeInbox(realtimeHandler);

  const handleSelect = (conversation: ConversationSummary) => {
    setActiveId(conversation.id);
  };

  const handlePatch = async (patch: Record<string, unknown>) => {
    if (!activeConversation) return;
    try {
      await apiRequest(`/whatsapp/inbox/${activeConversation.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await loadInbox();
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to update conversation.");
    }
  };

  const handleAddNote = async (noteBody: string) => {
    if (!activeConversation) return;
    await apiRequest(`/whatsapp/inbox/${activeConversation.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ body: noteBody }),
    });
    const notesPayload = await apiRequest<{ items: ConversationNote[] }>(
      `/whatsapp/inbox/${activeConversation.id}/notes`,
      { skipCache: true },
    );
    setNotes(notesPayload.items);
  };

  const handleDeleteNote = async (noteId: string) => {
    await apiRequest(`/whatsapp/inbox/notes/${noteId}`, { method: "DELETE" });
    setNotes((current) => current.filter((note) => note.id !== noteId));
  };

  const handleTyping = useCallback(
    (state: "start" | "stop") => {
      if (!activeId) return;
      void apiRequest(`/whatsapp/inbox/${activeId}/typing`, {
        method: "POST",
        body: JSON.stringify({ state }),
      }).catch(() => {
        /* typing is best-effort */
      });
    },
    [activeId],
  );

  const typingUserId = activeId ? typingPresence[activeId] : null;
  const typingMember = typingUserId ? teamMembers.find((member) => member.userId === typingUserId) : null;

  return (
    <div className="grid h-[calc(100vh-168px)] grid-cols-1 overflow-hidden rounded-[1.6rem] border border-border/60 bg-white/70 shadow-sm lg:grid-cols-[300px_minmax(0,1fr)_320px]">
      <aside className="flex min-h-0 flex-col border-r border-border/60 bg-white/90">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Inbox className="size-4 text-emerald-600" />
            Inbox
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              void loadInbox();
              if (activeId) void loadMessages(activeId);
            }}
            aria-label="Refresh"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1">
          {([
            { id: "all", label: "All" },
            { id: "unassigned", label: "Unassigned" },
            { id: "mine", label: "Mine" },
            { id: "archived", label: "Archived" },
          ] as Array<{ id: FilterTab; label: string }>).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                filterTab === tab.id ? "bg-emerald-100 text-emerald-800" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <Filter className="size-3.5 text-muted-foreground" />
          <NativeSelect
            value={priorityFilter}
            onChange={(event) => setPriorityFilter(event.target.value)}
            className="h-8 text-xs"
          >
            <option value="">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </NativeSelect>
        </div>
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelect}
          loading={inboxLoading}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          hasMore={Boolean(nextCursor)}
          onLoadMore={() => void loadInbox({ cursor: nextCursor ?? undefined, append: true })}
          tagsById={tagsById}
          emptyLabel={
            filterTab === "archived"
              ? "No archived conversations."
              : filterTab === "unassigned"
                ? "All conversations are assigned."
                : undefined
          }
        />
      </aside>

      <section className="flex min-h-0 flex-col">
        {error ? (
          <Alert variant="destructive" className="m-3">
            <AlertTitle>Inbox error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!activeConversation ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-emerald-50/30 p-8 text-center">
            <div className="flex size-20 items-center justify-center rounded-full bg-emerald-100">
              <MessageSquareShare className="size-10 text-emerald-500" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-700">WhatsApp CRM Inbox</div>
              <div className="mt-1 text-sm text-slate-400">Select a conversation to start messaging</div>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header — WhatsApp style */}
            <header className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50/50 px-4 py-2.5">
              <Avatar className="size-10 shrink-0">
                <AvatarFallback className="bg-emerald-200 text-emerald-800 text-sm font-semibold">
                  {initialsFromName(activeConversation.contactName ?? activeConversation.contactHandle)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {activeConversation.contactName ?? activeConversation.contactHandle}
                </div>
                <div className="truncate text-xs text-emerald-700/70">
                  {activeConversation.status === "closed" ? "Resolved" : "Online"} · {activeConversation.contactHandle}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeConversation.archivedAt ? (
                  <Badge variant="outline" className="border-slate-200 text-slate-500">
                    <Archive className="mr-1 size-3" /> Archived
                  </Badge>
                ) : null}
                <Badge
                  variant={activeConversation.status === "closed" ? "secondary" : "outline"}
                  className={activeConversation.status === "open" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}
                >
                  {activeConversation.status}
                </Badge>
              </div>
            </header>

            {/* Chat messages area — WhatsApp doodle background */}
            <div
              className="flex-1 overflow-y-auto"
              style={{
                backgroundColor: "#efeae2",
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cfc6' fill-opacity='0.25'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            >
              <div className="mx-auto flex max-w-3xl flex-col gap-1 px-4 py-4">
                {messagesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <span className="inline-block size-6 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
                  </div>
                ) : null}
                {messages.map((message, index) => {
                  const prev = messages[index - 1];
                  const showDateSep = shouldShowDateSeparator(prev?.sentAt, message.sentAt);
                  const showTail = !prev || prev.direction !== message.direction || showDateSep;
                  return (
                    <div key={message.id}>
                      {showDateSep ? <DateSeparator label={getDateLabel(message.sentAt)} /> : null}
                      <MessageBubble message={message} showTail={showTail} />
                    </div>
                  );
                })}
                {typingMember ? (
                  <div className="flex items-center gap-2 px-2 py-1">
                    <div className="flex gap-1">
                      <span className="size-2 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                      <span className="size-2 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                      <span className="size-2 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                    </div>
                    <span className="text-xs text-slate-500">
                      {typingMember.fullName ?? typingMember.email} is typing
                    </span>
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Composer */}
            <InboxComposer
              conversationId={activeConversation.id}
              disabled={activeConversation.status === "closed"}
              onSent={() => {
                if (activeId) {
                  void loadMessages(activeId);
                }
                void loadInbox();
              }}
              onTyping={handleTyping}
            />
          </>
        )}
      </section>

      {activeConversation ? (
        <ConversationDetails
          conversation={activeConversation}
          notes={notes}
          tags={tags}
          teamMembers={teamMembers}
          onPatch={handlePatch}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
          currentUserId={currentUserId ?? ""}
        />
      ) : (
        <aside className="hidden border-l border-border/60 bg-white/90 p-4 text-sm text-muted-foreground lg:block">
          Select a conversation to see agent assignment, tags, priority, and internal notes.
        </aside>
      )}
    </div>
  );
}


function shouldShowDateSeparator(prevSentAt: string | undefined, currentSentAt: string): boolean {
  if (!prevSentAt) return true;
  const prev = new Date(prevSentAt);
  const current = new Date(currentSentAt);
  return prev.toDateString() !== current.toDateString();
}

function getDateLabel(sentAt: string): string {
  const date = new Date(sentAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (messageDay.getTime() === today.getTime()) return "Today";
  if (messageDay.getTime() === yesterday.getTime()) return "Yesterday";

  const diffDays = Math.floor((today.getTime() - messageDay.getTime()) / 86_400_000);
  if (diffDays < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}
