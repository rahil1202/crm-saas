"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, LoaderCircle, ShieldCheck } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAuthMe } from "@/lib/auth-client";
import { getFrontendEnv } from "@/lib/env";
import { clearPendingIntegrationOauthContext, readPendingIntegrationOauthContext } from "@/lib/integration-oauth";
import { clearPendingInviteReferralContext, readPendingInviteReferralContext, savePendingInviteReferralContext } from "@/lib/invite-referral";
import { supabase } from "@/lib/supabase";

function AuthCallbackContent() {
  const env = getFrontendEnv();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const run = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash);
        const code = searchParams.get("code");
        const tokenHash = searchParams.get("token_hash") ?? hashParams.get("token_hash");
        const type = searchParams.get("type") ?? hashParams.get("type");
        const accessTokenFromUrl = searchParams.get("access_token") ?? hashParams.get("access_token");
        const refreshTokenFromUrl = searchParams.get("refresh_token") ?? hashParams.get("refresh_token");
        const inviteTokenFromUrl = searchParams.get("inviteToken");
        const referralCodeFromUrl = searchParams.get("referralCode");
        const pendingContext = readPendingInviteReferralContext();
        const inviteToken = inviteTokenFromUrl ?? pendingContext.inviteToken ?? null;
        const referralCode = referralCodeFromUrl ?? pendingContext.referralCode ?? null;

        savePendingInviteReferralContext({
          inviteToken,
          referralCode,
        });

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        } else if (accessTokenFromUrl && refreshTokenFromUrl) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessTokenFromUrl,
            refresh_token: refreshTokenFromUrl,
          });
          if (setSessionError) {
            throw setSessionError;
          }
        } else if (tokenHash && type) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as "signup" | "magiclink" | "recovery" | "email_change",
          });
          if (verifyError) {
            throw verifyError;
          }
        }

        if (window.location.hash) {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        }

        if (type === "recovery") {
          router.replace("/reset-password");
          return;
        }

        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        const pendingIntegrationOauth = readPendingIntegrationOauthContext();
        const providerAccessToken = data.session?.provider_token;
        const providerRefreshToken = data.session?.provider_refresh_token;
        if (!accessToken) {
          throw new Error("No verified Supabase session found");
        }
        const session = data.session;
        if (!session) {
          throw new Error("No verified Supabase session found");
        }

        if (pendingIntegrationOauth) {
          if (!providerAccessToken) {
            throw new Error("OAuth provider token was not returned by Supabase");
          }

          const linkResponse = await fetch(`${env.apiUrl}/api/v1/settings/integrations/oauth/link`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              channel: pendingIntegrationOauth.channel,
              provider: pendingIntegrationOauth.provider,
              scopes: pendingIntegrationOauth.scopes,
              providerAccessToken,
              providerRefreshToken: providerRefreshToken ?? null,
              account: {
                email: session.user.email ?? null,
                name:
                  (typeof session.user.user_metadata?.full_name === "string" && session.user.user_metadata.full_name) ||
                  (typeof session.user.user_metadata?.name === "string" && session.user.user_metadata.name) ||
                  null,
                handle:
                  (typeof session.user.user_metadata?.user_name === "string" && session.user.user_metadata.user_name) ||
                  (typeof session.user.user_metadata?.preferred_username === "string" && session.user.user_metadata.preferred_username) ||
                  null,
                providerUserId: session.user.id,
              },
            }),
          });

          if (!linkResponse.ok) {
            throw new Error("Failed to link OAuth integration to the current workspace");
          }

          await supabase.auth.signOut();
          clearPendingIntegrationOauthContext();
          if (!disposed) {
            router.replace(`${pendingIntegrationOauth.returnPath}?oauth=success&provider=${pendingIntegrationOauth.provider}`);
          }
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
            inviteToken,
            referralCode,
          }),
        });

        if (!exchangeResponse.ok) {
          throw new Error("Backend session exchange failed");
        }

        await supabase.auth.signOut();
        clearPendingIntegrationOauthContext();
        clearPendingInviteReferralContext();

        const me = await fetchAuthMe();
        if (!disposed) {
          router.replace(me?.needsOnboarding ? "/onboarding" : "/dashboard");
        }
      } catch (caughtError) {
        clearPendingIntegrationOauthContext();
        if (!disposed) {
          setError(caughtError instanceof Error ? caughtError.message : "Authentication callback failed");
        }
      }
    };

    void run();

    return () => {
      disposed = true;
    };
  }, [env.apiUrl, router, searchParams]);

  return (
    <AuthShell
      badge="Auth callback"
      title="Completing secure verification"
      description="The callback normalizes Supabase verification flows, then routes the user into recovery, onboarding, or the dashboard."
    >
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Callback failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <Card className="border-border/60 bg-muted/25">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck />
              <CardTitle className="text-base">Verifying session</CardTitle>
            </div>
            <CardDescription>Finalizing the verified session and computing the next route.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      )}
    </AuthShell>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <AuthShell
          badge="Auth callback"
          title="Completing secure verification"
          description="Finalizing your session and determining whether to continue to recovery, onboarding, or the dashboard."
        >
          <Alert>
            <LoaderCircle className="animate-spin" />
            <AlertTitle>Working on it</AlertTitle>
            <AlertDescription>Completing the callback and preparing the next screen.</AlertDescription>
          </Alert>
        </AuthShell>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
