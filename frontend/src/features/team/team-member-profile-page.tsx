"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, PencilLine } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, apiRequest } from "@/lib/api";
import { getInitials } from "@/lib/auth-ui";
import type { AuthMePayload } from "@/lib/auth-client";

type CompanyRole = "owner" | "admin" | "member";
type MembershipStatus = "active" | "disabled";
type ProfileTab = "overview" | "assigned-leads" | "activity";

type MemberRecord = {
  membershipId: string;
  userId: string;
  role: CompanyRole;
  customRoleId: string | null;
  customRoleName: string | null;
  status: string;
  storeId: string | null;
  storeName: string | null;
  email: string;
  fullName: string | null;
  createdAt: string;
  updatedAt: string;
};

type RoleDefinition = {
  id: string;
  name: string;
  modules: string[];
  createdAt: string;
  updatedAt: string;
};

type MemberDetailResponse = {
  member: MemberRecord;
  stats: {
    assignedLeads: number;
  };
  activity: {
    lastLoginAt: string | null;
    lastActivityAt: string | null;
  };
};

type LeadItem = {
  id: string;
  title: string;
  fullName: string | null;
  email: string | null;
  status: string;
  source: string | null;
  createdAt: string;
};

type LeadsResponse = {
  items: LeadItem[];
  total: number;
  limit: number;
  offset: number;
};

type ActivityItem = {
  id: string;
  eventType: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
};

type ActivityResponse = {
  items: ActivityItem[];
  total: number;
  limit: number;
  offset: number;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not Available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function normalizeStatus(value: string): MembershipStatus {
  return value === "disabled" ? "disabled" : "active";
}

export default function TeamMemberProfilePage() {
  const params = useParams<{ id: string }>();
  const memberId = params?.id;

  const [me, setMe] = useState<AuthMePayload | null>(null);
  const [detail, setDetail] = useState<MemberDetailResponse | null>(null);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [roleDraft, setRoleDraft] = useState<CompanyRole>("member");
  const [customRoleDraft, setCustomRoleDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<MembershipStatus>("active");
  const [saving, setSaving] = useState(false);

  const [leadQuery, setLeadQuery] = useState("");
  const [leadStatus, setLeadStatus] = useState("");
  const [leadsData, setLeadsData] = useState<LeadsResponse | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(false);

  const [activityData, setActivityData] = useState<ActivityResponse | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  const member = detail?.member ?? null;

  const loadDetail = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    setError(null);
    try {
      const [meResponse, detailResponse, rolesResponse] = await Promise.all([
        apiRequest<AuthMePayload>("/auth/me"),
        apiRequest<MemberDetailResponse>(`/users/memberships/${memberId}`),
        apiRequest<{ roles: RoleDefinition[] }>("/companies/current/roles"),
      ]);

      setMe(meResponse);
      setDetail(detailResponse);
      setRoles(rolesResponse.roles ?? []);
      setRoleDraft(detailResponse.member.role);
      setCustomRoleDraft(detailResponse.member.customRoleId ?? "");
      setStatusDraft(normalizeStatus(detailResponse.member.status));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load team member profile.");
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  const loadAssignedLeads = useCallback(async () => {
    if (!memberId) return;
    setLeadsLoading(true);
    try {
      const query = new URLSearchParams();
      if (leadQuery.trim()) query.set("q", leadQuery.trim());
      if (leadStatus) query.set("status", leadStatus);
      const response = await apiRequest<LeadsResponse>(`/users/memberships/${memberId}/assigned-leads?${query.toString()}`);
      setLeadsData(response);
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to load assigned leads.";
      setError(message);
    } finally {
      setLeadsLoading(false);
    }
  }, [memberId, leadQuery, leadStatus]);

  const loadActivity = useCallback(async () => {
    if (!memberId) return;
    setActivityLoading(true);
    try {
      const response = await apiRequest<ActivityResponse>(`/users/memberships/${memberId}/activity?limit=30&offset=0`);
      setActivityData(response);
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to load activity timeline.";
      setError(message);
    } finally {
      setActivityLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (tab === "assigned-leads") {
      void loadAssignedLeads();
    }
    if (tab === "activity") {
      void loadActivity();
    }
  }, [loadActivity, loadAssignedLeads, tab]);

  const isSelf = useMemo(() => member?.userId === me?.user.id, [me?.user.id, member?.userId]);

  const handleSave = async () => {
    if (!member) return;
    if (isSelf) {
      toast.error("Your own membership role is protected.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/users/memberships/${member.membershipId}`, {
        method: "PATCH",
        body: JSON.stringify({
          role: roleDraft,
          customRoleId: roleDraft === "member" ? (customRoleDraft || null) : null,
          status: statusDraft,
        }),
      });
      toast.success("Team member updated.");
      setEditing(false);
      await loadDetail();
      if (tab === "activity") {
        await loadActivity();
      }
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to update team member.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusToggle = async () => {
    if (!member) return;
    if (isSelf) {
      toast.error("Your own membership status is protected.");
      return;
    }
    const nextStatus: MembershipStatus = normalizeStatus(member.status) === "active" ? "disabled" : "active";
    try {
      await apiRequest(`/users/memberships/${member.membershipId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      toast.success(nextStatus === "active" ? "Member reactivated." : "Member deactivated.");
      await loadDetail();
      if (tab === "activity") {
        await loadActivity();
      }
    } catch (requestError) {
      const message = requestError instanceof ApiError ? requestError.message : "Unable to change member status.";
      setError(message);
      toast.error(message);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_280px]">
      <aside className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 p-6">
          <Link href="/dashboard/team" className="inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:text-sky-700">
            <ArrowLeft className="size-4" /> Back To Teams
          </Link>
          <div className="mt-6 flex items-center gap-4">
            <Avatar size="lg">
              <AvatarFallback>{getInitials(member?.fullName?.trim() || member?.email || "TM")}</AvatarFallback>
            </Avatar>
            <div>
              <div className="text-2xl font-semibold text-slate-900">{member?.fullName?.trim() || "Team Member"}</div>
              <div className="text-sm text-slate-500">{member?.storeName ?? "Company-wide"}</div>
            </div>
          </div>
          <div className="mt-4 text-base text-sky-600">{member?.email ?? "Not Available"}</div>
        </div>
      </aside>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-7 py-6">
          <div className="text-3xl font-semibold tracking-tight text-slate-900">Team Member</div>
          <Tabs value={tab} onValueChange={(value) => setTab(value as ProfileTab)} className="mt-5">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="assigned-leads">Assigned Leads</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6 space-y-6">
              <div className="grid gap-7 md:grid-cols-3">
                <div>
                  <div className="text-sm text-slate-500">Created On</div>
                  <div className="mt-1 text-base text-slate-900">{formatDateTime(member?.createdAt)}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">Updated At</div>
                  <div className="mt-1 text-base text-slate-900">{formatDateTime(member?.updatedAt)}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">Last Login</div>
                  <div className="mt-1 text-base text-slate-900">{formatDateTime(detail?.activity.lastLoginAt)}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">Last Activity</div>
                  <div className="mt-1 text-base text-slate-900">{formatDateTime(detail?.activity.lastActivityAt)}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">Assigned Leads</div>
                  <div className="mt-1 text-base text-slate-900">{detail?.stats.assignedLeads ?? 0}</div>
                </div>
              </div>

              <div className="mb-1 flex items-center justify-between">
                <div className="text-2xl font-semibold tracking-tight text-slate-900">Access</div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing((current) => !current)} disabled={!member || isSelf}>
                    <PencilLine className="size-4" /> {editing ? "Cancel" : "Edit"}
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => void handleStatusToggle()} disabled={!member || isSelf}>
                    {normalizeStatus(member?.status ?? "active") === "active" ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </div>

              {editing ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <Field>
                    <FieldLabel>Role</FieldLabel>
                    <NativeSelect value={roleDraft} onChange={(event) => setRoleDraft(event.target.value as CompanyRole)}>
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel>Custom Role</FieldLabel>
                    <NativeSelect value={customRoleDraft} onChange={(event) => setCustomRoleDraft(event.target.value)} disabled={roleDraft !== "member"}>
                      <option value="">None</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel>Status</FieldLabel>
                    <NativeSelect value={statusDraft} onChange={(event) => setStatusDraft(event.target.value as MembershipStatus)}>
                      <option value="active">Active</option>
                      <option value="disabled">Disabled</option>
                    </NativeSelect>
                  </Field>
                  <div className="md:col-span-3 flex justify-end">
                    <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-7 md:grid-cols-3">
                  <div>
                    <div className="text-sm text-slate-500">Role</div>
                    <div className="mt-2"><Badge variant="outline" className="capitalize">{member?.role ?? "member"}</Badge></div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">Custom Role</div>
                    <div className="mt-1 text-xl text-slate-900">{member?.customRoleName ?? "Not Available"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">Status</div>
                    <div className="mt-2">
                      <Badge variant={normalizeStatus(member?.status ?? "active") === "active" ? "secondary" : "outline"} className="capitalize">
                        {normalizeStatus(member?.status ?? "active")}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="assigned-leads" className="mt-6 space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
                <input
                  value={leadQuery}
                  onChange={(event) => setLeadQuery(event.target.value)}
                  placeholder="Search leads"
                  className="h-10 rounded-md border border-slate-200 px-3 text-sm"
                />
                <NativeSelect value={leadStatus} onChange={(event) => setLeadStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="new">New</option>
                  <option value="qualified">Qualified</option>
                  <option value="proposal">Proposal</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </NativeSelect>
                <Button type="button" variant="outline" onClick={() => void loadAssignedLeads()}>Apply</Button>
              </div>

              {leadsLoading ? <div className="text-sm text-slate-500">Loading assigned leads...</div> : null}
              <div className="space-y-2">
                {(leadsData?.items ?? []).map((lead) => (
                  <div key={lead.id} className="rounded-xl border border-slate-100 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-slate-900">{lead.title}</div>
                        <div className="text-xs text-slate-500">{lead.fullName ?? "No name"} · {lead.email ?? "No email"}</div>
                      </div>
                      <Badge variant="outline" className="capitalize">{lead.status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">Source: {lead.source ?? "N/A"} · Created {formatDateTime(lead.createdAt)}</div>
                  </div>
                ))}
                {!leadsLoading && (leadsData?.items.length ?? 0) === 0 ? <div className="text-sm text-slate-500">No assigned leads found.</div> : null}
              </div>
            </TabsContent>

            <TabsContent value="activity" className="mt-6">
              {activityLoading ? <div className="text-sm text-slate-500">Loading activity timeline...</div> : null}
              <div className="space-y-3">
                {(activityData?.items ?? []).map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-100 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-900">{item.summary}</div>
                      <div className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{item.eventType} · by {item.actorName ?? item.actorEmail ?? "System"}</div>
                  </div>
                ))}
                {!activityLoading && (activityData?.items.length ?? 0) === 0 ? <div className="text-sm text-slate-500">No activity available.</div> : null}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {isSelf ? <div className="border-t border-slate-100 px-7 py-4 text-sm text-slate-500">Your own membership cannot be edited from this screen.</div> : null}

        {error ? (
          <div className="border-t border-slate-100 px-7 py-5">
            <Alert variant="destructive">
              <AlertTitle>Team profile error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        {loading ? <div className="border-t border-slate-100 px-7 py-5 text-sm text-slate-500">Loading team member profile...</div> : null}
      </section>

      <aside className="h-fit overflow-hidden rounded-3xl border border-slate-200 bg-white p-6">
        <div className="text-3xl font-semibold tracking-tight text-slate-900">Status Breakdown</div>
        <div className="mt-3 text-sm text-slate-500">Membership and assignment snapshot.</div>
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm">
            <span className="text-slate-600">Membership</span>
            <span className="font-medium text-slate-900 capitalize">{normalizeStatus(member?.status ?? "active")}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2 text-sm">
            <span className="text-slate-600">Assigned Leads</span>
            <span className="font-medium text-slate-900">{detail?.stats.assignedLeads ?? 0}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
