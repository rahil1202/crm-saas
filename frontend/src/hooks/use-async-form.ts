"use client";

import { useState } from "react";

import { normalizeFormError } from "@/lib/form-errors";

export function useAsyncForm() {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const resetFormError = () => {
    setFormError(null);
  };

  const clearFieldError = (field: string) => {
    setFieldErrors((current) => {
      if (!(field in current)) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const clearErrors = () => {
    setFormError(null);
    setFieldErrors({});
  };

  const runSubmit = async <T>(action: () => Promise<T>, fallbackMessage: string) => {
    setSubmitting(true);
    clearErrors();

    try {
      const result = await action();
      return result;
    } catch (error) {
      const normalized = normalizeFormError(error, fallbackMessage);
      setFormError(normalized.formError);
      setFieldErrors(normalized.fieldErrors);
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    submitting,
    formError,
    fieldErrors,
    resetFormError,
    clearFieldError,
    clearErrors,
    runSubmit,
  };
}
