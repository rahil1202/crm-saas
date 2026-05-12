import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/page-patterns";

const OutreachDashboardPage = dynamic(
  () => import("@/features/outreach/outreach-dashboard-page").then((mod) => mod.OutreachDashboardPage),
  { loading: () => <LoadingState label="Loading outreach..." /> },
);

export default function OutreachPage() {
  return <OutreachDashboardPage />;
}
