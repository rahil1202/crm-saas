import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/page-patterns";

const WhatsappContactsPage = dynamic(
  () => import("@/features/whatsapp-crm/contacts-page").then((mod) => mod.WhatsappContactsPage),
  { loading: () => <LoadingState label="Loading contacts..." /> },
);

export default function Page() {
  return <WhatsappContactsPage />;
}
