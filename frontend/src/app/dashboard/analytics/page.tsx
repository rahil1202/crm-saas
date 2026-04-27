import dynamic from "next/dynamic";

import { LoadingState } from "@/components/ui/page-patterns";

const AnalyticsPageClient = dynamic(() => import("@/features/dashboard/analytics-page-client"), {
  loading: () => <LoadingState label="Loading analytics workspace..." />,
});

export default function AnalyticsPage() {
  return <AnalyticsPageClient />;
}
