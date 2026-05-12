import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/page-patterns";

const WhatsappInboxPage = dynamic(
  () => import("@/features/whatsapp-crm/inbox-page").then((mod) => mod.WhatsappInboxPage),
  { loading: () => <LoadingState label="Loading inbox..." /> },
);

export default function Page() {
  return <WhatsappInboxPage />;
}
