import type { ReactNode } from "react";

export function ModuleCard({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children?: ReactNode;
}) {
  return (
    <article
      style={{
        background: "#fff",
        borderRadius: 16,
        padding: 20,
        boxShadow: "0 10px 24px rgba(16, 32, 49, 0.08)",
      }}
    >
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p style={{ marginBottom: children ? 16 : 0, color: "#556371" }}>{summary}</p>
      {children}
    </article>
  );
}
