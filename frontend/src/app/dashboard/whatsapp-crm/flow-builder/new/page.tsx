import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/page-patterns";

const WhatsappFlowBuilderPage = dynamic(
  () => import("@/features/whatsapp-crm/flow-builder-page").then((mod) => mod.WhatsappFlowBuilderPage),
  { loading: () => <LoadingState label="Loading flow builder..." /> },
);

interface PageProps {
  searchParams?: Promise<{ flowId?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  return <WhatsappFlowBuilderPage initialFlowId={params?.flowId} />;
}
