"use client";

export type IntegrationOauthProvider = "google" | "azure" | "linkedin_oidc";
export type IntegrationOauthChannel = "email" | "linkedin";

export interface PendingIntegrationOauthContext {
  channel: IntegrationOauthChannel;
  provider: IntegrationOauthProvider;
  returnPath: string;
  scopes: string[];
  createdAt?: number;
}

const STORAGE_KEY = "crm_pending_integration_oauth";
const MAX_AGE_MS = 10 * 60 * 1000;

export function savePendingIntegrationOauthContext(value: PendingIntegrationOauthContext) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...value,
      createdAt: Date.now(),
    }),
  );
  window.localStorage.removeItem(STORAGE_KEY);
}

export function readPendingIntegrationOauthContext(): PendingIntegrationOauthContext | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  window.localStorage.removeItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingIntegrationOauthContext;
    if (!parsed.createdAt || Date.now() - parsed.createdAt > MAX_AGE_MS) {
      clearPendingIntegrationOauthContext();
      return null;
    }
    return parsed;
  } catch {
    clearPendingIntegrationOauthContext();
    return null;
  }
}

export function clearPendingIntegrationOauthContext() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(STORAGE_KEY);
}
