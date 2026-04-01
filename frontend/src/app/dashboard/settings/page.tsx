import { AppShell } from "@/components/app-shell";
import { ModuleCard } from "@/components/module-card";

export default function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      description="Company configuration for pipelines, lead sources, tags, notification rules, branding, and integrations."
    >
      <ModuleCard
        title="Settings Module Skeleton"
        summary="This area will host configuration screens for pipeline settings, custom fields, tags, notification rules, and integrations."
      />
    </AppShell>
  );
}
