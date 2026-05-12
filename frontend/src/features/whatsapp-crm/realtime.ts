"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Realtime foundation for WhatsApp CRM.
 *
 * Phase 1 ships the subscription surface only. It is intentionally
 * polling-based because the backend already persists every webhook event
 * and message to Supabase Postgres. Later phases can swap the internals
 * for Supabase realtime channels or a dedicated WebSocket gateway without
 * changing call sites.
 *
 * Events shape:
 *   - "whatsapp:message" → new inbound/outbound message
 *   - "whatsapp:status"  → delivery status update
 *   - "whatsapp:webhook" → raw webhook event stored
 *   - "whatsapp:typing"  → typing indicator (reserved)
 */

export type WhatsappRealtimeEvent =
  | { type: "whatsapp:message"; conversationId: string; messageId: string }
  | { type: "whatsapp:status"; conversationId: string; messageId: string; status: string }
  | { type: "whatsapp:webhook"; eventId: string }
  | { type: "whatsapp:typing"; conversationId: string; state: "start" | "stop" };

export interface WhatsappRealtimeOptions {
  /** Poll interval in ms. Ignored once a real websocket transport is wired up. */
  pollIntervalMs?: number;
  /** Run the subscription or disable it (useful for hidden tabs). */
  enabled?: boolean;
}

/**
 * Subscribe to WhatsApp realtime events. Returns a tuple of:
 *   - the latest event (or null)
 *   - a tick counter that increments whenever a new event arrives
 *
 * UI components use the tick counter to invalidate SWR-style caches
 * without coupling to the event payload itself.
 */
export function useWhatsappRealtime(
  handler: (event: WhatsappRealtimeEvent) => void,
  options: WhatsappRealtimeOptions = {},
): { tick: number } {
  const { enabled = true, pollIntervalMs = 15_000 } = options;
  const [tick, setTick] = useState(0);
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    let cancelled = false;
    let intervalId: number | null = null;

    const bus = getRealtimeBus();
    const unsubscribe = bus.subscribe((event) => {
      if (cancelled) {
        return;
      }
      handlerRef.current(event);
      setTick((value) => value + 1);
    });

    const startPolling = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(() => {
        if (cancelled || document.hidden) {
          return;
        }
        bus.tick();
      }, pollIntervalMs);
    };

    const stopPolling = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // Resume polling and immediately tick to catch up
        startPolling();
        bus.tick();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stopPolling();
      unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, pollIntervalMs]);

  return { tick };
}

type Listener = (event: WhatsappRealtimeEvent) => void;

interface RealtimeBus {
  subscribe(listener: Listener): () => void;
  publish(event: WhatsappRealtimeEvent): void;
  tick(): void;
}

let sharedBus: RealtimeBus | null = null;

function getRealtimeBus(): RealtimeBus {
  if (sharedBus) {
    return sharedBus;
  }

  const listeners = new Set<Listener>();

  sharedBus = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    tick() {
      // Phase 1: broadcast a passive tick so subscribers refetch.
      // Replace this with a real transport (Supabase realtime / WS) later.
      for (const listener of listeners) {
        listener({ type: "whatsapp:webhook", eventId: `tick-${Date.now()}` });
      }
    },
  };

  return sharedBus;
}

/**
 * Escape hatch for backend-driven services or tests to push an event
 * into the realtime bus. Exposed for future replacement by a socket layer.
 */
export function publishWhatsappRealtimeEvent(event: WhatsappRealtimeEvent) {
  getRealtimeBus().publish(event);
}
