import dynamic from "next/dynamic";

import { LoadingState } from "@/components/ui/page-patterns";

const RecentActivityPageClient = dynamic(() => import("@/features/dashboard/recent-activity-page-client"), {
  loading: () => <LoadingState label="Loading recent activity..." />,
});

export default function RecentActivityPage() {
  return <RecentActivityPageClient />;
}
