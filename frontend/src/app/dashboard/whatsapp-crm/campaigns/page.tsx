import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/page-patterns";

const WhatsappCampaignsPage = dynamic(
  () => import("@/features/whatsapp-crm/campaigns-page").then((mod) => mod.WhatsappCampaignsPage),
  { loading: () => <LoadingState label="Loading campaigns..." /> },
);

export default function Page() {
  return <WhatsappCampaignsPage />;
}
