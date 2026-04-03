"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest } from "@/lib/api";

type SocialPlatform = "instagram" | "facebook" | "whatsapp" | "linkedin";
type SocialConversationStatus = "open" | "assigned" | "closed";

interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  accountName: string;
  handle: string;
  status: "connected" | "disconnected";
  accessMode: string;
}

interface SocialConversation {
  id: string;
  socialAccountId: string;
  leadId: string | null;
  assignedToUserId: string | null;
  platform: SocialPlatform;
  contactName: string | null;
  contactHandle: string;
  status: SocialConversationStatus;
  subject: string | null;
  latestMessage: string | null;
  unreadCount: number;
  lastMessageAt: string;
  accountName: string;
  accountHandle: string;
  leadTitle: string | null;
}

interface SocialMessage {
  id: string;
  direction: "inbound" | "outbound";
  senderName: string | null;
  body: string;
  sentAt: string;
}

interface Member {
  membershipId: string;
  userId: string;
  role: string;
  status: string;
  email: string;
  fullName: string | null;
}

const platforms: SocialPlatform[] = ["instagram", "facebook", "whatsapp", "linkedin"];

export default function SocialPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [conversations, setConversations] = useState<SocialConversation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accountPlatform, setAccountPlatform] = useState<SocialPlatform>("instagram");
  const [accountName, setAccountName] = useState("");
  const [accountHandle, setAccountHandle] = useState("");

  const [captureAccountId, setCaptureAccountId] = useState("");
  const [captureContactName, setCaptureContactName] = useState("");
  const [captureContactHandle, setCaptureContactHandle] = useState("");
  const [captureSubject, setCaptureSubject] = useState("");
  const [captureMessage, setCaptureMessage] = useState("");
  const [captureAssignedTo, setCaptureAssignedTo] = useState("");

  const [inboxStatusFilter, setInboxStatusFilter] = useState<string>("");
  const [replyBody, setReplyBody] = useState("");
  const [convertTitle, setConvertTitle] = useState("");

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (inboxStatusFilter) {
      params.set("status", inboxStatusFilter);
    }

    try {
      const [accountData, inboxData, memberData] = await Promise.all([
        apiRequest<{ items: SocialAccount[] }>("/social/accounts"),
        apiRequest<{ items: SocialConversation[] }>(`/social/inbox?${params.toString()}`),
        apiRequest<{ members: Member[] }>("/users/current-company"),
      ]);
      setAccounts(accountData.items);
      setConversations(inboxData.items);
      setMembers(memberData.members.filter((member) => member.status === "active"));
      setCaptureAccountId((current) => current || accountData.items[0]?.id || "");
      setCaptureAssignedTo((current) => current || memberData.members.find((member) => member.status === "active")?.userId || "");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load social workspace");
    } finally {
      setLoading(false);
    }
  }, [inboxStatusFilter]);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const data = await apiRequest<{ items: SocialMessage[] }>(`/social/inbox/${conversationId}/messages`);
      setMessages(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load conversation messages");
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedConversationId) {
      void loadMessages(selectedConversationId);
    } else {
      setMessages([]);
    }
  }, [loadMessages, selectedConversationId]);

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    setError(null);

    try {
      await apiRequest("/social/accounts", {
        method: "POST",
        body: JSON.stringify({
          platform: accountPlatform,
          accountName,
          handle: accountHandle,
        }),
      });
      setAccountName("");
      setAccountHandle("");
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to create social account");
    } finally {
      setWorking(false);
    }
  };

  const handleCapture = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    setError(null);

    try {
      await apiRequest("/social/capture", {
        method: "POST",
        body: JSON.stringify({
          socialAccountId: captureAccountId,
          contactName: captureContactName || undefined,
          contactHandle: captureContactHandle,
          subject: captureSubject || undefined,
          message: captureMessage,
          assignedToUserId: captureAssignedTo || null,
        }),
      });
      setCaptureContactName("");
      setCaptureContactHandle("");
      setCaptureSubject("");
      setCaptureMessage("");
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to capture social conversation");
    } finally {
      setWorking(false);
    }
  };

  const handleReply = async () => {
    if (!selectedConversationId || !replyBody.trim()) {
      return;
    }

    setWorking(true);
    setError(null);

    try {
      await apiRequest(`/social/inbox/${selectedConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          direction: "outbound",
          body: replyBody,
        }),
      });
      setReplyBody("");
      await Promise.all([loadData(), loadMessages(selectedConversationId)]);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to send reply");
    } finally {
      setWorking(false);
    }
  };

  const updateConversation = async (conversationId: string, payload: Record<string, unknown>) => {
    setWorking(true);
    setError(null);

    try {
      await apiRequest(`/social/inbox/${conversationId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await loadData();
      if (selectedConversationId === conversationId) {
        await loadMessages(conversationId);
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to update social conversation");
    } finally {
      setWorking(false);
    }
  };

  const convertConversation = async () => {
    if (!selectedConversationId) {
      return;
    }

    setWorking(true);
    setError(null);

    try {
      await apiRequest(`/social/inbox/${selectedConversationId}/convert-to-lead`, {
        method: "POST",
        body: JSON.stringify({
          title: convertTitle || undefined,
          assignedToUserId: selectedConversation?.assignedToUserId ?? null,
        }),
      });
      setConvertTitle("");
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to convert social conversation");
    } finally {
      setWorking(false);
    }
  };

  return (
    <AppShell
      title="Social"
      description="Manage connected social accounts, capture inbound conversations, assign ownership, and convert them into leads."
    >
      <div className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Social request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 md:grid-cols-4">
          <Card size="sm">
            <CardHeader>
              <CardDescription>Connected accounts</CardDescription>
              <CardTitle className="text-2xl">{accounts.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Inbox conversations</CardDescription>
              <CardTitle className="text-2xl">{conversations.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Unread messages</CardDescription>
              <CardTitle className="text-2xl">{conversations.reduce((sum, item) => sum + item.unreadCount, 0)}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Converted leads</CardDescription>
              <CardTitle className="text-2xl">{conversations.filter((item) => item.leadId).length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="accounts" className="grid gap-4">
          <TabsList className="w-fit">
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="capture">Capture</TabsTrigger>
            <TabsTrigger value="inbox">Inbox</TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Connect account</CardTitle>
                <CardDescription>Register a social account in manual or API-managed mode for inbox capture.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4" onSubmit={handleCreateAccount}>
                  <Field>
                    <FieldLabel>Platform</FieldLabel>
                    <select value={accountPlatform} onChange={(event) => setAccountPlatform(event.target.value as SocialPlatform)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                      {platforms.map((platform) => (
                        <option key={platform} value={platform}>
                          {platform}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel>Account name</FieldLabel>
                    <Input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="North Region Instagram" required />
                  </Field>
                  <Field>
                    <FieldLabel>Handle</FieldLabel>
                    <Input value={accountHandle} onChange={(event) => setAccountHandle(event.target.value)} placeholder="@northregioncrm" required />
                  </Field>
                  <Button type="submit" disabled={working}>
                    {working ? "Saving..." : "Connect account"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Connected accounts</CardTitle>
                <CardDescription>Manual registrations can still drive capture and inbox workflows before a direct API integration exists.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {accounts.map((account) => (
                  <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{account.accountName}</span>
                        <Badge variant="outline">{account.platform}</Badge>
                        <Badge variant={account.status === "connected" ? "secondary" : "outline"}>{account.status}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {account.handle} • mode {account.accessMode}
                      </div>
                    </div>
                  </div>
                ))}
                {!loading && accounts.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    No social accounts connected yet.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="capture" className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader>
                <CardTitle>Capture inbound lead</CardTitle>
                <CardDescription>Record an incoming DM or comment thread and place it into the social inbox.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4" onSubmit={handleCapture}>
                  <Field>
                    <FieldLabel>Account</FieldLabel>
                    <select value={captureAccountId} onChange={(event) => setCaptureAccountId(event.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.accountName} ({account.platform})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel>Contact name</FieldLabel>
                    <Input value={captureContactName} onChange={(event) => setCaptureContactName(event.target.value)} placeholder="Riya Mehta" />
                  </Field>
                  <Field>
                    <FieldLabel>Contact handle</FieldLabel>
                    <Input value={captureContactHandle} onChange={(event) => setCaptureContactHandle(event.target.value)} placeholder="@riya.design" required />
                  </Field>
                  <Field>
                    <FieldLabel>Assigned owner</FieldLabel>
                    <select value={captureAssignedTo} onChange={(event) => setCaptureAssignedTo(event.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.fullName ?? member.email}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel>Subject</FieldLabel>
                    <Input value={captureSubject} onChange={(event) => setCaptureSubject(event.target.value)} placeholder="Kitchen remodel inquiry" />
                  </Field>
                  <Field>
                    <FieldLabel>Inbound message</FieldLabel>
                    <Textarea value={captureMessage} onChange={(event) => setCaptureMessage(event.target.value)} className="min-h-28" required />
                  </Field>
                  <Button type="submit" disabled={working || accounts.length === 0}>
                    {working ? "Capturing..." : "Capture conversation"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Capture checklist</CardTitle>
                <CardDescription>This manual capture flow gives the team a usable inbox before external webhook integrations are added.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {[
                  "Register each active social handle as an account.",
                  "Capture inbound DMs, comments, or WhatsApp inquiries into the inbox.",
                  "Assign a teammate to the conversation immediately when ownership is clear.",
                  "Convert qualified conversations into CRM leads without retyping the inquiry.",
                ].map((item) => (
                  <div key={item} className="rounded-xl border bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
                    {item}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inbox" className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Inbox conversations</CardTitle>
                <CardDescription>Filter and open the current inbox queue.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/20 p-4">
                  <Field>
                    <FieldLabel>Status</FieldLabel>
                    <select value={inboxStatusFilter} onChange={(event) => setInboxStatusFilter(event.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                      <option value="">All statuses</option>
                      <option value="open">open</option>
                      <option value="assigned">assigned</option>
                      <option value="closed">closed</option>
                    </select>
                  </Field>
                  <Button type="button" variant="outline" onClick={() => void loadData()}>
                    Refresh inbox
                  </Button>
                </div>

                <div className="grid gap-3">
                  {conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setSelectedConversationId(conversation.id)}
                      className="grid gap-2 rounded-xl border p-4 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{conversation.contactName ?? conversation.contactHandle}</span>
                        <Badge variant="outline">{conversation.platform}</Badge>
                        <Badge variant={conversation.status === "closed" ? "outline" : "secondary"}>{conversation.status}</Badge>
                        {conversation.unreadCount > 0 ? <Badge variant="destructive">{conversation.unreadCount} unread</Badge> : null}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {conversation.accountName} • {conversation.contactHandle} • {new Date(conversation.lastMessageAt).toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">{conversation.latestMessage ?? "No latest message"}</div>
                    </button>
                  ))}
                  {!loading && conversations.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                      No social inbox conversations for the current filter.
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conversation detail</CardTitle>
                <CardDescription>Assign owners, send replies, and convert qualified threads into leads.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {selectedConversation ? (
                  <>
                    <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{selectedConversation.contactName ?? selectedConversation.contactHandle}</span>
                        <Badge variant="outline">{selectedConversation.platform}</Badge>
                        {selectedConversation.leadTitle ? <Badge variant="secondary">Lead: {selectedConversation.leadTitle}</Badge> : null}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field>
                          <FieldLabel>Owner</FieldLabel>
                          <select
                            value={selectedConversation.assignedToUserId ?? ""}
                            onChange={(event) =>
                              void updateConversation(selectedConversation.id, {
                                assignedToUserId: event.target.value || null,
                              })
                            }
                            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                          >
                            <option value="">Unassigned</option>
                            {members.map((member) => (
                              <option key={member.userId} value={member.userId}>
                                {member.fullName ?? member.email}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field>
                          <FieldLabel>Status</FieldLabel>
                          <select
                            value={selectedConversation.status}
                            onChange={(event) =>
                              void updateConversation(selectedConversation.id, {
                                status: event.target.value,
                              })
                            }
                            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                          >
                            <option value="open">open</option>
                            <option value="assigned">assigned</option>
                            <option value="closed">closed</option>
                          </select>
                        </Field>
                      </div>
                    </div>

                    <div className="grid gap-3 rounded-xl border p-4">
                      {messages.map((message) => (
                        <div key={message.id} className="rounded-xl border bg-muted/10 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={message.direction === "inbound" ? "destructive" : "secondary"}>{message.direction}</Badge>
                            <span className="text-sm text-muted-foreground">{message.senderName ?? "Unknown sender"}</span>
                            <span className="text-sm text-muted-foreground">{new Date(message.sentAt).toLocaleString()}</span>
                          </div>
                          <div className="mt-2 text-sm">{message.body}</div>
                        </div>
                      ))}
                    </div>

                    <Field>
                      <FieldLabel>Reply</FieldLabel>
                      <Textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} className="min-h-24" />
                    </Field>
                    <Button type="button" variant="outline" disabled={working || !replyBody.trim()} onClick={() => void handleReply()}>
                      {working ? "Sending..." : "Send reply"}
                    </Button>

                    {!selectedConversation.leadId ? (
                      <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
                        <Field>
                          <FieldLabel>Lead title override</FieldLabel>
                          <Input value={convertTitle} onChange={(event) => setConvertTitle(event.target.value)} placeholder="Optional lead title" />
                        </Field>
                        <Button type="button" disabled={working} onClick={() => void convertConversation()}>
                          {working ? "Converting..." : "Convert to lead"}
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    Select a conversation from the inbox to view messages and actions.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
