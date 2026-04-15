import { notFound } from "next/navigation";

import { CampaignCreatePage } from "@/features/campaigns/campaign-create-page";
import type { ChannelKey } from "@/features/campaigns/campaign-channel-options";

const allowedChannels: ChannelKey[] = ["email", "whatsapp", "meta", "sms", "task", "pipeline"];

export default async function ChannelCampaignAddPage({
  params,
}: {
  params: Promise<{ channel: string }>;
}) {
  const { channel } = await params;
  if (!allowedChannels.includes(channel as ChannelKey)) {
    notFound();
  }

  return <CampaignCreatePage initialChannel={channel as ChannelKey} />;
}
