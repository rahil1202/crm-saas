import type { ConnectionStatus, ConversationPriority, DeliveryStatus, EngagementStatus } from "./types";

export function formatRelativeTime(input: string | Date | null | undefined): string {
  if (!input) {
    return "—";
  }
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const units: Array<{ ms: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { ms: 60_000, unit: "second" },
    { ms: 3_600_000, unit: "minute" },
    { ms: 86_400_000, unit: "hour" },
    { ms: 7 * 86_400_000, unit: "day" },
    { ms: 30 * 86_400_000, unit: "day" },
    { ms: 365 * 86_400_000, unit: "month" },
    { ms: Infinity, unit: "year" },
  ];

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const { ms, unit } of units) {
    if (abs < ms) {
      const divisor =
        unit === "second"
          ? 1000
          : unit === "minute"
            ? 60_000
            : unit === "hour"
              ? 3_600_000
              : unit === "day"
                ? 86_400_000
                : unit === "month"
                  ? 30 * 86_400_000
                  : 365 * 86_400_000;
      return formatter.format(Math.round(diffMs / divisor), unit);
    }
  }
  return formatter.format(0, "day");
}

export function formatDateTime(input: string | Date | null | undefined): string {
  if (!input) {
    return "—";
  }
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function connectionStatusTone(status: ConnectionStatus): {
  label: string;
  variant: "secondary" | "destructive" | "outline";
} {
  if (status === "ready") {
    return { label: "Ready", variant: "secondary" };
  }
  if (status === "blocked") {
    return { label: "Blocked", variant: "destructive" };
  }
  return { label: "Limited", variant: "outline" };
}

export function eventStatusTone(status: string): { label: string; variant: "secondary" | "destructive" | "outline" } {
  if (status === "processed") {
    return { label: "Processed", variant: "secondary" };
  }
  if (status === "failed") {
    return { label: "Failed", variant: "destructive" };
  }
  if (status === "ignored") {
    return { label: "Ignored", variant: "outline" };
  }
  return { label: status.charAt(0).toUpperCase() + status.slice(1), variant: "outline" };
}

export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Math.abs(value) < 1000) {
    return value.toString();
  }
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function initialsFromName(name: string | null | undefined, fallback = "?"): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return fallback;
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || fallback;
}

export function priorityTone(priority: ConversationPriority): { label: string; className: string } {
  switch (priority) {
    case "urgent":
      return { label: "Urgent", className: "bg-rose-100 text-rose-700" };
    case "high":
      return { label: "High", className: "bg-amber-100 text-amber-800" };
    case "low":
      return { label: "Low", className: "bg-slate-100 text-slate-600" };
    default:
      return { label: "Normal", className: "bg-slate-100 text-slate-700" };
  }
}

export function engagementTone(status: EngagementStatus): { label: string; className: string } {
  switch (status) {
    case "hot":
      return { label: "Hot", className: "bg-rose-100 text-rose-700" };
    case "warm":
      return { label: "Warm", className: "bg-amber-100 text-amber-800" };
    case "dormant":
      return { label: "Dormant", className: "bg-slate-200 text-slate-600" };
    default:
      return { label: "Cold", className: "bg-sky-100 text-sky-700" };
  }
}

export function formatPhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  if (trimmed.startsWith("+")) return trimmed;
  return `+${trimmed}`;
}

export function formatMessageClock(input: string | Date | null | undefined): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = now.toDateString() === date.toDateString();
  if (sameDay) {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  }
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" }).format(date);
}

export function deliveryLabel(status: DeliveryStatus | string): string {
  const normalized = status.toLowerCase();
  if (normalized === "read") return "Read";
  if (normalized === "delivered") return "Delivered";
  if (normalized === "sent") return "Sent";
  if (normalized === "failed") return "Failed";
  if (normalized === "queued") return "Queued";
  return status;
}
