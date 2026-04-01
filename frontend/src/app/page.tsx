export default function HomePage() {
  return (
    <main
      style={{
        display: "grid",
        placeItems: "center",
        padding: "48px 24px",
      }}
    >
      <section
        style={{
          maxWidth: 760,
          width: "100%",
          background: "#ffffff",
          borderRadius: 18,
          padding: 32,
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.08)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>CRM SaaS Frontend Workspace</h1>
        <p>
          This app is intentionally isolated under <code>crm-saas/frontend</code>.
        </p>
        <p>
          The existing TalkTime project remains untouched and is not used as a runtime dependency.
        </p>
        <p>
          Initial app routes are available under <code>/dashboard</code> and <code>/login</code>.
        </p>
      </section>
    </main>
  );
}
