"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, Building2, CheckCircle2, LoaderCircle } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { fetchAuthMe, readApiError } from "@/lib/auth-client";
import { getFrontendEnv } from "@/lib/env";

export default function OnboardingPage() {
  const env = getFrontendEnv();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [currency, setCurrency] = useState("INR");

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      const me = await fetchAuthMe();

      if (!me) {
        router.replace("/auth/login");
        return;
      }

      if (!disposed) {
        if (!me.needsOnboarding) {
          router.replace("/dashboard");
          return;
        }

        setFullName(me.user.fullName ?? "");
        setLoading(false);
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
    };
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch(`${env.apiUrl}/api/v1/auth/onboarding`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName,
        companyName,
        storeName,
        timezone,
        currency,
      }),
    });

    if (!response.ok) {
      setError(await readApiError(response, "Onboarding failed"));
      setSubmitting(false);
      return;
    }

    setCompleted(true);
    setSubmitting(false);
    setTimeout(() => {
      router.replace("/dashboard");
    }, 1200);
  };

  return (
    <AuthShell
      badge="Onboarding"
      title="Create the first workspace"
      description="This step creates the owner profile, company record, default branch, and owner membership in one transaction."
    >
      {loading ? (
        <Alert>
          <LoaderCircle className="animate-spin" />
          <AlertTitle>Loading onboarding state</AlertTitle>
          <AlertDescription>Checking whether this account already belongs to a company workspace.</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Onboarding failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {completed ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Workspace created</AlertTitle>
          <AlertDescription>Company setup is complete. Redirecting to the dashboard now.</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="fullName">Owner name</FieldLabel>
              <Input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
              <FieldDescription>This is the full name shown across CRM ownership and assignments.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="companyName">Company name</FieldLabel>
              <Input id="companyName" value={companyName} onChange={(event) => setCompanyName(event.target.value)} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="storeName">Primary branch or store</FieldLabel>
              <Input id="storeName" value={storeName} onChange={(event) => setStoreName(event.target.value)} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
              <Input id="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="currency">Currency</FieldLabel>
              <Input id="currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} required />
            </Field>
          </FieldGroup>

          <Button type="submit" size="lg" disabled={submitting || loading}>
            <Building2 data-icon="inline-start" />
            {submitting ? "Creating workspace..." : "Finish onboarding"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
