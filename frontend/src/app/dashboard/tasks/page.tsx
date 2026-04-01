import { AppShell } from "@/components/app-shell";
import { ModuleCard } from "@/components/module-card";

export default function TasksPage() {
  return (
    <AppShell
      title="Tasks & Follow-ups"
      description="Execution layer for due work, recurring follow-ups, reminders, and calendar-based selling activity."
    >
      <ModuleCard
        title="Tasks Module Skeleton"
        summary="This area will host task queues, follow-up calendar, overdue monitoring, and assignment workflows."
      />
    </AppShell>
  );
}
