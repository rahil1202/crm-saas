"use client";

import type { ComponentType, SVGProps } from "react";
import { Layers3, Mail, Megaphone, MessageCircle, RadioTower, Workflow } from "lucide-react";

import { getIntegrationStatus, type IntegrationHubResponse, type IntegrationSettings } from "@/features/integrations/config";

export type CampaignStatus = "draft" | "scheduled" | "active" | "completed" | "paused";
export type TemplateType = "email" | "whatsapp" | "sms" | "task" | "pipeline";
export type ChannelKey = "email" | "whatsapp" | "meta" | "sms" | "task" | "pipeline";

export type ChannelOption = {
  key: ChannelKey;
  title: string;
  description: string;
  setup: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  templateType: TemplateType | null;
  integrationPath: string | null;
  integrationStatus: "completed" | "pending" | "not_required";
};

export function getCampaignChannelOptions(
  hub: IntegrationHubResponse | null,
  settings: IntegrationSettings["integrations"] | null,
): ChannelOption[] {
  const emailStatus = settings ? getIntegrationStatus("email", hub, settings) : "pending";
  const whatsappStatus = settings ? getIntegrationStatus("whatsapp", hub, settings) : "pending";

  return [
    {
      key: "email",
      title: "Email",
      description: "Newsletters, blasts, and outbound campaign sends.",
      setup: "Needs email integration before create.",
      icon: Mail,
      templateType: "email",
      integrationPath: "/dashboard/integrations/email",
      integrationStatus: emailStatus,
    },
    {
      key: "whatsapp",
      title: "WhatsApp",
      description: "Messaging campaigns for opted-in contacts.",
      setup: "Needs WhatsApp integration before create.",
      icon: MessageCircle,
      templateType: "whatsapp",
      integrationPath: "/dashboard/integrations/whatsapp",
      integrationStatus: whatsappStatus,
    },
    {
      key: "meta",
      title: "Meta",
      description: "Meta-connected messaging and audience outreach.",
      setup: "Uses the Meta or WhatsApp stack from integrations.",
      icon: Megaphone,
      templateType: "whatsapp",
      integrationPath: "/dashboard/integrations",
      integrationStatus: whatsappStatus,
    },
    {
      key: "sms",
      title: "SMS",
      description: "Short reminders, nudges, and direct updates.",
      setup: "No integration gate enforced yet.",
      icon: RadioTower,
      templateType: "sms",
      integrationPath: null,
      integrationStatus: "not_required",
    },
    {
      key: "task",
      title: "Task",
      description: "Internal task-driven campaigns for teams.",
      setup: "No external integration required.",
      icon: Workflow,
      templateType: "task",
      integrationPath: null,
      integrationStatus: "not_required",
    },
    {
      key: "pipeline",
      title: "Pipeline",
      description: "Operational campaigns tied to pipeline steps.",
      setup: "No external integration required.",
      icon: Layers3,
      templateType: "pipeline",
      integrationPath: null,
      integrationStatus: "not_required",
    },
  ];
}
