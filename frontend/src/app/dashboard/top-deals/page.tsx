import dynamic from "next/dynamic";

import { LoadingState } from "@/components/ui/page-patterns";

const TopDealsPageClient = dynamic(() => import("@/features/dashboard/top-deals-page-client"), {
  loading: () => <LoadingState label="Loading top deals..." />,
});

export default function TopDealsPage() {
  return <TopDealsPageClient />;
}
