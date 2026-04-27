import dynamic from "next/dynamic";

import { LoadingState } from "@/components/ui/page-patterns";

const HealthPageClient = dynamic(() => import("@/features/dashboard/health-page-client"), {
  loading: () => <LoadingState label="Loading health workspace..." />,
});

export default function HealthPage() {
  return <HealthPageClient />;
}
