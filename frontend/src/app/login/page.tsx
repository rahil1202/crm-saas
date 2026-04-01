import Link from "next/link";

export default function LoginPage() {
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
          Authentication UI will live entirely inside <code>crm-saas/frontend</code>.
        </p>
        <Link href="/dashboard">Go to workspace skeleton</Link>
      </section>
    </main>
  );
}
