import { AppShell } from "@/components/app-shell";
import { ModuleCard } from "@/components/module-card";
import { crmModules } from "@/features/crm/modules";

export default function DashboardPage() {
  return (
    <AppShell
      title="CRM Dashboard"
      description="Module-oriented workspace scaffold for the standalone CRM SaaS product."
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
        }}
      >
        {crmModules.map((module) => (
          <ModuleCard key={module.slug} title={module.title} summary={module.summary}>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {module.capabilities.map((capability) => (
                <li key={capability}>{capability}</li>
              ))}
            </ul>
          </ModuleCard>
        ))}
      </div>
    </AppShell>
  );
}
