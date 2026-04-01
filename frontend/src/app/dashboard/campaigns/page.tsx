import { AppShell } from "@/components/app-shell";
import { ModuleCard } from "@/components/module-card";

export default function CampaignsPage() {
  return (
    <AppShell
      title="Campaigns & Templates"
      description="Outbound communication workspace for audience targeting, templates, scheduling, and analytics."
    >
      <ModuleCard
        title="Campaigns Module Skeleton"
        summary="This area will host email campaigns, future channel support, templates, audience filters, and campaign analytics."
      />
    </AppShell>
  );
}
