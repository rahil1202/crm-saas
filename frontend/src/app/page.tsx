"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function buildCallbackUrlFromHash(hash: string) {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(trimmed);

  if (!params.toString()) {
    return null;
  }

  if (!params.get("access_token") && !params.get("token_hash")) {
    return null;
  }

  return `/auth/callback?${params.toString()}`;
}

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const callbackUrl = buildCallbackUrlFromHash(window.location.hash);
    if (callbackUrl) {
      window.location.replace(callbackUrl);
      return;
    }

    router.replace("/login");
  }, [router]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 420, boxShadow: "0 12px 30px rgba(0, 0, 0, 0.08)" }}>
        <h1 style={{ marginTop: 0 }}>Redirecting</h1>
        <p style={{ color: "#556371" }}>Resolving your authentication state.</p>
      </section>
    </main>
  );
}
