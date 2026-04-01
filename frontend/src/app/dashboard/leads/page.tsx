import { AppShell } from "@/components/app-shell";
import { ModuleCard } from "@/components/module-card";

export default function LeadsPage() {
  return (
    <AppShell
      title="Leads"
      description="Lead workspace for intake, assignment, qualification, partner routing, and conversion to deals."
    >
      <ModuleCard
        title="Leads Module Skeleton"
        summary="This area will host the lead list, kanban view, create/edit forms, import flow, scoring, and lead timeline."
      />
    </AppShell>
  );
}
