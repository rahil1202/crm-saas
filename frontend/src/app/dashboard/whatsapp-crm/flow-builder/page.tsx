import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/page-patterns";

const WhatsappFlowBuilderPage = dynamic(
  () => import("@/features/whatsapp-crm/flow-builder-page").then((mod) => mod.WhatsappFlowBuilderPage),
  { loading: () => <LoadingState label="Loading flow builder..." /> },
);

export default function Page() {
  return <WhatsappFlowBuilderPage />;
}
