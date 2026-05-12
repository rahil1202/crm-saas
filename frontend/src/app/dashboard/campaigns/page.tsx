import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/page-patterns";

const CampaignsListPage = dynamic(
  () => import("@/features/campaigns/campaigns-list-page").then((mod) => mod.CampaignsListPage),
  { loading: () => <LoadingState label="Loading campaigns..." /> },
);

export default function CampaignsPage() {
  return <CampaignsListPage />;
}
