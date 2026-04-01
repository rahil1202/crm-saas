import { AppShell } from "@/components/app-shell";
import { ModuleCard } from "@/components/module-card";

export default function PartnersPage() {
  return (
    <AppShell
      title="Partners"
      description="Partner organization workspace for external sales operators working assigned leads and deals."
    >
      <ModuleCard
        title="Partners Module Skeleton"
        summary="This area will host partner companies, partner users, scoped assignments, and partner performance reports."
      />
    </AppShell>
  );
}
