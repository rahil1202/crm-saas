"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { getAccessTokenFromCookie, setAccessTokenCookie } from "@/lib/cookies";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getAccessTokenFromCookie()) {
      router.replace("/dashboard");
    }
  }, [router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    if (data.session?.access_token) {
      setAccessTokenCookie(data.session.access_token);
      router.replace("/dashboard");
      return;
    }

    setError("Login succeeded but no session token was returned.");
    setLoading(false);
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
        <p style={{ color: "#556371" }}>Sign in with your Supabase account to access the CRM workspace.</p>

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

        <p style={{ marginTop: 16 }}>
          <Link href="/">Back to home</Link>
        </p>
      </section>
    </main>
  );
}
