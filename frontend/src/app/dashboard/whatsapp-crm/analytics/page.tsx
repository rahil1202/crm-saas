import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/page-patterns";

const WhatsappAnalyticsPage = dynamic(
  () => import("@/features/whatsapp-crm/analytics-page").then((mod) => mod.WhatsappAnalyticsPage),
  { loading: () => <LoadingState label="Loading analytics..." /> },
);

export default function Page() {
  return <WhatsappAnalyticsPage />;
}
