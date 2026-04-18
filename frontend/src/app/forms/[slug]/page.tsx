"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Script from "next/script";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, buildApiUrl } from "@/lib/api";
import type { PublicFormResponse } from "@/features/forms/types";
import { getFrontendEnv } from "@/lib/env";

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: {
        sitekey: string;
        callback?: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: () => void;
      }) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

export default function PublicHostedFormPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const env = getFrontendEnv();
  const [form, setForm] = useState<PublicFormResponse | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [submitted, setSubmitted] = useState<{ title: string; body: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReady, setCaptchaReady] = useState(false);
  const [captchaWidgetId, setCaptchaWidgetId] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(buildApiUrl(`/public/forms/${slug}`), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload.success === false) {
        throw new ApiError(response.status, payload.error ?? { code: "UNKNOWN", message: "Unable to load form" });
      }
      const nextForm = payload.data as PublicFormResponse;
      setForm(nextForm);
      setValues(Object.fromEntries(nextForm.schema.map((field) => [field.name, field.type === "checkbox" ? false : ""])));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load hosted form.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!form?.responseSettings.captchaEnabled || !env.turnstileSiteKey || !window.turnstile || captchaWidgetId) {
      return;
    }

    const element = document.getElementById("turnstile-container");
    if (!element) {
      return;
    }

    const widgetId = window.turnstile.render(element, {
      sitekey: env.turnstileSiteKey,
      callback: (token) => setCaptchaToken(token),
      "expired-callback": () => setCaptchaToken(""),
      "error-callback": () => setCaptchaToken(""),
    });
    setCaptchaWidgetId(widgetId);
    setCaptchaReady(true);
  }, [captchaWidgetId, env.turnstileSiteKey, form?.responseSettings.captchaEnabled]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    if (form.responseSettings.captchaEnabled && !captchaToken) {
      setError("Complete the captcha before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(buildApiUrl(`/public/forms/${form.slug}/submit`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values,
          sourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
          websiteDomain: typeof window !== "undefined" ? window.location.hostname : undefined,
          honey: "",
          captchaToken,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) {
        throw new ApiError(response.status, payload.error ?? { code: "UNKNOWN", message: "Unable to submit form" });
      }
      setSubmitted({ title: payload.data.messageTitle, body: payload.data.messageBody });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to submit form.");
    } finally {
      if (window.turnstile && captchaWidgetId) {
        window.turnstile.reset(captchaWidgetId);
      }
      setCaptchaToken("");
      setSubmitting(false);
    }
  };

  if (loading) {
    return <main className="mx-auto max-w-4xl p-8 text-sm text-slate-500">Loading form...</main>;
  }

  if (error || !form) {
    return (
      <main className="mx-auto max-w-4xl p-8">
        <Alert variant="destructive">
          <AlertTitle>Hosted form unavailable</AlertTitle>
          <AlertDescription>{error ?? "This form is unavailable."}</AlertDescription>
        </Alert>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="mx-auto max-w-4xl p-8">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-900">{submitted.title}</h1>
          <p className="mt-4 text-slate-600">{submitted.body}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-5 md:p-10" style={{ backgroundColor: form.themeSettings.backgroundColor }}>
      {form.responseSettings.captchaEnabled && env.turnstileSiteKey ? (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      ) : null}
      <form onSubmit={onSubmit} className="mx-auto max-w-5xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <input type="text" name="company_website" autoComplete="off" tabIndex={-1} className="hidden" aria-hidden="true" />
        <div className="mb-8 grid gap-2">
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-900">{form.themeSettings.heading || form.name}</h1>
          <p className="text-lg text-slate-500">{form.themeSettings.subheading}</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {form.schema.map((field) => (
            <div key={field.id} className={field.width === "full" ? "md:col-span-2" : ""}>
              <label className="mb-2 block text-sm font-medium text-slate-700">{field.label}{field.required ? " *" : ""}</label>
              {field.type === "textarea" ? (
                <textarea className="min-h-40 w-full rounded-none border border-slate-300 px-4 py-3 text-lg outline-none focus:border-sky-400" placeholder={field.placeholder} value={String(values[field.name] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />
              ) : field.type === "select" ? (
                <select className="h-12 w-full rounded-none border border-slate-300 px-4 text-lg outline-none focus:border-sky-400" value={String(values[field.name] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}>
                  <option value="">{field.placeholder || "Select an option"}</option>
                  {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : field.type === "radio" ? (
                <div className="flex flex-wrap gap-4 rounded-none border border-slate-300 px-4 py-3">
                  {(field.options ?? []).map((option) => (
                    <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="radio" name={field.name} checked={values[field.name] === option} onChange={() => setValues((current) => ({ ...current, [field.name]: option }))} />
                      {option}
                    </label>
                  ))}
                </div>
              ) : field.type === "checkbox" ? (
                <label className="flex h-12 items-center gap-2 rounded-none border border-slate-300 px-4 text-sm text-slate-700">
                  <input type="checkbox" checked={Boolean(values[field.name])} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.checked }))} />
                  {field.helpText || field.label}
                </label>
              ) : (
                <input type={field.type === "phone" ? "tel" : field.type} className="h-12 w-full rounded-none border border-slate-300 px-4 text-lg outline-none focus:border-sky-400" placeholder={field.placeholder} value={String(values[field.name] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} />
              )}
            </div>
          ))}
        </div>
        {error ? (
          <Alert variant="destructive" className="mt-5">
            <AlertTitle>Submission failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {form.responseSettings.captchaEnabled ? (
          env.turnstileSiteKey ? (
            <div className="mt-5">
              <div id="turnstile-container" />
              {!captchaReady ? <div className="mt-2 text-sm text-slate-500">Loading captcha...</div> : null}
            </div>
          ) : (
            <Alert className="mt-5" variant="destructive">
              <AlertTitle>Captcha unavailable</AlertTitle>
              <AlertDescription>This form requires captcha, but the public site key is not configured.</AlertDescription>
            </Alert>
          )
        ) : null}
        <Button type="submit" disabled={submitting} className="mt-5 h-12 w-full text-lg" style={{ backgroundColor: form.themeSettings.primaryColor }}>
          {submitting ? "Submitting..." : form.themeSettings.submitButtonText}
        </Button>
      </form>
    </main>
  );
}
