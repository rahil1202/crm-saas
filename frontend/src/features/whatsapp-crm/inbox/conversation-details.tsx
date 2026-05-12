"use client";

import { useMemo, useState } from "react";
import {
  Archive,
  CheckCheck,
  CircleUser,
  Flag,
  Pin,
  PinOff,
  ShieldCheck,
  StickyNote,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { formatDateTime, formatPhone, formatRelativeTime, initialsFromName } from "@/features/whatsapp-crm/format";
import { tagColorClass } from "@/features/whatsapp-crm/inbox/conversation-list";
import type {
  ConversationNote,
  ConversationSummary,
  ConversationTag,
} from "@/features/whatsapp-crm/types";

interface ConversationDetailsProps {
  conversation: ConversationSummary;
  notes: ConversationNote[];
  tags: ConversationTag[];
  teamMembers: Array<{ userId: string; fullName: string | null; email: string }>;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onAddNote: (note: string) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  currentUserId: string;
}

export function ConversationDetails({
  conversation,
  notes,
  tags,
  teamMembers,
  onPatch,
  onAddNote,
  onDeleteNote,
  currentUserId,
}: ConversationDetailsProps) {
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const assignedLabel = conversation.assignedToName ?? (conversation.assignedToUserId ? "Assigned" : "Unassigned");

  const togglePin = () => onPatch({ pinned: !conversation.pinnedAt });
  const toggleArchive = () => onPatch({ archived: !conversation.archivedAt });

  const handleAddNote = async () => {
    const trimmed = noteDraft.trim();
    if (!trimmed) return;
    setSavingNote(true);
    try {
      await onAddNote(trimmed);
      setNoteDraft("");
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : "Unable to save note.");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <aside className="flex h-full min-h-0 w-full max-w-sm flex-col border-l border-border/60 bg-white/95">
      <div className="border-b border-border/60 p-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            <AvatarFallback className="bg-emerald-100 text-emerald-800">
              {initialsFromName(conversation.contactName ?? conversation.contactHandle)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-900">
              {conversation.contactName ?? formatPhone(conversation.contactHandle)}
            </div>
            <div className="truncate text-xs text-muted-foreground">{formatPhone(conversation.contactHandle)}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={conversation.pinnedAt ? "secondary" : "outline"}
            size="sm"
            onClick={() => void togglePin()}
          >
            {conversation.pinnedAt ? <PinOff className="mr-1.5 size-3.5" /> : <Pin className="mr-1.5 size-3.5" />}
            {conversation.pinnedAt ? "Unpin" : "Pin"}
          </Button>
          <Button
            type="button"
            variant={conversation.archivedAt ? "secondary" : "outline"}
            size="sm"
            onClick={() => void toggleArchive()}
          >
            <Archive className="mr-1.5 size-3.5" />
            {conversation.archivedAt ? "Unarchive" : "Archive"}
          </Button>
          <Button
            type="button"
            variant={conversation.status === "closed" ? "secondary" : "outline"}
            size="sm"
            onClick={() => void onPatch({ status: conversation.status === "closed" ? "open" : "closed" })}
          >
            <CheckCheck className="mr-1.5 size-3.5" />
            {conversation.status === "closed" ? "Reopen" : "Resolve"}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
        <section className="grid gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Assignment</h3>
          <Field>
            <FieldLabel>
              <CircleUser className="mr-1.5 inline size-3.5" />
              Agent
            </FieldLabel>
            <NativeSelect
              value={conversation.assignedToUserId ?? ""}
              onChange={(event) => void onPatch({ assignedToUserId: event.target.value || null })}
            >
              <option value="">Unassigned</option>
              {teamMembers.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.fullName ?? member.email}
                </option>
              ))}
            </NativeSelect>
            <FieldDescription>Currently: {assignedLabel}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>
              <Flag className="mr-1.5 inline size-3.5" />
              Priority
            </FieldLabel>
            <NativeSelect
              value={conversation.priority}
              onChange={(event) => void onPatch({ priority: event.target.value })}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel>
              <ShieldCheck className="mr-1.5 inline size-3.5" />
              Takeover
            </FieldLabel>
            <NativeSelect
              value={conversation.humanTakeoverEnabled ? "human" : "bot"}
              onChange={(event) => void onPatch({ humanTakeoverEnabled: event.target.value === "human" })}
            >
              <option value="bot">Bot active</option>
              <option value="human">Human handling</option>
            </NativeSelect>
          </Field>
        </section>

        <section className="grid gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {tags.length === 0 ? (
              <span className="text-xs text-muted-foreground">Create tags in Inbox settings.</span>
            ) : (
              tags.map((tag) => {
                const selected = conversation.tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      const next = selected
                        ? conversation.tagIds.filter((id) => id !== tag.id)
                        : [...conversation.tagIds, tag.id];
                      void onPatch({ tagIds: next });
                    }}
                    className={
                      selected
                        ? `rounded-full px-2.5 py-1 text-[0.68rem] font-semibold ${tagColorClass(tag.color)}`
                        : "rounded-full border border-border/60 bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-slate-600 hover:bg-slate-50"
                    }
                  >
                    {tag.name}
                  </button>
                );
              })
            )}
          </div>
          {conversation.tagIds.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {conversation.tagIds.map((tagId) => {
                const tag = tagsById.get(tagId);
                if (!tag) return null;
                return (
                  <Badge key={tagId} variant="outline" className={tagColorClass(tag.color)}>
                    {tag.name}
                  </Badge>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="grid gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <StickyNote className="mr-1.5 inline size-3.5" />
              Internal notes
            </h3>
            <span className="text-xs text-muted-foreground">{notes.length}</span>
          </div>
          <Textarea
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="Write a private note. Use @ to mention teammates."
            rows={2}
            className="min-h-[60px]"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => void handleAddNote()}
              disabled={savingNote || !noteDraft.trim()}
            >
              {savingNote ? "Saving…" : "Post note"}
            </Button>
          </div>
          <ul className="grid gap-2">
            {notes.length === 0 ? (
              <li className="rounded-lg border border-dashed border-border/60 bg-white/50 p-3 text-xs text-muted-foreground">
                No notes yet. Notes are visible only to your team.
              </li>
            ) : null}
            {notes.map((note) => (
              <li key={note.id} className="rounded-xl border border-amber-200/70 bg-amber-50/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-xs font-semibold text-amber-900">
                    {note.authorName ?? note.authorEmail ?? "Teammate"}
                  </div>
                  <div className="flex items-center gap-1 text-[0.62rem] text-muted-foreground">
                    <span>{formatRelativeTime(note.createdAt)}</span>
                    {note.authorId === currentUserId ? (
                      <button
                        type="button"
                        onClick={() => void onDeleteNote(note.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Delete note"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{note.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Metadata</h3>
          <Alert>
            <AlertDescription className="text-xs">
              Last message {formatRelativeTime(conversation.lastMessageAt)}.
              {conversation.resolvedAt ? ` Resolved ${formatRelativeTime(conversation.resolvedAt)}.` : null}
              {conversation.lastOutboundAt ? ` Last outbound ${formatDateTime(conversation.lastOutboundAt)}.` : null}
            </AlertDescription>
          </Alert>
        </section>
      </div>
    </aside>
  );
}
