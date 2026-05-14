import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/page-patterns";

const WhatsappFlowBuilderHomePage = dynamic(
  () => import("@/features/whatsapp-crm/flow-builder-home-page").then((mod) => mod.WhatsappFlowBuilderHomePage),
  { loading: () => <LoadingState label="Loading WhatsApp flows..." /> },
);

export default function Page() {
  return <WhatsappFlowBuilderHomePage />;
}
