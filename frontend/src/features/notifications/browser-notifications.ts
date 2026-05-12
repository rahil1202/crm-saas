/**
 * Browser (Web) Notification utilities.
 *
 * Handles permission requests, persisting per-user preferences, and
 * dispatching native browser notifications when CRM events arrive.
 */

export type BrowserNotificationPermission = "default" | "granted" | "denied";

/** Storage key for per-user browser notification preferences */
const PREFS_KEY = "crm:browser-notification-prefs";

export interface BrowserNotificationPrefs {
  /** Master switch – user opted in to browser notifications */
  enabled: boolean;
  /** Individual category toggles */
  categories: {
    leads: boolean;
    deals: boolean;
    tasks: boolean;
    campaigns: boolean;
  };
}

const DEFAULT_PREFS: BrowserNotificationPrefs = {
  enabled: true,
  categories: {
    leads: true,
    deals: true,
    tasks: true,
    campaigns: true,
  },
};

/** Returns the current browser Notification API permission state */
export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  return Notification.permission as BrowserNotificationPermission;
}

/** Returns true if the browser supports the Notification API */
export function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Requests browser notification permission from the user.
 * Returns the resulting permission state.
 */
export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (!isBrowserNotificationSupported()) {
    return "denied";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  if (Notification.permission === "denied") {
    return "denied";
  }

  try {
    const result = await Notification.requestPermission();
    return result as BrowserNotificationPermission;
  } catch {
    return "denied";
  }
}

/** Loads saved browser notification preferences from localStorage */
export function loadBrowserNotificationPrefs(): BrowserNotificationPrefs {
  if (typeof window === "undefined") {
    return { ...DEFAULT_PREFS };
  }

  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) {
      return { ...DEFAULT_PREFS };
    }

    const parsed = JSON.parse(raw) as Partial<BrowserNotificationPrefs>;
    return {
      enabled: parsed.enabled ?? DEFAULT_PREFS.enabled,
      categories: {
        leads: parsed.categories?.leads ?? DEFAULT_PREFS.categories.leads,
        deals: parsed.categories?.deals ?? DEFAULT_PREFS.categories.deals,
        tasks: parsed.categories?.tasks ?? DEFAULT_PREFS.categories.tasks,
        campaigns: parsed.categories?.campaigns ?? DEFAULT_PREFS.categories.campaigns,
      },
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/** Persists browser notification preferences to localStorage */
export function saveBrowserNotificationPrefs(prefs: BrowserNotificationPrefs): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export type NotificationCategory = "leads" | "deals" | "tasks" | "campaigns";

/** Maps CRM notification types to preference category keys */
function typeToCategory(type: string): NotificationCategory | null {
  if (type === "lead") return "leads";
  if (type === "deal") return "deals";
  if (type === "task") return "tasks";
  if (type === "campaign") return "campaigns";
  return null;
}

/**
 * Shows a native browser notification if:
 * - Permission is granted
 * - The master switch is on
 * - The category for this notification type is enabled
 */
export function showBrowserNotification(input: {
  type: string;
  title: string;
  message: string;
  href?: string | null;
}): void {
  if (!isBrowserNotificationSupported()) {
    return;
  }

  if (Notification.permission !== "granted") {
    return;
  }

  const prefs = loadBrowserNotificationPrefs();

  if (!prefs.enabled) {
    return;
  }

  const category = typeToCategory(input.type);
  if (category && !prefs.categories[category]) {
    return;
  }

  const notification = new Notification(input.title, {
    body: input.message,
    icon: "/favicon.ico",
    tag: `crm-${input.type}-${Date.now()}`,
  });

  if (input.href) {
    notification.onclick = () => {
      window.focus();
      window.location.href = input.href!;
    };
  }
}
