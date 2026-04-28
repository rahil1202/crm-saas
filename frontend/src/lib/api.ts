import { getCompanyCookie, getStoreCookie } from "@/lib/cookies";
import { getFrontendEnv } from "@/lib/env";

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiFailure {
  success: false;
  error: ApiErrorPayload;
}

export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.code = payload.code;
    this.details = payload.details;
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  init?: Omit<RequestInit, "headers"> & {
    headers?: Record<string, string>;
    skipRefresh?: boolean;
    skipCache?: boolean;
    cacheTtlMs?: number;
  },
): Promise<T> {
  const env = getFrontendEnv();
  const companyId = getCompanyCookie();
  const storeId = getStoreCookie();
  const hasFormDataBody = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const method = (init?.method ?? "GET").toUpperCase();

  const cacheKey = `${env.apiUrl}/api/v1${path}|${companyId ?? ""}|${storeId ?? ""}`;
  const shouldCache = method === "GET" && !init?.skipCache && !hasFormDataBody;
  const pathKey = path.split("?")[0];
  const ttlMs = init?.cacheTtlMs ?? cacheTtlByPath[pathKey] ?? 10_000;

  if (shouldCache) {
    const cached = apiCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T;
    }
    const inFlight = apiInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight as Promise<T>;
    }
  }

  const requestPromise = fetch(`${env.apiUrl}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(hasFormDataBody ? {} : { "Content-Type": "application/json" }),
      ...(companyId ? { "x-company-id": companyId } : {}),
      ...(storeId ? { "x-store-id": storeId } : {}),
      ...(init?.headers ?? {}),
    },
  }).then(async (response) => {
    const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;

    if (response.status === 401 && !init?.skipRefresh && path !== "/auth/refresh") {
      const refreshResponse = await fetch(`${env.apiUrl}/api/v1/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (refreshResponse.ok) {
        return apiRequest<T>(path, { ...init, skipRefresh: true, skipCache: true });
      }
    }

    if (!response.ok || payload.success === false) {
      const error = payload.success === false ? payload.error : { code: "UNKNOWN", message: "Unknown API error" };
      throw new ApiError(response.status, error);
    }

    return payload.data;
  });

  if (shouldCache) {
    apiInFlight.set(cacheKey, requestPromise);
  }

  try {
    const data = await requestPromise;
    if (shouldCache) {
      apiCache.set(cacheKey, { data, expiresAt: Date.now() + ttlMs });
    }
    return data;
  } finally {
    if (shouldCache) {
      apiInFlight.delete(cacheKey);
    }
  }
}

export function buildApiUrl(path: string, query?: Record<string, string | null | undefined>) {
  const env = getFrontendEnv();
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) {
      params.set(key, value);
    }
  }

  const suffix = params.toString();
  return `${env.apiUrl}/api/v1${path}${suffix ? `?${suffix}` : ""}`;
}

const apiCache = new Map<string, { data: unknown; expiresAt: number }>();
const apiInFlight = new Map<string, Promise<unknown>>();

const cacheTtlByPath: Record<string, number> = {
  "/reports/dashboard": 30_000,
  "/reports/summary": 30_000,
  "/deals/forecast": 30_000,
  "/tasks/summary": 20_000,
  "/tasks/reminders": 20_000,
  "/tasks/follow-ups": 20_000,
  "/leads": 15_000,
  "/customers": 20_000,
  "/partners": 30_000,
  "/partners/users": 30_000,
  "/campaigns/email-accounts": 20_000,
  "/campaigns/delivery-log": 20_000,
  "/chatbot-flows/list": 30_000,
  "/settings/integration-hub": 30_000,
  "/settings/integrations": 30_000,
  "/settings/pipelines": 30_000,
  "/settings/lead-sources": 30_000,
  "/settings/company-preferences": 30_000,
  "/settings/custom-fields": 30_000,
  "/settings/tags": 30_000,
  "/settings/notification-rules": 30_000,
  "/settings/runtime-readiness": 30_000,
  "/companies/current": 30_000,
  "/companies/current/plan": 30_000,
  "/admin/summary": 30_000,
  "/social/accounts": 20_000,
  "/social/whatsapp/log": 20_000,
  "/users/current-company": 30_000,
  "/notifications": 10_000,
  "/documents": 20_000,
  "/outreach/dashboard": 20_000,
  "/outreach/accounts": 15_000,
  "/outreach/contacts": 15_000,
  "/outreach/lists": 15_000,
  "/settings/outreach-agent": 20_000,
};
