import { getAccessTokenFromCookie, getCompanyCookie, getStoreCookie } from "@/lib/cookies";
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
    token?: string | null;
  },
): Promise<T> {
  const env = getFrontendEnv();
  const token = init?.token ?? getAccessTokenFromCookie();
  const companyId = getCompanyCookie();
  const storeId = getStoreCookie();

  const response = await fetch(`${env.apiUrl}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(companyId ? { "x-company-id": companyId } : {}),
      ...(storeId ? { "x-store-id": storeId } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;

  if (!response.ok || payload.success === false) {
    const error = payload.success === false ? payload.error : { code: "UNKNOWN", message: "Unknown API error" };
    throw new ApiError(response.status, error);
  }

  return payload.data;
}
