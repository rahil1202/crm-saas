import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/deals", label: "Deals" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/tasks", label: "Tasks" },
  { href: "/dashboard/partners", label: "Partners" },
  { href: "/dashboard/campaigns", label: "Campaigns" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function AppShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateColumns: "260px 1fr",
      }}
    >
      <aside
        style={{
          background: "#102031",
          color: "#f5f7fa",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div>
          <div style={{ fontSize: 12, letterSpacing: 1.5, opacity: 0.7 }}>CRM SAAS</div>
          <h2 style={{ margin: "8px 0 0" }}>Workspace</h2>
        </div>
        <nav style={{ display: "grid", gap: 8 }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                color: "inherit",
                textDecoration: "none",
                background: "rgba(255,255,255,0.06)",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <section style={{ padding: 28 }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0 }}>{title}</h1>
          <p style={{ margin: "8px 0 0", color: "#556371" }}>{description}</p>
        </header>
        {children}
      </section>
    </main>
  );
}
