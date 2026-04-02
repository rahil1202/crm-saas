"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { getFrontendEnv } from "@/lib/env";

interface MeResponse {
  needsOnboarding: boolean;
  user: {
    fullName: string | null;
  };
}

export default function OnboardingPage() {
  const env = getFrontendEnv();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [currency, setCurrency] = useState("INR");

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      const response = await fetch(`${env.apiUrl}/api/v1/auth/me`, {
        credentials: "include",
      });

      if (!response.ok) {
        router.replace("/login");
        return;
      }

      const me = (await response.json()) as { data?: MeResponse };
      if (!disposed) {
        if (!me.data?.needsOnboarding) {
          router.replace("/dashboard");
          return;
        }

        setFullName(me.data.user.fullName ?? "");
        setLoading(false);
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
    };
  }, [env.apiUrl, router]);

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
      let message = "Onboarding failed";
      try {
        const json = (await response.json()) as { error?: { message?: string } };
        message = json.error?.message ?? message;
      } catch {
        // ignore
      }
      setError(message);
      setSubmitting(false);
      return;
    }

    router.replace("/dashboard");
  };

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 520, boxShadow: "0 12px 30px rgba(0, 0, 0, 0.08)" }}>
        <h1 style={{ marginTop: 0 }}>Set up your workspace</h1>
        <p style={{ color: "#556371" }}>Complete your company and owner profile to finish account setup.</p>

        {loading ? (
          <p>Loading onboarding...</p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" required style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
            <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Company name" required style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
            <input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Primary branch / store name" required style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
            <input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Timezone" required style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />
            <input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} placeholder="Currency" required style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #d2d9e0" }} />

            {error ? <p style={{ color: "#b02020", margin: 0 }}>{error}</p> : null}

            <button type="submit" disabled={submitting} style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: "#102031", color: "#fff", cursor: "pointer" }}>
              {submitting ? "Creating workspace..." : "Finish onboarding"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
