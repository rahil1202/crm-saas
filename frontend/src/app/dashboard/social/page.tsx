"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiRequest, buildApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import Link from "next/link";

type SocialPlatform = "instagram" | "facebook" | "whatsapp" | "linkedin";
type SocialConversationStatus = "open" | "assigned" | "closed";

interface SocialAccount {
  id: string;
  platform: SocialPlatform;
  accountName: string;
  handle: string;
  status: "connected" | "disconnected";
  accessMode: string;
  metadata?: Record<string, unknown>;
}

interface SocialConversation {
  id: string;
  socialAccountId: string;
  leadId: string | null;
  assignedToUserId: string | null;
  platform: SocialPlatform;
  humanTakeoverEnabled: boolean;
  botState: string;
  contactName: string | null;
  contactHandle: string;
  status: SocialConversationStatus;
  subject: string | null;
  latestMessage: string | null;
  resolvedAt: string | null;
  lastOutboundAt: string | null;
  messageStatusSummary: Record<string, unknown>;
  unreadCount: number;
  lastMessageAt: string;
  accountName: string;
  accountHandle: string;
  leadTitle: string | null;
}

interface SocialMessage {
  id: string;
  direction: "inbound" | "outbound";
  messageType: string;
  deliveryStatus: string;
  providerMessageId: string | null;
  senderName: string | null;
  body: string;
  metadata: Record<string, unknown>;
  cost: WhatsappMessageCost | null;
  sentAt: string;
}

interface WhatsappLogItem {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  messageType: string;
  deliveryStatus: string;
  providerMessageId: string | null;
  senderName: string | null;
  body: string;
  sentAt: string;
  metadata: Record<string, unknown>;
  contactName: string | null;
  contactHandle: string;
  accountName: string;
  accountHandle: string;
  cost: WhatsappMessageCost | null;
}

interface WhatsappMessageCost {
  id: string;
  category: string;
  market: string;
  currency: string;
  estimatedCost: string;
  finalCost: string | null;
  status: "estimated" | "final" | "waived";
}

interface WhatsappWorkspace {
  id: string;
  name: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  webhookKey: string | null;
  isActive: boolean;
  isVerified: boolean;
  activePhoneNumberIds: string[];
}

interface WhatsappOutboxResponse {
  conversation: { id: string } | null;
  message: { id: string; deliveryStatus?: string; providerMessageId?: string | null } | null;
  outbox: { id: string; status: string; resolvedMode: string; nextAttemptAt?: string | null };
  session: { serviceWindowExpiresAt: string | null; state?: string | null } | null;
}

interface WhatsappSession {
  id: string;
  state: string;
  lastInboundAt: string | null;
  serviceWindowExpiresAt: string | null;
  lastOutboundAt: string | null;
  lastTemplateAt: string | null;
}

interface WhatsappPricingEstimate {
  category: string;
  market: string;
  currency: string;
  estimatedCost: string;
  status: "estimated" | "waived";
  reason: string;
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
const selectClassName =
  "h-9 w-full rounded-md border border-border/70 bg-background px-3 text-sm text-foreground shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40";
const cardClassName = "border-border/60 shadow-none";

function getProviderMessageId(message: { providerMessageId?: string | null; metadata?: Record<string, unknown> }) {
  return message.providerMessageId ?? (typeof message.metadata?.providerMessageId === "string" ? message.metadata.providerMessageId : null);
}

function deliveryBadgeVariant(status?: string | null) {
  if (status === "failed" || status === "blocked") {
    return "destructive" as const;
  }
  if (status === "delivered" || status === "read" || status === "sent") {
    return "secondary" as const;
  }
  return "outline" as const;
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "not available";
}

function formatCost(cost: WhatsappMessageCost | null) {
  if (!cost) {
    return null;
  }
  const value = Number(cost.finalCost ?? cost.estimatedCost);
  const amount = Number.isFinite(value) ? new Intl.NumberFormat(undefined, { style: "currency", currency: cost.currency, maximumFractionDigits: 6 }).format(value) : `${cost.currency} ${cost.finalCost ?? cost.estimatedCost}`;
  return `${amount} • ${cost.category} • ${cost.status}`;
}

export default function SocialPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [conversations, setConversations] = useState<SocialConversation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [whatsappWorkspaces, setWhatsappWorkspaces] = useState<WhatsappWorkspace[]>([]);
  const [whatsappSession, setWhatsappSession] = useState<WhatsappSession | null>(null);
  const [replyPricingEstimate, setReplyPricingEstimate] = useState<WhatsappPricingEstimate | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [whatsappLog, setWhatsappLog] = useState<WhatsappLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingWhatsappLog, setLoadingWhatsappLog] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accountPlatform, setAccountPlatform] = useState<SocialPlatform>("instagram");
  const [accountName, setAccountName] = useState("");
  const [accountHandle, setAccountHandle] = useState("");
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("");
  const [whatsappBusinessAccountId, setWhatsappBusinessAccountId] = useState("");
  const [whatsappAccessToken, setWhatsappAccessToken] = useState("");
  const [testWhatsappAccountId, setTestWhatsappAccountId] = useState("");
  const [testWhatsappHandle, setTestWhatsappHandle] = useState("");
  const [testWhatsappName, setTestWhatsappName] = useState("");
  const [testWhatsappMessage, setTestWhatsappMessage] = useState("This is a live WhatsApp runtime test from CRM.");
  const [whatsappTestMessage, setWhatsappTestMessage] = useState<string | null>(null);

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
  const whatsappAccounts = useMemo(() => accounts.filter((account) => account.platform === "whatsapp"), [accounts]);
  const whatsappWebhookUrls = useMemo(
    () =>
      whatsappWorkspaces
        .filter((workspace) => workspace.webhookKey)
        .map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          url: buildApiUrl(`/public/whatsapp/webhook/${workspace.webhookKey}`),
          isActive: workspace.isActive,
          isVerified: workspace.isVerified,
        })),
    [whatsappWorkspaces],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (inboxStatusFilter) {
      params.set("status", inboxStatusFilter);
    }

    try {
      const [accountData, inboxData, memberData, workspaceData] = await Promise.all([
        apiRequest<{ items: SocialAccount[] }>("/social/accounts"),
        apiRequest<{ items: SocialConversation[] }>(`/social/inbox?${params.toString()}`),
        apiRequest<{ members: Member[] }>("/users/current-company"),
        apiRequest<{ items: WhatsappWorkspace[] }>("/whatsapp-workspaces"),
      ]);
      setAccounts(accountData.items);
      setConversations(inboxData.items);
      setMembers(memberData.members.filter((member) => member.status === "active"));
      setWhatsappWorkspaces(workspaceData.items);
      setCaptureAccountId((current) => current || accountData.items[0]?.id || "");
      setTestWhatsappAccountId((current) => current || accountData.items.find((account) => account.platform === "whatsapp")?.id || "");
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

  const loadWhatsappSession = useCallback(async (conversationId: string) => {
    try {
      const data = await apiRequest<{ session: WhatsappSession | null }>(`/whatsapp/conversations/${conversationId}/session`, { skipCache: true });
      setWhatsappSession(data.session);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load WhatsApp session");
    }
  }, []);

  const loadWhatsappLog = useCallback(async () => {
    setLoadingWhatsappLog(true);
    try {
      const data = await apiRequest<{ items: WhatsappLogItem[] }>("/social/whatsapp/log?limit=12");
      setWhatsappLog(data.items);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load WhatsApp activity");
    } finally {
      setLoadingWhatsappLog(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);
  useEffect(() => {
    void loadWhatsappLog();
  }, [loadWhatsappLog]);

  useEffect(() => {
    if (selectedConversationId) {
      void loadMessages(selectedConversationId);
    } else {
      setMessages([]);
    }
  }, [loadMessages, selectedConversationId]);

  useEffect(() => {
    if (selectedConversation?.platform === "whatsapp") {
      void loadWhatsappSession(selectedConversation.id);
    } else {
      setWhatsappSession(null);
    }
  }, [loadWhatsappSession, selectedConversation]);

  useEffect(() => {
    if (selectedConversation?.platform !== "whatsapp") {
      setReplyPricingEstimate(null);
      return;
    }

    const serviceWindowOpen = Boolean(whatsappSession?.serviceWindowExpiresAt && new Date(whatsappSession.serviceWindowExpiresAt) > new Date());
    void apiRequest<WhatsappPricingEstimate>("/whatsapp/pricing/estimate", {
      method: "POST",
      body: JSON.stringify({
        to: selectedConversation.contactHandle,
        category: serviceWindowOpen ? "service" : "utility",
        serviceWindowOpen,
        billableUnits: 1,
        currency: selectedConversation.contactHandle.startsWith("+91") || selectedConversation.contactHandle.startsWith("91") ? "INR" : "USD",
      }),
    })
      .then(setReplyPricingEstimate)
      .catch(() => setReplyPricingEstimate(null));
  }, [selectedConversation, whatsappSession]);

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    setWhatsappTestMessage(null);

    try {
      await apiRequest("/social/accounts", {
        method: "POST",
        body: JSON.stringify({
          platform: accountPlatform,
          accountName,
          handle: accountHandle,
          metadata:
            accountPlatform === "whatsapp"
              ? {
                  phoneNumberId: whatsappPhoneNumberId || undefined,
                  businessAccountId: whatsappBusinessAccountId || undefined,
                  accessToken: whatsappAccessToken || undefined,
                }
              : {},
        }),
      });
      setAccountName("");
      setAccountHandle("");
      setWhatsappPhoneNumberId("");
      setWhatsappBusinessAccountId("");
      setWhatsappAccessToken("");
      await loadData();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to create social account");
    } finally {
      setWorking(false);
    }
  };

  const handleWhatsappTestSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    setError(null);
    setWhatsappTestMessage(null);

    try {
      const response = await apiRequest<WhatsappOutboxResponse>("/social/whatsapp/test-send", {
        method: "POST",
        body: JSON.stringify({
          accountId: testWhatsappAccountId || undefined,
          contactHandle: testWhatsappHandle,
          contactName: testWhatsappName || undefined,
          message: testWhatsappMessage,
        }),
      });
      setWhatsappTestMessage(
        `Queued WhatsApp test. Conversation ${response.conversation?.id ?? "pending"}, message ${
          response.message?.id ?? "pending"
        }, outbox ${response.outbox.id} is ${response.outbox.status} (${response.outbox.resolvedMode}).`,
      );
      await Promise.all([loadData(), loadWhatsappLog()]);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to send WhatsApp test");
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
      if (selectedConversation?.platform === "whatsapp") {
        await apiRequest<WhatsappOutboxResponse>("/social/whatsapp/send", {
          method: "POST",
          body: JSON.stringify({
            accountId: selectedConversation.socialAccountId,
            contactHandle: selectedConversation.contactHandle,
            contactName: selectedConversation.contactName ?? undefined,
            leadId: selectedConversation.leadId ?? undefined,
            message: replyBody,
          }),
        });
      } else {
        await apiRequest(`/social/inbox/${selectedConversationId}/messages`, {
          method: "POST",
          body: JSON.stringify({
            direction: "outbound",
            body: replyBody,
          }),
        });
      }
      setReplyBody("");
      await Promise.all([
        loadData(),
        loadMessages(selectedConversationId),
        selectedConversation?.platform === "whatsapp" ? loadWhatsappSession(selectedConversationId) : Promise.resolve(),
      ]);
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
    <>
      <div className="mx-auto grid w-full max-w-[1400px] gap-5">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Social workspace</h1>
          <p className="text-sm text-muted-foreground">Manage connected channels, capture incoming inquiries, and handle replies from one inbox.</p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Social request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          Provider setup now lives in Integration Hub for guided onboarding and webhook policy.
          <Link href="/dashboard/integrations" className="ml-1 font-medium text-foreground underline underline-offset-4">
            Open Integration Hub
          </Link>
          .
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Card size="sm" className={cardClassName}>
            <CardHeader>
              <CardDescription>Connected accounts</CardDescription>
              <CardTitle className="text-2xl">{accounts.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm" className={cardClassName}>
            <CardHeader>
              <CardDescription>Inbox conversations</CardDescription>
              <CardTitle className="text-2xl">{conversations.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm" className={cardClassName}>
            <CardHeader>
              <CardDescription>Unread messages</CardDescription>
              <CardTitle className="text-2xl">{conversations.reduce((sum, item) => sum + item.unreadCount, 0)}</CardTitle>
            </CardHeader>
          </Card>
          <Card size="sm" className={cardClassName}>
            <CardHeader>
              <CardDescription>Converted leads</CardDescription>
              <CardTitle className="text-2xl">{conversations.filter((item) => item.leadId).length}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="accounts" queryKey="tab" className="grid gap-4">
          <TabsList className="h-auto w-fit rounded-xl border border-border/70 bg-muted/30 p-1">
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="capture">Capture</TabsTrigger>
            <TabsTrigger value="inbox">Inbox</TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className={cardClassName}>
              <CardHeader>
                <CardTitle>Connect account</CardTitle>
                <CardDescription>Register a social account in manual or API-managed mode for inbox capture.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4" onSubmit={handleCreateAccount}>
                  <Field>
                    <FieldLabel>Platform</FieldLabel>
                    <select value={accountPlatform} onChange={(event) => setAccountPlatform(event.target.value as SocialPlatform)} className={selectClassName}>
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
                  {accountPlatform === "whatsapp" ? (
                    <>
                      <Field>
                        <FieldLabel>Phone number ID</FieldLabel>
                        <Input value={whatsappPhoneNumberId} onChange={(event) => setWhatsappPhoneNumberId(event.target.value)} placeholder="Meta phone number ID" required />
                      </Field>
                      <Field>
                        <FieldLabel>Business account ID</FieldLabel>
                        <Input value={whatsappBusinessAccountId} onChange={(event) => setWhatsappBusinessAccountId(event.target.value)} placeholder="Optional WABA ID" />
                      </Field>
                      <Field>
                        <FieldLabel>Access token override</FieldLabel>
                        <Input value={whatsappAccessToken} onChange={(event) => setWhatsappAccessToken(event.target.value)} placeholder="Optional per-account token" />
                      </Field>
                    </>
                  ) : null}
                  <Button type="submit" disabled={working}>
                    {working ? "Saving..." : "Connect account"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className={cardClassName}>
              <CardHeader>
                <CardTitle>Connected accounts</CardTitle>
                <CardDescription>Manual registrations can still drive capture and inbox workflows before a direct API integration exists.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {accounts.map((account) => (
                  <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-background p-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{account.accountName}</span>
                        <Badge variant="outline">{account.platform}</Badge>
                        <Badge variant={account.status === "connected" ? "secondary" : "outline"}>{account.status}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {account.handle} • mode {account.accessMode}
                      </div>
                      {account.platform === "whatsapp" ? (
                        <div className="mt-1 text-sm text-muted-foreground">
                          phone number ID {typeof account.metadata?.phoneNumberId === "string" ? account.metadata.phoneNumberId : "not set"}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                {!loading && accounts.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                    No social accounts connected yet.
                  </div>
                ) : null}
                <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm">
                  <div className="font-medium">Meta webhook URLs</div>
                  <div className="mt-1 text-muted-foreground">
                    Meta verification and event subscriptions must use keyed workspace URLs so the backend can choose the correct app secret and phone routing.
                  </div>
                  {whatsappWebhookUrls.length > 0 ? (
                    <div className="mt-3 grid gap-3">
                      {whatsappWebhookUrls.map((workspace) => (
                        <div key={workspace.id} className="rounded-lg border border-border/60 bg-background p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{workspace.name}</span>
                            <Badge variant={workspace.isActive ? "secondary" : "outline"}>{workspace.isActive ? "Active" : "Inactive"}</Badge>
                            <Badge variant={workspace.isVerified ? "secondary" : "outline"}>{workspace.isVerified ? "Verified" : "Unverified"}</Badge>
                          </div>
                          <div className="mt-2 break-all font-mono text-xs text-muted-foreground">{workspace.url}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-dashed border-border/60 bg-background p-3 text-muted-foreground">
                      No keyed WhatsApp workspace URL is configured. Create one in Integration Hub before setting up Meta webhooks.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className={cardClassName}>
              <CardHeader>
                <CardTitle>Send WhatsApp test</CardTitle>
                <CardDescription>Queues a live Meta WhatsApp message through the outbox. Delivery, read, and failure states update from webhooks.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4" onSubmit={handleWhatsappTestSend}>
                  <Field>
                    <FieldLabel>WhatsApp account</FieldLabel>
                    <select value={testWhatsappAccountId} onChange={(event) => setTestWhatsappAccountId(event.target.value)} className={selectClassName}>
                      <option value="">Auto-select first WhatsApp account</option>
                      {whatsappAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.accountName} ({account.handle})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel>Destination handle</FieldLabel>
                    <Input value={testWhatsappHandle} onChange={(event) => setTestWhatsappHandle(event.target.value)} placeholder="919876543210" required />
                  </Field>
                  <Field>
                    <FieldLabel>Contact name</FieldLabel>
                    <Input value={testWhatsappName} onChange={(event) => setTestWhatsappName(event.target.value)} placeholder="Optional contact name" />
                  </Field>
                  <Field>
                    <FieldLabel>Message</FieldLabel>
                    <Textarea value={testWhatsappMessage} onChange={(event) => setTestWhatsappMessage(event.target.value)} className="min-h-24" required />
                  </Field>
                  {whatsappTestMessage ? <div className="text-sm text-emerald-700">{whatsappTestMessage}</div> : null}
                  <Button type="submit" disabled={working || whatsappAccounts.length === 0}>
                    {working ? "Sending..." : "Send WhatsApp test"}
                  </Button>
                </form>
              </CardContent>
            </Card>
            <Card className={cardClassName}>
              <CardHeader>
                <CardTitle>Recent WhatsApp activity</CardTitle>
                <CardDescription>Latest inbound and outbound WhatsApp messages reaching the live runtime.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {loadingWhatsappLog ? <div className="text-sm text-muted-foreground">Loading WhatsApp activity...</div> : null}
                {!loadingWhatsappLog && whatsappLog.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">No WhatsApp activity yet.</div>
                ) : null}
                {!loadingWhatsappLog && whatsappLog.length > 0 ? (
                  <div className="grid gap-3">
                    {whatsappLog.map((item) => (
                      <div key={item.id} className="rounded-xl border p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{item.contactName ?? item.contactHandle}</span>
                          <Badge variant="outline">{item.direction}</Badge>
                          <Badge variant="outline">{item.messageType}</Badge>
                          <Badge variant={deliveryBadgeVariant(item.deliveryStatus)}>{item.deliveryStatus}</Badge>
                          <Badge variant="secondary">{item.accountName}</Badge>
                          {formatCost(item.cost) ? <Badge variant="outline">{formatCost(item.cost)}</Badge> : null}
                        </div>
                        <div className="mt-2 text-sm">{item.body}</div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {new Date(item.sentAt).toLocaleString()}
                          {getProviderMessageId(item) ? ` • provider ${getProviderMessageId(item)}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="capture" className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className={cardClassName}>
              <CardHeader>
                <CardTitle>Capture inbound lead</CardTitle>
                <CardDescription>Record an incoming DM or comment thread and place it into the social inbox.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-4" onSubmit={handleCapture}>
                  <Field>
                    <FieldLabel>Account</FieldLabel>
                    <select value={captureAccountId} onChange={(event) => setCaptureAccountId(event.target.value)} className={selectClassName}>
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
                    <select value={captureAssignedTo} onChange={(event) => setCaptureAssignedTo(event.target.value)} className={selectClassName}>
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

            <Card className={cardClassName}>
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
                  <div key={item} className="rounded-xl border border-border/70 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
                    {item}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inbox" className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Card className={cardClassName}>
              <CardHeader>
                <CardTitle>Inbox conversations</CardTitle>
                <CardDescription>Filter and open the current inbox queue.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                  <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                  <Field>
                    <FieldLabel>Status</FieldLabel>
                    <select value={inboxStatusFilter} onChange={(event) => setInboxStatusFilter(event.target.value)} className={selectClassName}>
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
                      className={cn(
                        "grid gap-2 rounded-xl border border-border/70 p-4 text-left transition",
                        selectedConversationId === conversation.id ? "border-primary/35 bg-muted/20" : "bg-background hover:bg-muted/20",
                      )}
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
                      <div className="text-xs text-muted-foreground">
                        {conversation.humanTakeoverEnabled ? "Human takeover" : "Bot active"} • {conversation.botState}
                      </div>
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

            <Card className={cardClassName}>
              <CardHeader>
                <CardTitle>Conversation detail</CardTitle>
                <CardDescription>Assign owners, send replies, and convert qualified threads into leads.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {selectedConversation ? (
                  <>
                    <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
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
                            className={selectClassName}
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
                            className={selectClassName}
                          >
                            <option value="open">open</option>
                            <option value="assigned">assigned</option>
                            <option value="closed">closed</option>
                          </select>
                        </Field>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={selectedConversation.humanTakeoverEnabled ? "secondary" : "outline"}
                          onClick={() =>
                            void apiRequest(`/social/whatsapp-inbox-actions/${selectedConversation.id}/takeover`, {
                              method: "POST",
                              body: JSON.stringify({ enabled: !selectedConversation.humanTakeoverEnabled }),
                            }).then(() => loadData())
                          }
                        >
                          {selectedConversation.humanTakeoverEnabled ? "Disable takeover" : "Enable takeover"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void apiRequest(`/social/whatsapp-inbox-actions/${selectedConversation.id}/resolve`, {
                              method: "POST",
                              body: JSON.stringify({ resolved: selectedConversation.status !== "closed" }),
                            }).then(() => loadData())
                          }
                        >
                          {selectedConversation.status === "closed" ? "Reopen" : "Resolve"}
                        </Button>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Status summary: {JSON.stringify(selectedConversation.messageStatusSummary ?? {})}
                      </div>
                      {selectedConversation.platform === "whatsapp" ? (
                        <div className="rounded-lg border border-border/60 bg-background p-3 text-xs text-muted-foreground">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">Session window</span>
                            <Badge variant={whatsappSession?.state === "open" ? "secondary" : "outline"}>{whatsappSession?.state ?? "unknown"}</Badge>
                          </div>
                          <div className="mt-2">
                            Service window expires: {formatDateTime(whatsappSession?.serviceWindowExpiresAt)}
                          </div>
                          <div className="mt-1">
                            Last inbound: {formatDateTime(whatsappSession?.lastInboundAt)} • last outbound: {formatDateTime(whatsappSession?.lastOutboundAt)}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-3 rounded-xl border border-border/70 p-4">
                      {messages.map((message) => (
                        <div key={message.id} className="rounded-xl border border-border/70 bg-muted/10 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={message.direction === "inbound" ? "destructive" : "secondary"}>{message.direction}</Badge>
                            <Badge variant="outline">{message.messageType}</Badge>
                            <Badge variant={deliveryBadgeVariant(message.deliveryStatus)}>{message.deliveryStatus}</Badge>
                            {formatCost(message.cost) ? <Badge variant="outline">{formatCost(message.cost)}</Badge> : null}
                            <span className="text-sm text-muted-foreground">{message.senderName ?? "Unknown sender"}</span>
                            <span className="text-sm text-muted-foreground">{new Date(message.sentAt).toLocaleString()}</span>
                          </div>
                          <div className="mt-2 text-sm">{message.body}</div>
                          {getProviderMessageId(message) ? (
                            <div className="mt-2 break-all text-xs text-muted-foreground">Provider message ID: {getProviderMessageId(message)}</div>
                          ) : null}
                        </div>
                      ))}
                      {messages.length === 0 ? <div className="text-sm text-muted-foreground">No messages yet for this conversation.</div> : null}
                    </div>

                    <Field>
                      <FieldLabel>Reply</FieldLabel>
                      <Textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} className="min-h-24" />
                      {selectedConversation.platform === "whatsapp" ? (
                        <div className="mt-2 text-xs text-muted-foreground">
                          This reply is queued through the WhatsApp outbox. The backend uses the session window to choose free-form or template mode.
                          {replyPricingEstimate
                            ? ` Estimated charge: ${replyPricingEstimate.currency} ${replyPricingEstimate.estimatedCost} (${replyPricingEstimate.category}, ${replyPricingEstimate.reason}).`
                            : ""}
                          {whatsappSession?.state !== "open" ? " Outside the 24-hour service window, use an approved template to avoid a blocked send." : ""}
                        </div>
                      ) : null}
                    </Field>
                    <Button type="button" variant="outline" disabled={working || !replyBody.trim()} onClick={() => void handleReply()}>
                      {working ? "Sending..." : "Send reply"}
                    </Button>

                    {!selectedConversation.leadId ? (
                      <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
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
    </>
  );
}

