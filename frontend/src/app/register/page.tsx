"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { getFrontendEnv } from "@/lib/env";

export default function RegisterPage() {
  const env = getFrontendEnv();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessEmail(null);

    const response = await fetch(`${env.apiUrl}/api/v1/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName,
        email,
        password,
        confirmPassword,
      }),
    });

    if (!response.ok) {
      let message = "Registration failed";
      try {
        const json = (await response.json()) as { error?: { message?: string } };
        message = json.error?.message ?? message;
      } catch {
        // ignore
      }
      setError(message);
      setLoading(false);
      return;
    }

    setSuccessEmail(email);
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
          maxWidth: 460,
          boxShadow: "0 12px 30px rgba(0, 0, 0, 0.08)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>Create account</h1>
        <p style={{ color: "#556371" }}>
          Register with email and password. Supabase will send a verification link, then you will complete onboarding here.
        </p>

        {successEmail ? (
          <div style={{ padding: 14, borderRadius: 12, background: "#f4fbf6", border: "1px solid #cde8d2", color: "#214c2f" }}>
            Verification email sent to <strong>{successEmail}</strong>. Open the magic link, then continue with onboarding.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Full name" required style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email" required style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" required style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
            <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" placeholder="Confirm password" required style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />

            {error ? <p style={{ color: "#b02020", margin: 0 }}>{error}</p> : null}

            <button type="submit" disabled={loading} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#102031", color: "#fff", cursor: "pointer" }}>
              {loading ? "Creating account..." : "Register"}
            </button>
          </form>
        )}

        <p style={{ marginTop: 16 }}>
          <Link href="/login">Already have an account?</Link>
        </p>
      </section>
    </main>
  );
}
