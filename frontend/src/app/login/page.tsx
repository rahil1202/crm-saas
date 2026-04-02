"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Globe, KeyRound, MailCheck, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAuthMe, readApiError, resolveAuthenticatedRoute } from "@/lib/auth-client";
import { getFrontendEnv } from "@/lib/env";
import { supabase } from "@/lib/supabase";

const loginBenefits = [
  "Return to onboarding automatically if the account has not created a workspace yet.",
  "Use Google sign-in for the same verified identity without creating a duplicate route.",
  "Request verification or recovery from this same entry point when needed.",
];

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const env = getFrontendEnv();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const statusMessage = useMemo(() => {
    if (searchParams.get("reset") === "success") {
      return "Password updated. Sign in with your new password.";
    }

    if (searchParams.get("registered") === "success") {
      return "Account created. Verify your email first, then continue here.";
    }

    return null;
  }, [searchParams]);

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      const me = await fetchAuthMe();
      if (me && !disposed) {
        router.replace(me.needsOnboarding ? "/onboarding" : "/dashboard");
        return;
      }

      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken || disposed) {
        setBootstrapping(false);
        return;
      }

      const exchangeResponse = await fetch(`${env.apiUrl}/api/v1/auth/exchange-supabase`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          supabaseAccessToken: accessToken,
        }),
      });

      if (exchangeResponse.ok && !disposed) {
        await supabase.auth.signOut();
        router.replace(await resolveAuthenticatedRoute());
        return;
      }

      if (!disposed) {
        setBootstrapping(false);
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
    };
  }, [env.apiUrl, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const response = await fetch(`${env.apiUrl}/api/v1/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      setError(await readApiError(response, "Login failed"));
      setLoading(false);
      return;
    }

    toast.success("Signed in successfully.");
    router.replace(await resolveAuthenticatedRoute());
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    setInfo(null);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      setError("Enter your email first so the verification link goes to the correct address.");
      return;
    }

    setResendingVerification(true);
    setError(null);
    setInfo(null);

    const response = await fetch(`${env.apiUrl}/api/v1/auth/resend-verification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      setError(await readApiError(response, "Unable to resend verification email"));
      setResendingVerification(false);
      return;
    }

    const message = "Verification email sent. Open the link from your inbox to continue.";
    setInfo(message);
    toast.success(message);
    setResendingVerification(false);
  };

  return (
    <AuthShell
      badge="Sign in"
      title="Access your CRM workspace"
      description="Use your verified email credentials or Google to continue into onboarding or the dashboard."
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <span>Need an account?</span>
          <Link href="/register" className="font-medium text-foreground underline underline-offset-4">
            Create one
          </Link>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {statusMessage ? (
          <Alert>
            <MailCheck />
            <AlertTitle>Status update</AlertTitle>
            <AlertDescription>{statusMessage}</AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Authentication failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {info ? (
          <Alert>
            <MailCheck />
            <AlertTitle>Check your inbox</AlertTitle>
            <AlertDescription>{info}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      {bootstrapping ? (
        <Card className="border-border/60 bg-muted/25">
          <CardHeader>
            <CardTitle className="text-base">Checking existing access</CardTitle>
            <CardDescription>Looking for an active session before rendering the login form.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-11 w-full" />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            <Button type="button" variant="outline" size="lg" disabled={googleLoading} onClick={() => void handleGoogleLogin()}>
              <Globe data-icon="inline-start" />
              {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
            </Button>
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <Separator className="flex-1" />
              <span>Email login</span>
              <Separator className="flex-1" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Work email</FieldLabel>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                <FieldDescription>Use the email address you verified with Supabase.</FieldDescription>
              </Field>
              <Field>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Link href="/forgot-password" className="text-sm font-medium text-foreground underline underline-offset-4">
                    Forgot password?
                  </Link>
                </div>
                <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                <FieldDescription>Your local CRM session is issued after the backend validates this password.</FieldDescription>
              </Field>
            </FieldGroup>

            <div className="flex flex-col gap-3">
              <Button type="submit" size="lg" disabled={loading}>
                <KeyRound data-icon="inline-start" />
                {loading ? "Signing in..." : "Sign in"}
              </Button>
              <Button type="button" variant="ghost" disabled={resendingVerification} onClick={() => void handleResendVerification()}>
                <MailCheck data-icon="inline-start" />
                {resendingVerification ? "Sending verification..." : "Resend verification email"}
              </Button>
            </div>
          </form>

          <Card className="border-border/60 bg-muted/20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck />
                <CardTitle className="text-base">What this sign-in unlocks</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              {loginBenefits.map((benefit) => (
                <div key={benefit} className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3">
                  <Badge variant="secondary">Flow</Badge>
                  <p className="text-sm leading-6 text-muted-foreground">{benefit}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>Need first-time access instead?</span>
        <Link href="/register" className="inline-flex items-center gap-2 font-medium text-foreground underline underline-offset-4">
          Register
          <ArrowRight />
        </Link>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthShell badge="Sign in" title="Access your CRM workspace" description="Loading the authentication surface.">{null}</AuthShell>}>
      <LoginPageContent />
    </Suspense>
  );
}
