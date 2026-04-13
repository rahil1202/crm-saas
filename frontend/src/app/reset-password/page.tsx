"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { readApiError } from "@/lib/auth-client";
import { evaluatePasswordStrength } from "@/lib/auth-ui";
import { getFrontendEnv } from "@/lib/env";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const env = getFrontendEnv();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [supabaseAccessToken, setSupabaseAccessToken] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string>("");
  const [loadingSession, setLoadingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordStrength = useMemo(
    () =>
      evaluatePasswordStrength(password, {
        email: sessionEmail,
      }),
    [password, sessionEmail],
  );

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token ?? null;
      const email = data.session?.user.email ?? "";

      if (!disposed) {
        setSupabaseAccessToken(accessToken);
        setSessionEmail(email);
        setLoadingSession(false);
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabaseAccessToken) {
      setError("Recovery session missing. Request a new password reset link.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const response = await fetch(`${env.apiUrl}/api/v1/auth/reset-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        supabaseAccessToken,
        password,
        confirmPassword,
      }),
    });

    if (!response.ok) {
      setError(await readApiError(response, "Unable to reset password"));
      setSubmitting(false);
      return;
    }

    await fetch(`${env.apiUrl}/api/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    await supabase.auth.signOut();
    setSuccess(true);
    toast.success("Password updated. Redirecting to sign in.");
    setSubmitting(false);
    setTimeout(() => {
      router.replace("/login?reset=success");
    }, 1200);
  };

  return (
    <AuthShell
      title="Choose a new password"
      description="This screen only works after a verified recovery callback. Once saved, the temporary session is cleared and sign-in starts fresh."
      footer={
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Return to login
        </Link>
      }
    >
      {loadingSession ? (
        <Card className="border-border/60 bg-muted/25">
          <CardHeader>
            <CardTitle className="text-base">Checking recovery session</CardTitle>
            <CardDescription>Verifying the reset link before allowing a password update.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-11 w-full" />
          </CardContent>
        </Card>
      ) : null}

      {!loadingSession && !supabaseAccessToken ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Recovery link unavailable</AlertTitle>
          <AlertDescription>Request a fresh reset email. The current recovery session is missing or expired.</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Password reset failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Password updated</AlertTitle>
          <AlertDescription>Your password has been changed. Redirecting to login now.</AlertDescription>
        </Alert>
      ) : !loadingSession ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="password">New password</FieldLabel>
              <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required className="border-blue-200/90 focus-visible:border-blue-400 focus-visible:ring-blue-100" />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
              <Input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required className="border-blue-200/90 focus-visible:border-blue-400 focus-visible:ring-blue-100" />
              <FieldDescription>
                {confirmPassword.length === 0 ? "Re-enter the password to confirm the reset." : password === confirmPassword ? "Passwords match." : "Passwords do not match yet."}
              </FieldDescription>
            </Field>
          </FieldGroup>

          <div className="rounded-[1.6rem] border border-border/70 bg-secondary/35 p-4">
            <div className="mb-4 text-sm font-medium text-slate-900">Password strength</div>
            <Progress value={password.length === 0 ? 0 : passwordStrength.score}>
              <ProgressLabel>{passwordStrength.label}</ProgressLabel>
              <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                {password.length === 0 ? "0%" : `${passwordStrength.score}%`}
              </span>
            </Progress>
          </div>

          <Button type="submit" size="lg" disabled={submitting || loadingSession || !supabaseAccessToken}>
            <KeyRound data-icon="inline-start" />
            {submitting ? "Saving new password..." : "Save new password"}
          </Button>
        </form>
      ) : null}
    </AuthShell>
  );
}
