import crypto from "node:crypto";

/**
 * WhatsApp CRM — realtime bus (in-process for single-instance deployments).
 *
 * Clients connect via Server-Sent Events at
 *   GET /api/v1/whatsapp/realtime (authenticated, tenant-scoped).
 *
 * Every mutation inside the WhatsApp CRM module calls `publishWhatsappEvent`,
 * which fans out to every SSE subscriber for the same companyId.
 *
 * For multi-node deployments, swap the in-memory `subscribers` map for a
 * Redis pub/sub or Supabase Realtime channel without changing call sites.
 */

export type WhatsappRealtimeEvent =
  | {
      type: "message.created";
      companyId: string;
      conversationId: string;
      messageId: string;
      direction: "inbound" | "outbound";
      body: string | null;
      messageType: string;
      deliveryStatus: string;
      contactHandle: string;
      contactName: string | null;
      sentAt: string;
    }
  | {
      type: "message.status";
      companyId: string;
      conversationId: string;
      messageId: string;
      status: string;
      at: string;
    }
  | {
      type: "conversation.updated";
      companyId: string;
      conversationId: string;
      patch: Record<string, unknown>;
    }
  | {
      type: "conversation.assigned";
      companyId: string;
      conversationId: string;
      assignedToUserId: string | null;
    }
  | {
      type: "conversation.note";
      companyId: string;
      conversationId: string;
      noteId: string;
      authorId: string | null;
      body: string;
      mentions: string[];
      createdAt: string;
    }
  | {
      type: "conversation.typing";
      companyId: string;
      conversationId: string;
      userId: string;
      state: "start" | "stop";
    }
  | {
      type: "contact.updated";
      companyId: string;
      phoneE164: string;
    };

interface Subscriber {
  id: string;
  companyId: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
  closedAt: number | null;
}

const subscribers = new Map<string, Subscriber>();

function encodeEvent(event: WhatsappRealtimeEvent) {
  const payload = JSON.stringify(event);
  return new TextEncoder().encode(`event: ${event.type}\ndata: ${payload}\n\n`);
}

function writeToSubscriber(subscriber: Subscriber, chunk: Uint8Array) {
  try {
    subscriber.controller.enqueue(chunk);
  } catch {
    // Underlying stream is closed — drop the subscriber.
    subscriber.closedAt = Date.now();
    subscribers.delete(subscriber.id);
  }
}

export function publishWhatsappEvent(event: WhatsappRealtimeEvent) {
  const chunk = encodeEvent(event);
  for (const subscriber of subscribers.values()) {
    if (subscriber.closedAt) {
      continue;
    }
    if (subscriber.companyId !== event.companyId) {
      continue;
    }
    writeToSubscriber(subscriber, chunk);
  }
}

export function whatsappRealtimeStream(companyId: string) {
  const subscriberId = crypto.randomUUID();
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const subscriber: Subscriber = {
        id: subscriberId,
        companyId,
        controller,
        closedAt: null,
      };
      subscribers.set(subscriberId, subscriber);

      // Initial hello so the client knows the stream is live.
      writeToSubscriber(
        subscriber,
        new TextEncoder().encode(
          `event: hello\ndata: ${JSON.stringify({ subscriberId, at: new Date().toISOString() })}\n\n`,
        ),
      );

      // Heartbeat keeps intermediaries (nginx, Cloudflare) from closing idle streams.
      heartbeatTimer = setInterval(() => {
        const active = subscribers.get(subscriberId);
        if (!active) {
          return;
        }
        try {
          active.controller.enqueue(new TextEncoder().encode(`:ping ${Date.now()}\n\n`));
        } catch {
          active.closedAt = Date.now();
          subscribers.delete(subscriberId);
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
          }
        }
      }, 20_000);
    },
    cancel() {
      subscribers.delete(subscriberId);
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    },
  });

  return stream;
}

export function getWhatsappRealtimeStats() {
  return {
    subscribers: subscribers.size,
  };
}
