import dynamic from "next/dynamic";

import { LoadingState } from "@/components/ui/page-patterns";

const ReportsPageClient = dynamic(() => import("@/features/dashboard/reports-page-client"), {
  loading: () => <LoadingState label="Loading report dashboard..." />,
});

export default function ReportPage() {
  return <ReportsPageClient />;
}
