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
  },
): Promise<T> {
  const env = getFrontendEnv();
  const companyId = getCompanyCookie();
  const storeId = getStoreCookie();
  const hasFormDataBody = typeof FormData !== "undefined" && init?.body instanceof FormData;

  const response = await fetch(`${env.apiUrl}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(hasFormDataBody ? {} : { "Content-Type": "application/json" }),
      ...(companyId ? { "x-company-id": companyId } : {}),
      ...(storeId ? { "x-store-id": storeId } : {}),
      ...(init?.headers ?? {}),
    },
  });

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
      return apiRequest<T>(path, { ...init, skipRefresh: true });
    }
  }

  if (!response.ok || payload.success === false) {
    const error = payload.success === false ? payload.error : { code: "UNKNOWN", message: "Unknown API error" };
    throw new ApiError(response.status, error);
  }

  return payload.data;
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
