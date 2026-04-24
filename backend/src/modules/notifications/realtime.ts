type NotificationRealtimeScope = "company" | "user";

interface NotificationRealtimeEvent {
  scope: NotificationRealtimeScope;
  companyId: string;
  userId?: string;
  event: "changed";
  reason:
    | "created"
    | "updated"
    | "deleted"
    | "read"
    | "read_all"
    | "legacy_read"
    | "legacy_read_all";
  at: string;
}

type NotificationRealtimeListener = (event: NotificationRealtimeEvent) => void;

type ListenerRecord = {
  companyId: string;
  userId: string;
  listener: NotificationRealtimeListener;
};

const realtimeListeners = new Set<ListenerRecord>();

export function subscribeNotificationRealtime(input: {
  companyId: string;
  userId: string;
  listener: NotificationRealtimeListener;
}) {
  const record: ListenerRecord = {
    companyId: input.companyId,
    userId: input.userId,
    listener: input.listener,
  };

  realtimeListeners.add(record);

  return () => {
    realtimeListeners.delete(record);
  };
}

function emitNotificationRealtime(event: NotificationRealtimeEvent) {
  for (const subscriber of realtimeListeners) {
    if (subscriber.companyId !== event.companyId) {
      continue;
    }

    if (event.scope === "user" && event.userId !== subscriber.userId) {
      continue;
    }

    subscriber.listener(event);
  }
}

export function publishNotificationCompanyChanged(input: {
  companyId: string;
  reason: NotificationRealtimeEvent["reason"];
}) {
  emitNotificationRealtime({
    scope: "company",
    companyId: input.companyId,
    event: "changed",
    reason: input.reason,
    at: new Date().toISOString(),
  });
}

export function publishNotificationUserChanged(input: {
  companyId: string;
  userId: string;
  reason: NotificationRealtimeEvent["reason"];
}) {
  emitNotificationRealtime({
    scope: "user",
    companyId: input.companyId,
    userId: input.userId,
    event: "changed",
    reason: input.reason,
    at: new Date().toISOString(),
  });
}
