import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/page-patterns";

const WhatsappSettingsPage = dynamic(
  () => import("@/features/whatsapp-crm/settings-page").then((mod) => mod.WhatsappSettingsPage),
  { loading: () => <LoadingState label="Loading settings..." /> },
);

export default function Page() {
  return <WhatsappSettingsPage />;
}
