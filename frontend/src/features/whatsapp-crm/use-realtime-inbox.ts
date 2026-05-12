"use client";

import { useEffect, useRef } from "react";

import { getCompanyCookie } from "@/lib/cookies";
import { getFrontendEnv } from "@/lib/env";
import type { RealtimeInboxEvent } from "@/features/whatsapp-crm/types";

/**
 * Subscribe to the backend SSE stream at /api/v1/whatsapp/realtime.
 *
 * The backend publishes inbox events (message.created, message.status,
 * conversation.updated, conversation.note, conversation.typing, contact.updated)
 * for the authenticated tenant. This hook wires those events into React.
 *
 * Transport notes:
 *   - Uses native EventSource. Browsers auto-reconnect with exponential backoff.
 *   - Connects only when `enabled` is true so hidden tabs or logged-out sessions
 *     don't hold an open socket.
 *   - The "hello" bootstrap event from the server is swallowed.
 *   - Cookies (auth + tenant) ride along via `withCredentials: true`.
 */
export function useRealtimeInbox(
  handler: (event: RealtimeInboxEvent) => void,
  options: { enabled?: boolean } = {},
): void {
  const { enabled = true } = options;
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const env = getFrontendEnv();
    const companyId = getCompanyCookie();
    if (!companyId) {
      return;
    }

    const url = `${env.apiUrl}/api/v1/whatsapp/realtime`;
    const source = new EventSource(url, { withCredentials: true });

    const dispatch = (type: RealtimeInboxEvent["type"]) => (event: MessageEvent) => {
      try {
        const parsed = event.data ? (JSON.parse(event.data) as Record<string, unknown>) : {};
        handlerRef.current({ type, ...parsed } as RealtimeInboxEvent);
      } catch {
        // Ignore malformed events; the stream keeps running.
      }
    };

    source.addEventListener("hello", dispatch("hello"));
    source.addEventListener("message.created", dispatch("message.created"));
    source.addEventListener("message.status", dispatch("message.status"));
    source.addEventListener("conversation.updated", dispatch("conversation.updated"));
    source.addEventListener("conversation.assigned", dispatch("conversation.assigned"));
    source.addEventListener("conversation.note", dispatch("conversation.note"));
    source.addEventListener("conversation.typing", dispatch("conversation.typing"));
    source.addEventListener("contact.updated", dispatch("contact.updated"));

    return () => {
      source.close();
    };
  }, [enabled]);
}
