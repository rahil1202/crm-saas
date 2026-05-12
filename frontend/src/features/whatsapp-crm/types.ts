/**
 * Shared types for the WhatsApp CRM module.
 *
 * These mirror the public API response shapes served by the backend
 * module at /api/v1/whatsapp-*. Keep them in sync with the backend
 * controllers in backend/src/modules/whatsapp/*.
 */

export type ConnectionStatus = "ready" | "limited" | "blocked";

export interface WhatsappConnectionSummary {
  id: string;
  name: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  webhookKey: string | null;
  isActive: boolean;
  isVerified: boolean;
  status: ConnectionStatus;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingLimit: string | null;
  phoneRegistrationStatus: string | null;
  lastMetaSyncAt: string | null;
  updatedAt: string;
}

export interface WhatsappDashboardStats {
  workspaces: { total: number; active: number; verified: number };
  messagesToday: { sent: number; received: number; failed: number };
  messagesSentSeries: Array<{ day: string; count: number }>;
  conversations: { active24h: number; open: number; unread: number };
  templates: { approved: number };
  webhooks: { eventsToday: number; failedLast7d: number };
}

export interface WhatsappWebhookEventSummary {
  id: string;
  workspaceId: string | null;
  eventKey: string;
  eventType: string;
  status: "queued" | "processing" | "processed" | "ignored" | "failed";
  attempts: number;
  lastError: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export interface WhatsappRecentActivityItem {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  deliveryStatus: string;
  messageType: string;
  body: string | null;
  senderName: string | null;
  sentAt: string;
  contactName: string | null;
  contactHandle: string;
  accountId: string;
  accountName: string;
}

export interface WhatsappOnboardingStatus {
  status: ConnectionStatus;
  activeWorkspaceId: string | null;
  steps: Array<{ key: string; label: string; done: boolean }>;
  workspaces: Array<{
    workspace: WhatsappWorkspace;
    readiness: WhatsappReadiness;
  }>;
  embeddedSignup: { appId: string | null; configId: string | null; enabled: boolean };
}

export interface WhatsappWorkspace {
  id: string;
  name: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  webhookKey: string | null;
  verifyToken: string | null;
  appSecret: string | null;
  accessToken: string | null;
  isActive: boolean;
  isVerified: boolean;
  activePhoneNumberIds: string[];
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface WhatsappReadiness {
  status: ConnectionStatus;
  missing: string[];
  checks: {
    active: boolean;
    phoneNumberConfigured: boolean;
    businessAccountConfigured: boolean;
    tokenValid: boolean;
    webhookVerified: boolean;
    phoneConnected: boolean;
    approvedTemplateCount: number;
    pricingLoaded: boolean;
  };
  meta: Record<string, unknown>;
}

// -----------------------------------------------------------------
// Phase 2 — inbox + contacts
// -----------------------------------------------------------------

export type ConversationStatus = "open" | "assigned" | "closed";
export type ConversationPriority = "low" | "normal" | "high" | "urgent";
export type OptInStatus = "opted_in" | "opted_out" | "unknown";
export type EngagementStatus = "hot" | "warm" | "cold" | "dormant";
export type DeliveryStatus = "queued" | "sent" | "delivered" | "read" | "failed";

export interface ConversationSummary {
  id: string;
  socialAccountId: string;
  leadId: string | null;
  assignedToUserId: string | null;
  platform: string;
  contactName: string | null;
  contactHandle: string;
  status: ConversationStatus;
  humanTakeoverEnabled: boolean;
  botState: string;
  subject: string | null;
  latestMessage: string | null;
  resolvedAt: string | null;
  lastOutboundAt: string | null;
  lastMessageAt: string;
  unreadCount: number;
  pinnedAt: string | null;
  archivedAt: string | null;
  priority: ConversationPriority;
  agentLastReadAt: string | null;
  tagIds: string[];
  accountName: string;
  accountHandle: string;
  leadTitle: string | null;
  assignedToName: string | null;
  assignedToEmail: string | null;
}

export interface ConversationDetail extends ConversationSummary {
  metadata?: Record<string, unknown>;
  messageStatusSummary?: Record<string, unknown>;
}

export interface MessageAttachment {
  id: string;
  messageId: string | null;
  conversationId: string | null;
  mediaType: "image" | "audio" | "video" | "document" | "sticker";
  mimeType: string | null;
  sizeBytes: number | null;
  originalName: string | null;
  storageObjectPath: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  messageType: string;
  deliveryStatus: string;
  providerMessageId: string | null;
  senderName: string | null;
  body: string;
  metadata: Record<string, unknown>;
  reactions: Array<{ emoji: string; by: string; at: string }>;
  sentAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  attachments: MessageAttachment[];
}

export interface ConversationNote {
  id: string;
  conversationId: string;
  authorId: string | null;
  body: string;
  mentions: string[];
  createdAt: string;
  updatedAt: string;
  authorName: string | null;
  authorEmail: string | null;
}

export interface ConversationTag {
  id: string;
  name: string;
  color: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactProfile {
  id: string;
  phoneE164: string;
  displayName: string | null;
  avatarUrl: string | null;
  locale: string | null;
  optInStatus: OptInStatus;
  optInSource: string | null;
  optInAt: string | null;
  optOutAt: string | null;
  engagementScore: number;
  engagementStatus: EngagementStatus;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  customFields: Record<string, unknown>;
  tags: Array<{ id: string; name: string; color: string }>;
}

export interface RealtimeInboxEvent {
  type:
    | "hello"
    | "message.created"
    | "message.status"
    | "conversation.updated"
    | "conversation.assigned"
    | "conversation.note"
    | "conversation.typing"
    | "contact.updated";
  companyId?: string;
  conversationId?: string;
  messageId?: string;
  noteId?: string;
  direction?: "inbound" | "outbound";
  status?: string;
  state?: "start" | "stop";
  userId?: string;
  phoneE164?: string;
  body?: string | null;
  sentAt?: string;
  at?: string;
  patch?: Record<string, unknown>;
  mentions?: string[];
  [key: string]: unknown;
}
