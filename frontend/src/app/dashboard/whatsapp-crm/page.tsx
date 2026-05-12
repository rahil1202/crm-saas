import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/page-patterns";

const WhatsappCrmDashboardPage = dynamic(
  () => import("@/features/whatsapp-crm/dashboard-page").then((mod) => mod.WhatsappCrmDashboardPage),
  { loading: () => <LoadingState label="Loading WhatsApp dashboard..." /> },
);

export default function Page() {
  return <WhatsappCrmDashboardPage />;
}
