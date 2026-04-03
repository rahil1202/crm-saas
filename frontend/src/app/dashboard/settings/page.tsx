"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, Clock3, KeyRound, LifeBuoy, MailCheck, MapPinned, Palette, ShieldCheck, UserPlus, Users, Workflow } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, ApiError } from "@/lib/api";
import { AuthMePayload } from "@/lib/auth-client";
import { evaluatePasswordStrength, getInitials } from "@/lib/auth-ui";

interface CompanySnapshot {
  company: {
    id: string;
    name: string;
    timezone: string;
    currency: string;
    createdAt: string;
    updatedAt: string;
  };
  stores: Array<{
    id: string;
    name: string;
    code: string;
    isDefault: boolean;
  }>;
  members: Array<{
    membershipId: string;
    userId: string;
    role: "owner" | "admin" | "member";
    status: string;
    storeId: string | null;
    storeName: string | null;
    email: string;
    fullName: string | null;
  }>;
  invites: Array<{
    inviteId: string;
    email: string;
    role: "owner" | "admin" | "member";
    status: string;
    storeId: string | null;
    storeName: string | null;
    expiresAt: string;
  }>;
}

interface PipelineSettings {
  defaultDealPipeline: string;
  dealPipelines: Array<{
    key: string;
    label: string;
    stages: Array<{
      key: string;
      label: string;
    }>;
  }>;
}

interface LeadSourceSettings {
  leadSources: Array<{
    key: string;
    label: string;
  }>;
}

interface CompanyPreferenceSettings {
  businessHours: Array<{
    day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
    enabled: boolean;
    open: string;
    close: string;
  }>;
  branding: {
    companyLabel: string;
    primaryColor: string;
    accentColor: string;
    logoUrl: string | null;
  };
}

interface CustomFieldSettings {
  customFields: Array<{
    key: string;
    label: string;
    entity: "lead" | "customer" | "deal";
    type: "text" | "number" | "date" | "select";
    options: string[];
    required: boolean;
  }>;
}

interface TagSettings {
  tags: Array<{
    key: string;
    label: string;
    color: string;
  }>;
}

interface NotificationRuleSettings {
  notificationRules: {
    emailAlerts: boolean;
    taskReminders: boolean;
    overdueDigest: boolean;
    dealStageAlerts: boolean;
    campaignAlerts: boolean;
  };
}

interface IntegrationSettings {
  integrations: {
    slackWebhookUrl: string | null;
    whatsappProvider: string | null;
    emailProvider: string | null;
    webhookUrl: string | null;
  };
}

export default function SettingsPage() {
  const [me, setMe] = useState<AuthMePayload | null>(null);
  const [companySnapshot, setCompanySnapshot] = useState<CompanySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipelineSettings, setPipelineSettings] = useState<PipelineSettings | null>(null);
  const [leadSourceSettings, setLeadSourceSettings] = useState<LeadSourceSettings | null>(null);
  const [companyPreferenceSettings, setCompanyPreferenceSettings] = useState<CompanyPreferenceSettings | null>(null);
  const [customFieldSettings, setCustomFieldSettings] = useState<CustomFieldSettings | null>(null);
  const [tagSettings, setTagSettings] = useState<TagSettings | null>(null);
  const [notificationRuleSettings, setNotificationRuleSettings] = useState<NotificationRuleSettings | null>(null);
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submittingPassword, setSubmittingPassword] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);

  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"owner" | "admin" | "member">("member");
  const [inviteStoreId, setInviteStoreId] = useState<string>("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [membershipActionId, setMembershipActionId] = useState<string | null>(null);
  const [savingPipelines, setSavingPipelines] = useState(false);
  const [savingLeadSources, setSavingLeadSources] = useState(false);
  const [savingCompanyPreferences, setSavingCompanyPreferences] = useState(false);
  const [savingCustomFields, setSavingCustomFields] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [savingNotificationRules, setSavingNotificationRules] = useState(false);
  const [savingIntegrations, setSavingIntegrations] = useState(false);

  const passwordStrength = useMemo(
    () =>
      evaluatePasswordStrength(password, {
        email: me?.user.email ?? undefined,
        fullName: me?.user.fullName ?? undefined,
      }),
    [me?.user.email, me?.user.fullName, password],
  );

  const activeMembership = useMemo(() => {
    if (!me || !companySnapshot) {
      return null;
    }

    return me.memberships?.find((membership) => membership.companyId === companySnapshot.company.id) ?? null;
  }, [companySnapshot, me]);

  useEffect(() => {
    let disposed = false;

    const loadSettings = async () => {
      try {
        const [mePayload, companyPayload, pipelinePayload, leadSourcePayload, preferencePayload, customFieldPayload, tagPayload, notificationPayload, integrationPayload] = await Promise.all([
          apiRequest<AuthMePayload>("/auth/me"),
          apiRequest<CompanySnapshot>("/companies/current"),
          apiRequest<PipelineSettings>("/settings/pipelines"),
          apiRequest<LeadSourceSettings>("/settings/lead-sources"),
          apiRequest<CompanyPreferenceSettings>("/settings/company-preferences"),
          apiRequest<CustomFieldSettings>("/settings/custom-fields"),
          apiRequest<TagSettings>("/settings/tags"),
          apiRequest<NotificationRuleSettings>("/settings/notification-rules"),
          apiRequest<IntegrationSettings>("/settings/integrations"),
        ]);

        if (!disposed) {
          setMe(mePayload);
          setCompanySnapshot(companyPayload);
          setPipelineSettings(pipelinePayload);
          setLeadSourceSettings(leadSourcePayload);
          setCompanyPreferenceSettings(preferencePayload);
          setCustomFieldSettings(customFieldPayload);
          setTagSettings(tagPayload);
          setNotificationRuleSettings(notificationPayload);
          setIntegrationSettings(integrationPayload);
          setCompanyName(companyPayload.company.name);
          setTimezone(companyPayload.company.timezone);
          setCurrency(companyPayload.company.currency);
        }
      } catch (caughtError) {
        if (!disposed) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load account settings.");
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void loadSettings();

    return () => {
      disposed = true;
    };
  }, []);

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittingPassword(true);
    setError(null);

    try {
      await apiRequest("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          password,
          confirmPassword,
        }),
      });

      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      toast.success("Password updated successfully.");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to update password.";
      setError(message);
    } finally {
      setSubmittingPassword(false);
    }
  };

  const handleCompanySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingCompany(true);
    setError(null);

    try {
      const response = await apiRequest<{ company: CompanySnapshot["company"] }>("/companies/current", {
        method: "PATCH",
        body: JSON.stringify({
          name: companyName,
          timezone,
          currency,
        }),
      });

      setCompanySnapshot((current) =>
        current
          ? {
              ...current,
              company: {
                ...current.company,
                ...response.company,
              },
            }
          : current,
      );
      toast.success("Company profile updated.");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to update company profile.";
      setError(message);
    } finally {
      setSavingCompany(false);
    }
  };

  const handleBranchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingBranch(true);
    setError(null);

    try {
      const response = await apiRequest<{ store: CompanySnapshot["stores"][number] }>("/companies/stores", {
        method: "POST",
        body: JSON.stringify({
          name: branchName,
          code: branchCode,
          isDefault: companySnapshot?.stores.length === 0,
        }),
      });

      setCompanySnapshot((current) =>
        current
          ? {
              ...current,
              stores: [...current.stores, response.store],
            }
          : current,
      );
      setBranchName("");
      setBranchCode("");
      toast.success("Branch created.");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to create branch.";
      setError(message);
    } finally {
      setCreatingBranch(false);
    }
  };

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSendingInvite(true);
    setError(null);

    try {
      const response = await apiRequest<{
        inviteId: string;
        email: string;
        role: "owner" | "admin" | "member";
        expiresAt: string;
        storeId: string | null;
      }>("/auth/invite", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          storeId: inviteStoreId || null,
          expiresInDays: 7,
        }),
      });

      setInviteEmail("");
      setInviteRole("member");
      setInviteStoreId("");
      setCompanySnapshot((current) =>
        current
          ? {
              ...current,
              invites: [
                ...current.invites,
                {
                  inviteId: response.inviteId,
                  email: response.email,
                  role: response.role,
                  status: "pending",
                  storeId: response.storeId,
                  storeName: current.stores.find((store) => store.id === response.storeId)?.name ?? null,
                  expiresAt: response.expiresAt,
                },
              ],
            }
          : current,
      );
      toast.success("Team invite created.");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to send team invite.";
      setError(message);
    } finally {
      setSendingInvite(false);
    }
  };

  const handleMembershipUpdate = async (
    membershipId: string,
    payload: {
      role?: "owner" | "admin" | "member";
      status?: "active" | "disabled";
    },
  ) => {
    setMembershipActionId(membershipId);
    setError(null);

    try {
      const response = await apiRequest<{
        membership: {
          id: string;
          role: "owner" | "admin" | "member";
          status: string;
        };
      }>(`/users/memberships/${membershipId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setCompanySnapshot((current) =>
        current
          ? {
              ...current,
              members: current.members.map((member) =>
                member.membershipId === membershipId
                  ? {
                      ...member,
                      role: response.membership.role,
                      status: response.membership.status,
                    }
                  : member,
              ),
            }
          : current,
      );
      toast.success("Team access updated.");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to update member access.";
      setError(message);
    } finally {
      setMembershipActionId(null);
    }
  };

  const handlePipelineChange = (pipelineIndex: number, field: "key" | "label", value: string) => {
    setPipelineSettings((current) =>
      current
        ? {
            ...current,
            dealPipelines: current.dealPipelines.map((pipeline, index) =>
              index === pipelineIndex ? { ...pipeline, [field]: value } : pipeline,
            ),
          }
        : current,
    );
  };

  const handleStageChange = (pipelineIndex: number, stageIndex: number, field: "key" | "label", value: string) => {
    setPipelineSettings((current) =>
      current
        ? {
            ...current,
            dealPipelines: current.dealPipelines.map((pipeline, index) =>
              index === pipelineIndex
                ? {
                    ...pipeline,
                    stages: pipeline.stages.map((stage, innerIndex) =>
                      innerIndex === stageIndex ? { ...stage, [field]: value } : stage,
                    ),
                  }
                : pipeline,
            ),
          }
        : current,
    );
  };

  const addPipeline = () => {
    setPipelineSettings((current) =>
      current
        ? {
            ...current,
            dealPipelines: [
              ...current.dealPipelines,
              {
                key: `pipeline-${current.dealPipelines.length + 1}`,
                label: `Pipeline ${current.dealPipelines.length + 1}`,
                stages: [{ key: "new", label: "New" }],
              },
            ],
          }
        : current,
    );
  };

  const addStage = (pipelineIndex: number) => {
    setPipelineSettings((current) =>
      current
        ? {
            ...current,
            dealPipelines: current.dealPipelines.map((pipeline, index) =>
              index === pipelineIndex
                ? {
                    ...pipeline,
                    stages: [
                      ...pipeline.stages,
                      {
                        key: `stage-${pipeline.stages.length + 1}`,
                        label: `Stage ${pipeline.stages.length + 1}`,
                      },
                    ],
                  }
                : pipeline,
            ),
          }
        : current,
    );
  };

  const removePipeline = (pipelineIndex: number) => {
    setPipelineSettings((current) => {
      if (!current || current.dealPipelines.length === 1) {
        return current;
      }

      const nextPipelines = current.dealPipelines.filter((_, index) => index !== pipelineIndex);
      const nextDefault =
        current.defaultDealPipeline === current.dealPipelines[pipelineIndex]?.key
          ? nextPipelines[0]?.key ?? current.defaultDealPipeline
          : current.defaultDealPipeline;

      return {
        ...current,
        defaultDealPipeline: nextDefault,
        dealPipelines: nextPipelines,
      };
    });
  };

  const removeStage = (pipelineIndex: number, stageIndex: number) => {
    setPipelineSettings((current) =>
      current
        ? {
            ...current,
            dealPipelines: current.dealPipelines.map((pipeline, index) =>
              index === pipelineIndex
                ? {
                    ...pipeline,
                    stages: pipeline.stages.length === 1 ? pipeline.stages : pipeline.stages.filter((_, innerIndex) => innerIndex !== stageIndex),
                  }
                : pipeline,
            ),
          }
        : current,
    );
  };

  const handlePipelineSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pipelineSettings) {
      return;
    }

    setSavingPipelines(true);
    setError(null);

    try {
      const response = await apiRequest<PipelineSettings>("/settings/pipelines", {
        method: "PATCH",
        body: JSON.stringify(pipelineSettings),
      });

      setPipelineSettings(response);
      toast.success("Pipeline settings updated.");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to save pipeline settings.";
      setError(message);
    } finally {
      setSavingPipelines(false);
    }
  };

  const handleLeadSourceChange = (index: number, field: "key" | "label", value: string) => {
    setLeadSourceSettings((current) =>
      current
        ? {
            leadSources: current.leadSources.map((source, sourceIndex) =>
              sourceIndex === index ? { ...source, [field]: value } : source,
            ),
          }
        : current,
    );
  };

  const addLeadSource = () => {
    setLeadSourceSettings((current) =>
      current
        ? {
            leadSources: [
              ...current.leadSources,
              {
                key: `source-${current.leadSources.length + 1}`,
                label: `Source ${current.leadSources.length + 1}`,
              },
            ],
          }
        : current,
    );
  };

  const removeLeadSource = (index: number) => {
    setLeadSourceSettings((current) =>
      current && current.leadSources.length > 1
        ? {
            leadSources: current.leadSources.filter((_, sourceIndex) => sourceIndex !== index),
          }
        : current,
    );
  };

  const handleLeadSourceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!leadSourceSettings) {
      return;
    }

    setSavingLeadSources(true);
    setError(null);

    try {
      const response = await apiRequest<LeadSourceSettings>("/settings/lead-sources", {
        method: "PATCH",
        body: JSON.stringify(leadSourceSettings),
      });

      setLeadSourceSettings(response);
      toast.success("Lead source settings updated.");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to save lead sources.";
      setError(message);
    } finally {
      setSavingLeadSources(false);
    }
  };

  const updateBusinessHour = (
    index: number,
    field: "enabled" | "open" | "close",
    value: boolean | string,
  ) => {
    setCompanyPreferenceSettings((current) =>
      current
        ? {
            ...current,
            businessHours: current.businessHours.map((entry, entryIndex) =>
              entryIndex === index ? { ...entry, [field]: value } : entry,
            ),
          }
        : current,
    );
  };

  const updateBranding = (
    field: "companyLabel" | "primaryColor" | "accentColor" | "logoUrl",
    value: string,
  ) => {
    setCompanyPreferenceSettings((current) =>
      current
        ? {
            ...current,
            branding: {
              ...current.branding,
              [field]: field === "logoUrl" && value.trim().length === 0 ? null : value,
            },
          }
        : current,
    );
  };

  const handleCompanyPreferencesSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!companyPreferenceSettings) {
      return;
    }

    setSavingCompanyPreferences(true);
    setError(null);

    try {
      const response = await apiRequest<CompanyPreferenceSettings>("/settings/company-preferences", {
        method: "PATCH",
        body: JSON.stringify(companyPreferenceSettings),
      });

      setCompanyPreferenceSettings(response);
      toast.success("Business hours and branding updated.");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to save company preferences.";
      setError(message);
    } finally {
      setSavingCompanyPreferences(false);
    }
  };

  const handleCustomFieldChange = (
    index: number,
    field: "key" | "label" | "entity" | "type" | "required" | "options",
    value: string | boolean,
  ) => {
    setCustomFieldSettings((current) =>
      current
        ? {
            customFields: current.customFields.map((item, itemIndex) =>
              itemIndex === index
                ? {
                    ...item,
                    [field]:
                      field === "options"
                        ? String(value)
                            .split(",")
                            .map((entry) => entry.trim())
                            .filter(Boolean)
                        : value,
                  }
                : item,
            ),
          }
        : current,
    );
  };

  const addCustomField = () => {
    setCustomFieldSettings((current) =>
      current
        ? {
            customFields: [
              ...current.customFields,
              {
                key: `field_${current.customFields.length + 1}`,
                label: `Field ${current.customFields.length + 1}`,
                entity: "lead",
                type: "text",
                options: [],
                required: false,
              },
            ],
          }
        : current,
    );
  };

  const removeCustomField = (index: number) => {
    setCustomFieldSettings((current) =>
      current
        ? {
            customFields: current.customFields.filter((_, itemIndex) => itemIndex !== index),
          }
        : current,
    );
  };

  const handleCustomFieldsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customFieldSettings) {
      return;
    }

    setSavingCustomFields(true);
    setError(null);

    try {
      const response = await apiRequest<CustomFieldSettings>("/settings/custom-fields", {
        method: "PATCH",
        body: JSON.stringify(customFieldSettings),
      });
      setCustomFieldSettings(response);
      toast.success("Custom fields updated.");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to save custom fields.";
      setError(message);
    } finally {
      setSavingCustomFields(false);
    }
  };

  const handleTagChange = (index: number, field: "key" | "label" | "color", value: string) => {
    setTagSettings((current) =>
      current
        ? {
            tags: current.tags.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
          }
        : current,
    );
  };

  const addTag = () => {
    setTagSettings((current) =>
      current
        ? {
            tags: [
              ...current.tags,
              {
                key: `tag_${current.tags.length + 1}`,
                label: `Tag ${current.tags.length + 1}`,
                color: "#102031",
              },
            ],
          }
        : current,
    );
  };

  const removeTag = (index: number) => {
    setTagSettings((current) =>
      current
        ? {
            tags: current.tags.filter((_, itemIndex) => itemIndex !== index),
          }
        : current,
    );
  };

  const handleTagsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tagSettings) {
      return;
    }

    setSavingTags(true);
    setError(null);

    try {
      const response = await apiRequest<TagSettings>("/settings/tags", {
        method: "PATCH",
        body: JSON.stringify(tagSettings),
      });
      setTagSettings(response);
      toast.success("Tag library updated.");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to save tags.";
      setError(message);
    } finally {
      setSavingTags(false);
    }
  };

  const handleNotificationRuleChange = (field: keyof NotificationRuleSettings["notificationRules"], value: boolean) => {
    setNotificationRuleSettings((current) =>
      current
        ? {
            notificationRules: {
              ...current.notificationRules,
              [field]: value,
            },
          }
        : current,
    );
  };

  const handleNotificationRulesSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!notificationRuleSettings) {
      return;
    }

    setSavingNotificationRules(true);
    setError(null);

    try {
      const response = await apiRequest<NotificationRuleSettings>("/settings/notification-rules", {
        method: "PATCH",
        body: JSON.stringify(notificationRuleSettings),
      });
      setNotificationRuleSettings(response);
      toast.success("Notification rules updated.");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to save notification rules.";
      setError(message);
    } finally {
      setSavingNotificationRules(false);
    }
  };

  const handleIntegrationChange = (field: keyof IntegrationSettings["integrations"], value: string) => {
    setIntegrationSettings((current) =>
      current
        ? {
            integrations: {
              ...current.integrations,
              [field]: value.trim().length === 0 ? null : value,
            },
          }
        : current,
    );
  };

  const handleIntegrationsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!integrationSettings) {
      return;
    }

    setSavingIntegrations(true);
    setError(null);

    try {
      const response = await apiRequest<IntegrationSettings>("/settings/integrations", {
        method: "PATCH",
        body: JSON.stringify(integrationSettings),
      });
      setIntegrationSettings(response);
      toast.success("Integration settings updated.");
    } catch (caughtError) {
      const message = caughtError instanceof ApiError ? caughtError.message : "Unable to save integration settings.";
      setError(message);
    } finally {
      setSavingIntegrations(false);
    }
  };

  return (
    <AppShell
      title="Settings"
      description="Manage operator security, company profile, branches, and team access for the active CRM workspace."
    >
      <div className="flex flex-col gap-6">
        {error ? (
          <Alert variant="destructive">
            <ShieldCheck />
            <AlertTitle>Settings action failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Tabs defaultValue="company" className="flex flex-col gap-6">
          <TabsList>
            <TabsTrigger value="company">Company</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="pipelines">Pipelines</TabsTrigger>
            <TabsTrigger value="lead-sources">Lead Sources</TabsTrigger>
            <TabsTrigger value="custom-fields">Custom Fields</TabsTrigger>
            <TabsTrigger value="tags">Tags</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="recovery">Recovery</TabsTrigger>
          </TabsList>

          <TabsContent value="company" className="flex flex-col gap-6">
            <Card className="border-border/60">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 />
                  <CardTitle>Company profile</CardTitle>
                </div>
                <CardDescription>Update the tenant identity used across dashboards, onboarding, and workspace switching.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {loading ? (
                  <div className="grid gap-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <form onSubmit={handleCompanySubmit} className="flex flex-col gap-6">
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="companyName">Company name</FieldLabel>
                        <Input id="companyName" value={companyName} onChange={(event) => setCompanyName(event.target.value)} required />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
                        <Input id="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} required />
                        <FieldDescription>Used as the default tenant timezone for scheduling and reporting.</FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="currency">Currency</FieldLabel>
                        <Input id="currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} required />
                        <FieldDescription>Stored on the company and used as the default CRM money code.</FieldDescription>
                      </Field>
                    </FieldGroup>

                    <Button type="submit" disabled={savingCompany}>
                      <Building2 data-icon="inline-start" />
                      {savingCompany ? "Saving company profile..." : "Save company profile"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MapPinned />
                  <CardTitle>Branch management</CardTitle>
                </div>
                <CardDescription>Create and review branches attached to the active company.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {loading ? (
                  <div className="grid gap-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : (
                  <>
                    <form onSubmit={handleBranchSubmit} className="flex flex-col gap-6 rounded-xl border border-border/60 bg-muted/20 p-4">
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor="branchName">Branch name</FieldLabel>
                          <Input id="branchName" value={branchName} onChange={(event) => setBranchName(event.target.value)} required />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="branchCode">Branch code</FieldLabel>
                          <Input id="branchCode" value={branchCode} onChange={(event) => setBranchCode(event.target.value.toUpperCase())} required />
                          <FieldDescription>Codes are normalized and kept unique per company.</FieldDescription>
                        </Field>
                      </FieldGroup>

                      <Button type="submit" variant="outline" disabled={creatingBranch}>
                        <MapPinned data-icon="inline-start" />
                        {creatingBranch ? "Creating branch..." : "Create branch"}
                      </Button>
                    </form>

                    <div className="grid gap-3">
                      {companySnapshot?.stores.map((store) => (
                        <div key={store.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{store.name}</span>
                              {store.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                            </div>
                            <span className="text-sm text-muted-foreground">Code: {store.code}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences" className="flex flex-col gap-6">
            <Card className="border-border/60">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Clock3 />
                  <CardTitle>Business hours</CardTitle>
                </div>
                <CardDescription>Control the default contact window used by the tenant for scheduling and team operations.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {loading ? (
                  <div className="grid gap-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : (
                  <form onSubmit={handleCompanyPreferencesSubmit} className="flex flex-col gap-6">
                    <div className="grid gap-4">
                      {companyPreferenceSettings?.businessHours.map((entry, index) => (
                        <div key={entry.day} className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 sm:grid-cols-[180px_120px_1fr_1fr]">
                          <Field>
                            <FieldLabel>{entry.day}</FieldLabel>
                            <Badge variant={entry.enabled ? "secondary" : "outline"}>{entry.enabled ? "Open" : "Closed"}</Badge>
                          </Field>
                          <Field>
                            <FieldLabel>Enabled</FieldLabel>
                            <Select value={entry.enabled ? "yes" : "no"} onValueChange={(value) => updateBusinessHour(index, "enabled", value === "yes")}>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="yes">Open</SelectItem>
                                  <SelectItem value="no">Closed</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field>
                            <FieldLabel>Open</FieldLabel>
                            <Input type="time" value={entry.open} onChange={(event) => updateBusinessHour(index, "open", event.target.value)} disabled={!entry.enabled} />
                          </Field>
                          <Field>
                            <FieldLabel>Close</FieldLabel>
                            <Input type="time" value={entry.close} onChange={(event) => updateBusinessHour(index, "close", event.target.value)} disabled={!entry.enabled} />
                          </Field>
                        </div>
                      ))}
                    </div>

                    <Card size="sm" className="border-border/60 bg-muted/20">
                      <CardHeader>
                        <div className="flex items-center gap-2">
                          <Palette />
                          <CardTitle className="text-sm">Branding</CardTitle>
                        </div>
                        <CardDescription>Store basic workspace brand markers for future white-label and customer-facing surfaces.</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4">
                        <FieldGroup>
                          <Field>
                            <FieldLabel htmlFor="companyLabel">Display label</FieldLabel>
                            <Input id="companyLabel" value={companyPreferenceSettings?.branding.companyLabel ?? ""} onChange={(event) => updateBranding("companyLabel", event.target.value)} />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="logoUrl">Logo URL</FieldLabel>
                            <Input id="logoUrl" value={companyPreferenceSettings?.branding.logoUrl ?? ""} onChange={(event) => updateBranding("logoUrl", event.target.value)} placeholder="https://example.com/logo.svg" />
                          </Field>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field>
                              <FieldLabel htmlFor="primaryColor">Primary color</FieldLabel>
                              <Input id="primaryColor" value={companyPreferenceSettings?.branding.primaryColor ?? "#102031"} onChange={(event) => updateBranding("primaryColor", event.target.value)} placeholder="#102031" />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor="accentColor">Accent color</FieldLabel>
                              <Input id="accentColor" value={companyPreferenceSettings?.branding.accentColor ?? "#d97706"} onChange={(event) => updateBranding("accentColor", event.target.value)} placeholder="#d97706" />
                            </Field>
                          </div>
                        </FieldGroup>
                      </CardContent>
                    </Card>

                    <Button type="submit" disabled={savingCompanyPreferences}>
                      {savingCompanyPreferences ? "Saving preferences..." : "Save business hours and branding"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lead-sources" className="flex flex-col gap-6">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Lead source settings</CardTitle>
                <CardDescription>Define the allowed source values used in lead creation and filtering.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {loading ? (
                  <div className="grid gap-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : (
                  <form onSubmit={handleLeadSourceSubmit} className="flex flex-col gap-6">
                    <div className="grid gap-4">
                      {leadSourceSettings?.leadSources.map((source, index) => (
                        <div key={`${source.key}-${index}`} className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 sm:grid-cols-[1fr_1fr_auto]">
                          <Field>
                            <FieldLabel>Source key</FieldLabel>
                            <Input value={source.key} onChange={(event) => handleLeadSourceChange(index, "key", event.target.value)} required />
                          </Field>
                          <Field>
                            <FieldLabel>Source label</FieldLabel>
                            <Input value={source.label} onChange={(event) => handleLeadSourceChange(index, "label", event.target.value)} required />
                          </Field>
                          <div className="flex items-end">
                            <Button type="button" variant="outline" size="sm" onClick={() => removeLeadSource(index)}>
                              Remove source
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button type="button" variant="outline" onClick={addLeadSource}>
                        Add source
                      </Button>
                      <Button type="submit" disabled={savingLeadSources}>
                        {savingLeadSources ? "Saving lead sources..." : "Save lead source settings"}
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pipelines" className="flex flex-col gap-6">
            <Card className="border-border/60">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Workflow />
                  <CardTitle>Deal pipeline settings</CardTitle>
                </div>
                <CardDescription>Configure the default pipeline and the stages available during deal creation and updates.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {loading ? (
                  <div className="grid gap-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : (
                  <form onSubmit={handlePipelineSubmit} className="flex flex-col gap-6">
                    <Field>
                      <FieldLabel htmlFor="defaultDealPipeline">Default deal pipeline</FieldLabel>
                      <Select
                        value={pipelineSettings?.defaultDealPipeline}
                        onValueChange={(value) =>
                          setPipelineSettings((current) => (current ? { ...current, defaultDealPipeline: value ?? current.defaultDealPipeline } : current))
                        }
                      >
                        <SelectTrigger id="defaultDealPipeline" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {pipelineSettings?.dealPipelines.map((pipeline) => (
                              <SelectItem key={pipeline.key} value={pipeline.key}>
                                {pipeline.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>Deals default to this pipeline unless a specific one is selected.</FieldDescription>
                    </Field>

                    <div className="grid gap-4">
                      {pipelineSettings?.dealPipelines.map((pipeline, pipelineIndex) => (
                        <Card key={`${pipeline.key}-${pipelineIndex}`} size="sm" className="border-border/60 bg-muted/20">
                          <CardHeader>
                            <div className="flex items-center justify-between gap-3">
                              <CardTitle className="text-sm">Pipeline {pipelineIndex + 1}</CardTitle>
                              <Button type="button" variant="outline" size="sm" onClick={() => removePipeline(pipelineIndex)}>
                                Remove pipeline
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-4">
                            <FieldGroup>
                              <Field>
                                <FieldLabel>Pipeline key</FieldLabel>
                                <Input value={pipeline.key} onChange={(event) => handlePipelineChange(pipelineIndex, "key", event.target.value)} required />
                              </Field>
                              <Field>
                                <FieldLabel>Pipeline label</FieldLabel>
                                <Input value={pipeline.label} onChange={(event) => handlePipelineChange(pipelineIndex, "label", event.target.value)} required />
                              </Field>
                            </FieldGroup>

                            <div className="grid gap-3">
                              {pipeline.stages.map((stage, stageIndex) => (
                                <div key={`${stage.key}-${stageIndex}`} className="grid gap-3 rounded-xl border border-border/60 bg-background px-4 py-3 sm:grid-cols-[1fr_1fr_auto]">
                                  <Field>
                                    <FieldLabel>Stage key</FieldLabel>
                                    <Input value={stage.key} onChange={(event) => handleStageChange(pipelineIndex, stageIndex, "key", event.target.value)} required />
                                  </Field>
                                  <Field>
                                    <FieldLabel>Stage label</FieldLabel>
                                    <Input value={stage.label} onChange={(event) => handleStageChange(pipelineIndex, stageIndex, "label", event.target.value)} required />
                                  </Field>
                                  <div className="flex items-end">
                                    <Button type="button" variant="outline" size="sm" onClick={() => removeStage(pipelineIndex, stageIndex)}>
                                      Remove stage
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <Button type="button" variant="outline" size="sm" onClick={() => addStage(pipelineIndex)}>
                              Add stage
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button type="button" variant="outline" onClick={addPipeline}>
                        Add pipeline
                      </Button>
                      <Button type="submit" disabled={savingPipelines}>
                        <Workflow data-icon="inline-start" />
                        {savingPipelines ? "Saving pipelines..." : "Save pipeline settings"}
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="custom-fields" className="flex flex-col gap-6">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Custom fields</CardTitle>
                <CardDescription>Define reusable lead, customer, and deal fields for future form and profile expansion.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <form onSubmit={handleCustomFieldsSubmit} className="flex flex-col gap-6">
                  <div className="grid gap-4">
                    {customFieldSettings?.customFields.map((field, index) => (
                      <div key={`${field.key}-${index}`} className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 lg:grid-cols-[1fr_1fr_160px_160px_auto]">
                        <Field>
                          <FieldLabel>Field key</FieldLabel>
                          <Input value={field.key} onChange={(event) => handleCustomFieldChange(index, "key", event.target.value)} required />
                        </Field>
                        <Field>
                          <FieldLabel>Label</FieldLabel>
                          <Input value={field.label} onChange={(event) => handleCustomFieldChange(index, "label", event.target.value)} required />
                        </Field>
                        <Field>
                          <FieldLabel>Entity</FieldLabel>
                          <select value={field.entity} onChange={(event) => handleCustomFieldChange(index, "entity", event.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                            <option value="lead">lead</option>
                            <option value="customer">customer</option>
                            <option value="deal">deal</option>
                          </select>
                        </Field>
                        <Field>
                          <FieldLabel>Type</FieldLabel>
                          <select value={field.type} onChange={(event) => handleCustomFieldChange(index, "type", event.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
                            <option value="text">text</option>
                            <option value="number">number</option>
                            <option value="date">date</option>
                            <option value="select">select</option>
                          </select>
                        </Field>
                        <div className="flex items-end">
                          <Button type="button" variant="outline" size="sm" onClick={() => removeCustomField(index)}>
                            Remove
                          </Button>
                        </div>
                        <Field className="lg:col-span-3">
                          <FieldLabel>Options</FieldLabel>
                          <Input value={field.options.join(", ")} onChange={(event) => handleCustomFieldChange(index, "options", event.target.value)} placeholder="Needed for select fields" />
                        </Field>
                        <label className="flex items-end gap-2 text-sm text-muted-foreground">
                          <input type="checkbox" checked={field.required} onChange={(event) => handleCustomFieldChange(index, "required", event.target.checked)} />
                          Required field
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button type="button" variant="outline" onClick={addCustomField}>
                      Add custom field
                    </Button>
                    <Button type="submit" disabled={savingCustomFields}>
                      {savingCustomFields ? "Saving custom fields..." : "Save custom fields"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tags" className="flex flex-col gap-6">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Tags</CardTitle>
                <CardDescription>Maintain a shared company tag library with color-coded labels.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <form onSubmit={handleTagsSubmit} className="flex flex-col gap-6">
                  <div className="grid gap-4">
                    {tagSettings?.tags.map((tag, index) => (
                      <div key={`${tag.key}-${index}`} className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 sm:grid-cols-[1fr_1fr_140px_auto]">
                        <Field>
                          <FieldLabel>Tag key</FieldLabel>
                          <Input value={tag.key} onChange={(event) => handleTagChange(index, "key", event.target.value)} required />
                        </Field>
                        <Field>
                          <FieldLabel>Tag label</FieldLabel>
                          <Input value={tag.label} onChange={(event) => handleTagChange(index, "label", event.target.value)} required />
                        </Field>
                        <Field>
                          <FieldLabel>Color</FieldLabel>
                          <Input type="color" value={tag.color} onChange={(event) => handleTagChange(index, "color", event.target.value)} />
                        </Field>
                        <div className="flex items-end">
                          <Button type="button" variant="outline" size="sm" onClick={() => removeTag(index)}>
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button type="button" variant="outline" onClick={addTag}>
                      Add tag
                    </Button>
                    <Button type="submit" disabled={savingTags}>
                      {savingTags ? "Saving tags..." : "Save tags"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="flex flex-col gap-6">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Notification rules</CardTitle>
                <CardDescription>Define which alert categories remain enabled for this company workspace.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <form onSubmit={handleNotificationRulesSubmit} className="flex flex-col gap-6">
                  <div className="grid gap-3">
                    {notificationRuleSettings
                      ? (Object.entries(notificationRuleSettings.notificationRules) as Array<[keyof NotificationRuleSettings["notificationRules"], boolean]>).map(([key, value]) => (
                          <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm">
                            <span className="capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                            <input type="checkbox" checked={value} onChange={(event) => handleNotificationRuleChange(key, event.target.checked)} />
                          </label>
                        ))
                      : null}
                  </div>
                  <Button type="submit" disabled={savingNotificationRules}>
                    {savingNotificationRules ? "Saving notification rules..." : "Save notification rules"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="flex flex-col gap-6">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle>Integrations</CardTitle>
                <CardDescription>Store provider references and outbound webhook endpoints used by external systems.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <form onSubmit={handleIntegrationsSubmit} className="flex flex-col gap-6">
                  <FieldGroup>
                    <Field>
                      <FieldLabel>Slack webhook URL</FieldLabel>
                      <Input value={integrationSettings?.integrations.slackWebhookUrl ?? ""} onChange={(event) => handleIntegrationChange("slackWebhookUrl", event.target.value)} placeholder="https://hooks.slack.com/services/..." />
                    </Field>
                    <Field>
                      <FieldLabel>WhatsApp provider</FieldLabel>
                      <Input value={integrationSettings?.integrations.whatsappProvider ?? ""} onChange={(event) => handleIntegrationChange("whatsappProvider", event.target.value)} placeholder="Twilio / Meta / Gupshup" />
                    </Field>
                    <Field>
                      <FieldLabel>Email provider</FieldLabel>
                      <Input value={integrationSettings?.integrations.emailProvider ?? ""} onChange={(event) => handleIntegrationChange("emailProvider", event.target.value)} placeholder="Resend / SendGrid / SMTP" />
                    </Field>
                    <Field>
                      <FieldLabel>Generic webhook URL</FieldLabel>
                      <Input value={integrationSettings?.integrations.webhookUrl ?? ""} onChange={(event) => handleIntegrationChange("webhookUrl", event.target.value)} placeholder="https://example.com/webhooks/crm" />
                    </Field>
                  </FieldGroup>
                  <Button type="submit" disabled={savingIntegrations}>
                    {savingIntegrations ? "Saving integrations..." : "Save integrations"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="flex flex-col gap-6">
            <Card className="border-border/60">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Users />
                  <CardTitle>Workspace team</CardTitle>
                </div>
                <CardDescription>Review active members and create invites scoped to this company.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <form onSubmit={handleInviteSubmit} className="flex flex-col gap-6 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="inviteEmail">Invite email</FieldLabel>
                      <Input id="inviteEmail" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="inviteRole">Role</FieldLabel>
                      <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as "owner" | "admin" | "member")}>
                        <SelectTrigger id="inviteRole" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="owner">owner</SelectItem>
                            <SelectItem value="admin">admin</SelectItem>
                            <SelectItem value="member">member</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>Roles map directly to tenant authorization on the backend.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="inviteStoreId">Store ID</FieldLabel>
                      <Select value={inviteStoreId || "__company__"} onValueChange={(value) => setInviteStoreId(!value || value === "__company__" ? "" : value)}>
                        <SelectTrigger id="inviteStoreId" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="__company__">Company-wide access</SelectItem>
                            {companySnapshot?.stores.map((store) => (
                              <SelectItem key={store.id} value={store.id}>
                                {store.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>Leave the invite company-wide or scope the default branch for the member.</FieldDescription>
                    </Field>
                  </FieldGroup>

                  <Button type="submit" variant="outline" disabled={sendingInvite}>
                    <UserPlus data-icon="inline-start" />
                    {sendingInvite ? "Sending invite..." : "Send invite"}
                  </Button>
                </form>

                <div className="grid gap-3">
                  {loading ? (
                    <>
                      <Skeleton className="h-18 w-full" />
                      <Skeleton className="h-18 w-full" />
                    </>
                  ) : (
                    companySnapshot?.members.map((member) => (
                      <div key={member.membershipId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>{getInitials(member.fullName ?? member.email)}</AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{member.fullName ?? member.email}</span>
                            <span className="text-sm text-muted-foreground">{member.email}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={member.status === "active" ? "secondary" : "outline"}>{member.status}</Badge>
                          {member.storeName ? <Badge variant="outline">{member.storeName}</Badge> : null}
                        </div>
                        <div className="flex w-full flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 lg:w-auto lg:min-w-80">
                          <Field>
                            <FieldLabel>Role</FieldLabel>
                            <Select
                              value={member.role}
                              onValueChange={(value) =>
                                void handleMembershipUpdate(member.membershipId, {
                                  role: value as "owner" | "admin" | "member",
                                })
                              }
                              disabled={membershipActionId === member.membershipId || member.userId === me?.user.id}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="owner">owner</SelectItem>
                                  <SelectItem value="admin">admin</SelectItem>
                                  <SelectItem value="member">member</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <FieldDescription>
                              {member.userId === me?.user.id ? "Your own company role is protected from this screen." : "Changing role updates tenant authorization immediately."}
                            </FieldDescription>
                          </Field>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant={member.status === "active" ? "destructive" : "outline"}
                              disabled={membershipActionId === member.membershipId || member.userId === me?.user.id}
                              onClick={() =>
                                void handleMembershipUpdate(member.membershipId, {
                                  status: member.status === "active" ? "disabled" : "active",
                                })
                              }
                            >
                              <ShieldCheck data-icon="inline-start" />
                              {membershipActionId === member.membershipId
                                ? "Saving..."
                                : member.status === "active"
                                  ? "Deactivate user"
                                  : "Restore user"}
                            </Button>
                            {activeMembership?.role === "owner" && member.role === "owner" ? (
                              <Badge variant="outline">Owner-protected</Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {companySnapshot?.invites.length ? (
                  <Card size="sm" className="border-border/60 bg-muted/20">
                    <CardHeader>
                      <CardTitle className="text-sm">Pending invites</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      {companySnapshot.invites.map((invite) => (
                        <div key={invite.inviteId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{invite.email}</span>
                            <span className="text-sm text-muted-foreground">Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{invite.role}</Badge>
                            {invite.storeName ? <Badge variant="outline">{invite.storeName}</Badge> : null}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card className="border-border/60">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <KeyRound />
                  <CardTitle>Password security</CardTitle>
                </div>
                <CardDescription>Change the current password without leaving the authenticated workspace.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-6">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
                      <Input id="currentPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
                      <FieldDescription>The backend validates this against the current Supabase identity before changing anything.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="newPassword">New password</FieldLabel>
                      <Input id="newPassword" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="confirmNewPassword">Confirm new password</FieldLabel>
                      <Input id="confirmNewPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
                      <FieldDescription>
                        {confirmPassword.length === 0 ? "Re-enter the password to confirm the change." : password === confirmPassword ? "Passwords match." : "Passwords do not match yet."}
                      </FieldDescription>
                    </Field>
                  </FieldGroup>

                  <Card size="sm" className="border-border/60 bg-muted/20">
                    <CardHeader>
                      <CardTitle className="text-sm">Policy alignment</CardTitle>
                      <CardDescription>The backend enforces the same strength checks shown here.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <Progress value={password.length === 0 ? 0 : passwordStrength.score}>
                        <ProgressLabel>{passwordStrength.label}</ProgressLabel>
                        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                          {password.length === 0 ? "0%" : `${passwordStrength.score}%`}
                        </span>
                      </Progress>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {passwordStrength.requirements.map((requirement) => (
                          <div key={requirement.key} className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/80 px-3 py-2">
                            <Badge variant={requirement.passed ? "secondary" : "outline"}>{requirement.passed ? "Pass" : "Need"}</Badge>
                            <span className="text-sm text-muted-foreground">{requirement.label}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Button type="submit" disabled={submittingPassword}>
                    <ShieldCheck data-icon="inline-start" />
                    {submittingPassword ? "Updating password..." : "Update password"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recovery">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-border/60">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <MailCheck />
                    <CardTitle>Verification route</CardTitle>
                  </div>
                  <CardDescription>Use the same verified inbox to preserve access continuity across sign-in and recovery.</CardDescription>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">
                  The authenticated account is tied to <strong>{me?.user.email ?? "your verified email"}</strong>. If inbox access changes, update the identity flow before handing off workspace ownership.
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <LifeBuoy />
                    <CardTitle>Recovery actions</CardTitle>
                  </div>
                  <CardDescription>Open the recovery flow in a separate tab if you need to test or re-run it.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Link href="/forgot-password" className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline underline-offset-4">
                    Reset this account from the recovery flow
                  </Link>
                  <Link href="/login" className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline underline-offset-4">
                    Return to the sign-in screen
                  </Link>
                  <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    Use recovery for inbox-driven resets. Use the security tab for normal password changes while signed in.
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
