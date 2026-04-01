import { AppShell } from "@/components/app-shell";
import { ModuleCard } from "@/components/module-card";

export default function CustomersPage() {
  return (
    <AppShell
      title="Customers"
      description="Customer profiles with timeline history across leads, deals, tasks, campaigns, notes, and files."
    >
      <ModuleCard
        title="Customers Module Skeleton"
        summary="This area will host the customer directory, profile pages, custom fields, tags, and attachments."
      />
    </AppShell>
  );
}
