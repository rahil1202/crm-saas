import dynamic from "next/dynamic";

import { LoadingState } from "@/components/ui/page-patterns";

const DashboardPageClient = dynamic(() => import("@/features/dashboard/dashboard-page-client"), {
  loading: () => <LoadingState label="Loading dashboard workspace..." />,
});

export default function DashboardPage() {
  return <DashboardPageClient />;
}
