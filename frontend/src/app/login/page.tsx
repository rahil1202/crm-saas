"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { KeyRound, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth/auth-shell";
import { FormErrorSummary, FormSection } from "@/components/forms/form-primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { GoogleIcon } from "@/components/ui/google-icon";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAuthMe, resolveAuthenticatedRoute } from "@/lib/auth-client";
import { clearCachedMe } from "@/lib/me-cache";
import { resolveAuthenticatedRouteFromMe } from "@/lib/partner-access";
import { useAsyncForm } from "@/hooks/use-async-form";
import { apiRequest } from "@/lib/api";
import { getFrontendEnv } from "@/lib/env";
import { clearPendingIntegrationOauthContext } from "@/lib/integration-oauth";
import { clearPendingInviteReferralContext, readPendingInviteReferralContext, savePendingInviteReferralContext } from "@/lib/invite-referral";
import { supabase } from "@/lib/supabase";
import { requestBrowserNotificationPermission } from "@/features/notifications/browser-notifications";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const env = getFrontendEnv();
  const inviteTokenFromUrl = searchParams.get("inviteToken");
  const referralCodeFromUrl = searchParams.get("referralCode");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [info, setInfo] = useState<string | null>(null);
  const { submitting, formError, fieldErrors, clearFieldError, runSubmit } = useAsyncForm();

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
    if (inviteTokenFromUrl || referralCodeFromUrl) {
      savePendingInviteReferralContext({
        inviteToken: inviteTokenFromUrl,
        referralCode: referralCodeFromUrl,
      });
    }
  }, [inviteTokenFromUrl, referralCodeFromUrl]);

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      try {
        const me = await fetchAuthMe();
        if (me && !disposed) {
          router.replace(resolveAuthenticatedRouteFromMe(me));
          return;
        }
      } catch {
        // fetchAuthMe never throws now, but guard anyway
      }

      // Try to exchange a lingering Supabase session (e.g. after Google OAuth)
      try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        const storedPendingInviteReferral = readPendingInviteReferralContext();
        const pendingInviteReferral = {
          inviteToken: inviteTokenFromUrl ?? storedPendingInviteReferral.inviteToken,
          referralCode: referralCodeFromUrl ?? storedPendingInviteReferral.referralCode,
        };
        if (accessToken && !disposed) {
          const exchangeResponse = await fetch(`${env.apiUrl}/api/v1/auth/exchange-supabase`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              supabaseAccessToken: accessToken,
              inviteToken: pendingInviteReferral.inviteToken,
              referralCode: pendingInviteReferral.referralCode,
            }),
            signal: AbortSignal.timeout(8000),
          });

          if (exchangeResponse.ok && !disposed) {
            const exchangePayload = (await exchangeResponse.json()) as { data?: { inviteAccepted?: boolean } };
            await supabase.auth.signOut().catch(() => null);
            clearPendingInviteReferralContext();
            clearCachedMe();
            router.replace(exchangePayload.data?.inviteAccepted ? "/company-onboarding-tour" : await resolveAuthenticatedRoute());
            return;
          }
        }
      } catch {
        // Supabase down or network error — fall through to show the login form
      }

      if (!disposed) {
        setBootstrapping(false);
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
    };
  }, [env.apiUrl, inviteTokenFromUrl, referralCodeFromUrl, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInfo(null);

    try {
      const storedPendingInviteReferral = readPendingInviteReferralContext();
      const pendingInviteReferral = {
        inviteToken: inviteTokenFromUrl ?? storedPendingInviteReferral.inviteToken,
        referralCode: referralCodeFromUrl ?? storedPendingInviteReferral.referralCode,
      };
      let inviteAccepted = false;
      await runSubmit(
        async () => {
          const response = await apiRequest<{ inviteAccepted?: boolean; inviteError?: string | null }>("/auth/login", {
            method: "POST",
            body: JSON.stringify({
              email,
              password,
              inviteToken: pendingInviteReferral.inviteToken,
              referralCode: pendingInviteReferral.referralCode,
            }),
          });
          inviteAccepted = response.inviteAccepted === true;
          if (response.inviteError) {
            toast.warning(response.inviteError);
          }
          return response;
        },
        "Login failed",
      );
      toast.success("Signed in successfully.");
      clearPendingInviteReferralContext();
      clearCachedMe();
      // Ask for browser notification permission after a successful login
      void requestBrowserNotificationPermission();
      router.replace(inviteAccepted ? "/company-onboarding-tour" : await resolveAuthenticatedRoute());
    } catch {
      return;
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setInfo(null);
    clearPendingIntegrationOauthContext();

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (oauthError) {
      setInfo(null);
      setGoogleLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      setInfo("Enter your email first so the verification link goes to the correct address.");
      return;
    }

    setResendingVerification(true);
    setInfo(null);

    try {
      await apiRequest("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    } catch {
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
      title="Access your CRM workspace"
      description="Sign in to manage your sales pipeline, track customer interactions, and grow your business."
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <span>Need an account?</span>
          <Link href="/auth/register" className="font-medium text-foreground underline underline-offset-4">
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

        <FormErrorSummary title="Authentication failed" error={formError} />

        {info ? (
          <Alert>
            <MailCheck />
            <AlertTitle>Check your inbox</AlertTitle>
            <AlertDescription>{info}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      {bootstrapping ? (
        <Card className="border-border/60 bg-secondary/35">
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
          <div className="grid gap-4">
            <Button type="button" variant="outline" size="lg" disabled={googleLoading} onClick={() => void handleGoogleLogin()}>
              <GoogleIcon className="size-4.5 shrink-0" />
              {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
            </Button>
            <p className="text-xs text-muted-foreground">
              By continuing with Google you accept our <Link href="/terms-and-condition" className="underline underline-offset-4">terms and condition</Link> and <Link href="/privacy-policy" className="underline underline-offset-4">privacy policy</Link>.
            </p>
            <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <Separator className="flex-1" />
              <span>Email login</span>
              <Separator className="flex-1" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <FormSection>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      clearFieldError("email");
                      setEmail(event.target.value);
                    }}
                    required
                    className="border-sky-200/90 focus-visible:border-sky-400 focus-visible:ring-sky-100"
                  />
                  <FieldError errors={fieldErrors.email?.map((message) => ({ message }))} />
                </Field>
                <Field>
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Link href="/auth/forgot-password" className="text-sm font-medium text-foreground underline underline-offset-4">
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      clearFieldError("password");
                      setPassword(event.target.value);
                    }}
                    required
                    className="border-blue-200/90 focus-visible:border-blue-400 focus-visible:ring-blue-100"
                  />
                  <FieldError errors={fieldErrors.password?.map((message) => ({ message }))} />
                </Field>
              </FieldGroup>
            </FormSection>

            <div className="flex flex-col gap-3">
              <Button type="submit" size="lg" disabled={submitting}>
                <KeyRound data-icon="inline-start" />
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </div>
          </form>

        </>
      )}

      {/* <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>Need first-time access instead?</span>
        <Link href="/auth/register" className="inline-flex items-center gap-2 font-medium text-foreground underline underline-offset-4">
          Register
          <ArrowRight />
        </Link>
      </div> */}
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
