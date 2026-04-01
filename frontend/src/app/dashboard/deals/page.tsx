import { AppShell } from "@/components/app-shell";
import { ModuleCard } from "@/components/module-card";

export default function DealsPage() {
  return (
    <AppShell
      title="Deals"
      description="Deal pipeline area for board views, stage movement, forecast value, and won/lost tracking."
    >
      <ModuleCard
        title="Deals Module Skeleton"
        summary="This area will host deal boards, deal details, multiple pipelines, lost reasons, and forecast summaries."
      />
    </AppShell>
  );
}
