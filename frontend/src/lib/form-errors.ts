import { ApiError } from "@/lib/api";

export interface NormalizedFormError {
  formError: string;
  fieldErrors: Record<string, string[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeFormError(error: unknown, fallback: string): NormalizedFormError {
  if (!(error instanceof ApiError)) {
    return {
      formError: error instanceof Error ? error.message : fallback,
      fieldErrors: {},
    };
  }

  const fieldErrors: Record<string, string[]> = {};
  const details = error.details;

  if (error.code === "VALIDATION_ERROR" && isRecord(details)) {
    const rawFieldErrors = details.fieldErrors;
    if (isRecord(rawFieldErrors)) {
      for (const [field, value] of Object.entries(rawFieldErrors)) {
        if (Array.isArray(value)) {
          const messages = value.filter((item): item is string => typeof item === "string" && item.length > 0);
          if (messages.length > 0) {
            fieldErrors[field] = messages;
          }
        }
      }
    }
  }

  return {
    formError: error.message || fallback,
    fieldErrors,
  };
}
