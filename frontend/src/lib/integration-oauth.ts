"use client";

export type IntegrationOauthProvider = "google" | "azure" | "linkedin_oidc";
export type IntegrationOauthChannel = "email" | "linkedin";

export interface PendingIntegrationOauthContext {
  channel: IntegrationOauthChannel;
  provider: IntegrationOauthProvider;
  returnPath: string;
  scopes: string[];
}

const STORAGE_KEY = "crm_pending_integration_oauth";

export function savePendingIntegrationOauthContext(value: PendingIntegrationOauthContext) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function readPendingIntegrationOauthContext(): PendingIntegrationOauthContext | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PendingIntegrationOauthContext;
  } catch {
    return null;
  }
}

export function clearPendingIntegrationOauthContext() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
