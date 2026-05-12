import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/page-patterns";

const WhatsappCrmIntegrationsPage = dynamic(
  () => import("@/features/whatsapp-crm/integrations-page").then((mod) => mod.WhatsappCrmIntegrationsPage),
  { loading: () => <LoadingState label="Loading integrations..." /> },
);

export default function Page() {
  return <WhatsappCrmIntegrationsPage />;
}
