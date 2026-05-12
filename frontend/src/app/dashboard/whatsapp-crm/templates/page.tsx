import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/page-patterns";

const WhatsappTemplatesPage = dynamic(
  () => import("@/features/whatsapp-crm/templates-page").then((mod) => mod.WhatsappTemplatesPage),
  { loading: () => <LoadingState label="Loading templates..." /> },
);

export default function Page() {
  return <WhatsappTemplatesPage />;
}
