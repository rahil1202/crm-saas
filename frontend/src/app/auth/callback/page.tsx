"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { getFrontendEnv } from "@/lib/env";
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
        const code = searchParams.get("code");
        const tokenHash = searchParams.get("token_hash");
        const type = searchParams.get("type");

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
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

        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (!accessToken) {
          throw new Error("No verified Supabase session found");
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

        if (!exchangeResponse.ok) {
          throw new Error("Backend session exchange failed");
        }

        await supabase.auth.signOut();

        const meResponse = await fetch(`${env.apiUrl}/api/v1/auth/me`, {
          credentials: "include",
        });

        if (!meResponse.ok) {
          throw new Error("Unable to resolve authenticated user");
        }

        const me = (await meResponse.json()) as { data?: { needsOnboarding?: boolean } };
        if (!disposed) {
          router.replace(me.data?.needsOnboarding ? "/onboarding" : "/dashboard");
        }
      } catch (caughtError) {
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
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 12px 30px rgba(0, 0, 0, 0.08)" }}>
        <h1 style={{ marginTop: 0 }}>Completing sign-in</h1>
        {error ? <p style={{ color: "#b02020" }}>{error}</p> : <p style={{ color: "#556371" }}>Verifying your account and creating a secure session.</p>}
      </section>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 12px 30px rgba(0, 0, 0, 0.08)" }}>
            <h1 style={{ marginTop: 0 }}>Completing sign-in</h1>
            <p style={{ color: "#556371" }}>Verifying your account and creating a secure session.</p>
          </section>
        </main>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
