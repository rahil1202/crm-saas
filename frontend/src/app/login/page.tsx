"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { getFrontendEnv } from "@/lib/env";
import { supabase } from "@/lib/supabase";

interface MeResponse {
  needsOnboarding: boolean;
}

export default function LoginPage() {
  const router = useRouter();
  const env = getFrontendEnv();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectAfterBackendSession = async () => {
    const meResponse = await fetch(`${env.apiUrl}/api/v1/auth/me`, {
      credentials: "include",
    });

    if (!meResponse.ok) {
      router.replace("/dashboard");
      return;
    }

    const me = (await meResponse.json()) as { data?: MeResponse };
    router.replace(me.data?.needsOnboarding ? "/onboarding" : "/dashboard");
  };

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      const meResponse = await fetch(`${env.apiUrl}/api/v1/auth/me`, {
        credentials: "include",
      });

      if (meResponse.ok) {
        const me = (await meResponse.json()) as { data?: MeResponse };
        router.replace(me.data?.needsOnboarding ? "/onboarding" : "/dashboard");
        return;
      }

      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken || disposed) {
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
        await redirectAfterBackendSession();
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

    const response = await fetch(`${env.apiUrl}/api/v1/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      let message = "Login failed";
      try {
        const json = (await response.json()) as { error?: { message?: string } };
        message = json.error?.message ?? message;
      } catch {
        // ignore parse errors
      }
      setError(message);
      setLoading(false);
      return;
    }

    await redirectAfterBackendSession();
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
      return;
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <section
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 28,
          width: "100%",
          maxWidth: 420,
          boxShadow: "0 12px 30px rgba(0, 0, 0, 0.08)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Login</h1>
        <p style={{ color: "#556371" }}>
          Email/password and Google OAuth are authenticated by Supabase, then exchanged for local JWT cookies.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }}
            />
          </label>

          {error ? <p style={{ color: "#b02020", margin: 0 }}>{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "none",
              background: "#102031",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void handleGoogleLogin()}
          disabled={googleLoading}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #d2d9e0",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
        </button>

        <p style={{ marginTop: 16 }}>
          <Link href="/register">Create account</Link>
        </p>

        <p style={{ marginTop: 8 }}>
          <Link href="/">Back to home</Link>
        </p>
      </section>
    </main>
  );
}
