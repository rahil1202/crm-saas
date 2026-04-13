"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Copy, Link2, Send, Users } from "lucide-react";
import { toast } from "sonner";

import { FormErrorSummary, FormSection } from "@/components/forms/form-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CrudPanel, EmptyState, LoadingState, PageSection, StatCard } from "@/components/ui/page-patterns";
import { Textarea } from "@/components/ui/textarea";
import { useAsyncForm } from "@/hooks/use-async-form";
import { apiRequest } from "@/lib/api";

interface CompanyAdminResponse {
  company: {
    id: string;
    name: string;
    timezone: string;
    currency: string;
  };
  plan: {
    planCode: string;
    planName: string;
    status: string;
    billingInterval: string;
    seatLimit: number;
    monthlyPrice: number;
    currency: string;
    trialEndsAt: string | null;
    renewalDate: string | null;
    notes: string | null;
  } | null;
  stores: Array<{
    id: string;
    name: string;
    code: string;
    isDefault: boolean;
  }>;
  members: Array<{
    membershipId: string;
  }>;
  invites: Array<{
    inviteId: string;
    email: string;
    role: string;
    status: string;
    storeId: string | null;
    storeName: string | null;
    referralCode: string | null;
    inviteMessage: string | null;
    inviterName: string | null;
    inviterEmail: string | null;
    expiresAt: string;
    acceptedAt: string | null;
    createdAt: string;
    inviteUrl: string;
  }>;
  referralCodes: Array<{
    id: string;
    code: string;
    isActive: boolean;
    referrerUserId: string;
    referrerName: string | null;
    referrerEmail: string | null;
    createdAt: string;
    referralUrl: string;
  }>;
  referralAttributions: Array<{
    id: string;
    referralCodeId: string;
    referralCode: string | null;
    status: string;
    referrerUserId: string;
    referrerName: string | null;
    referrerEmail: string | null;
    referredUserId: string | null;
    referredEmail: string | null;
    inviteId: string | null;
    capturedAt: string;
    registeredAt: string | null;
    verifiedAt: string | null;
    joinedCompanyAt: string | null;
    completedOnboardingAt: string | null;
    createdAt: string;
  }>;
}

interface CompanyPlanResponse {
  plan: CompanyAdminResponse["plan"];
}

interface InviteCreateResponse {
  inviteId: string;
  inviteUrl: string;
  referralCode: string | null;
}

interface ReferralCreateResponse {
  referralCode: string;
  referralUrl: string;
  createdAt: string;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Date(value).toLocaleString();
}

function getInviteStatus(invite: CompanyAdminResponse["invites"][number]) {
  if (invite.status === "accepted") {
    return "accepted";
  }

  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    return "expired";
  }

  return invite.status;
}

export default function CompanyAdminPage() {
  const [snapshot, setSnapshot] = useState<CompanyAdminResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteStoreId, setInviteStoreId] = useState("");
  const [inviteExpiresInDays, setInviteExpiresInDays] = useState("7");
  const [inviteMessage, setInviteMessage] = useState("");
  const [creatingReferral, setCreatingReferral] = useState(false);
  const { submitting, formError, fieldErrors, clearFieldError, runSubmit } = useAsyncForm();

  const loadSnapshot = async () => {
    const [companySnapshot, planPayload] = await Promise.all([
      apiRequest<CompanyAdminResponse>("/companies/current"),
      apiRequest<CompanyPlanResponse>("/companies/current/plan"),
    ]);

    setSnapshot({
      ...companySnapshot,
      plan: planPayload.plan,
    });
  };

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      try {
        const [companySnapshot, planPayload] = await Promise.all([
          apiRequest<CompanyAdminResponse>("/companies/current"),
          apiRequest<CompanyPlanResponse>("/companies/current/plan"),
        ]);

        if (!disposed) {
          setSnapshot({
            ...companySnapshot,
            plan: planPayload.plan,
          });
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      disposed = true;
    };
  }, []);

  const pendingInviteCount = useMemo(() => snapshot?.invites.filter((item) => getInviteStatus(item) === "pending").length ?? 0, [snapshot]);
  const completedReferralCount = useMemo(
    () => snapshot?.referralAttributions.filter((item) => item.status === "completed_onboarding").length ?? 0,
    [snapshot],
  );

  const createBranch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await runSubmit(
        async () => {
          await apiRequest<{ store: CompanyAdminResponse["stores"][number] }>("/companies/stores", {
            method: "POST",
            body: JSON.stringify({
              name: branchName,
              code: branchCode,
            }),
          });

          await loadSnapshot();
          return { ok: true };
        },
        "Unable to create branch",
      );

      setBranchName("");
      setBranchCode("");
      toast.success("Branch created.");
    } catch {}
  };

  const createInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const response = await runSubmit(
        async () => {
          const created = await apiRequest<InviteCreateResponse>("/auth/invite", {
            method: "POST",
            body: JSON.stringify({
              email: inviteEmail,
              role: inviteRole,
              storeId: inviteStoreId || undefined,
              expiresInDays: Number(inviteExpiresInDays),
              inviteMessage: inviteMessage || undefined,
            }),
          });

          await loadSnapshot();
          return created;
        },
        "Unable to create invite",
      );

      setInviteEmail("");
      setInviteRole("member");
      setInviteStoreId("");
      setInviteExpiresInDays("7");
      setInviteMessage("");
      await navigator.clipboard.writeText(response.inviteUrl);
      toast.success("Invite created and copied.");
    } catch {}
  };

  const createReferral = async () => {
    setCreatingReferral(true);
    try {
      const response = await apiRequest<ReferralCreateResponse>("/auth/referrals", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await loadSnapshot();
      await navigator.clipboard.writeText(response.referralUrl);
      toast.success("Referral link copied.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create referral link");
    } finally {
      setCreatingReferral(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied.`);
  };

  return (
    <>
      <div className="grid gap-6">
        <FormErrorSummary title="Company admin request failed" error={formError} />

        {loading ? <LoadingState label="Loading company admin data..." /> : null}

        {snapshot ? (
          <PageSection>
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <CrudPanel title="Workspace overview" description="Operational identity, current plan, and growth signals for the active company.">
                <div className="grid gap-3">
                  <div className="rounded-xl border px-4 py-3">
                    <div className="text-sm text-muted-foreground">Company</div>
                    <div className="mt-1 font-medium">{snapshot.company.name}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {snapshot.company.timezone} • {snapshot.company.currency}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <StatCard label="Members" value={snapshot.members.length} />
                    <StatCard label="Pending invites" value={pendingInviteCount} />
                    <StatCard label="Referral links" value={snapshot.referralCodes.length} />
                    <StatCard label="Completed referrals" value={completedReferralCount} />
                  </div>
                  <div className="rounded-xl border px-4 py-3">
                    <div className="text-sm text-muted-foreground">Plan</div>
                    <div className="mt-1 font-medium">
                      {snapshot.plan?.planName ?? "No plan assigned"} {snapshot.plan ? `(${snapshot.plan.status})` : ""}
                    </div>
                    {snapshot.plan ? (
                      <div className="mt-1 text-sm text-muted-foreground">
                        {snapshot.plan.seatLimit} seats • ${snapshot.plan.monthlyPrice}/mo • {snapshot.plan.billingInterval}
                      </div>
                    ) : null}
                  </div>
                </div>
              </CrudPanel>

              <CrudPanel title="Branch management" description="Add company branches and keep store scope ready for invites and operations.">
                <div className="grid gap-4">
                  <form className="grid gap-4 rounded-xl border bg-muted/20 p-4" onSubmit={createBranch}>
                    <FormSection title="Create branch" description="Use a stable code that can be reused in invites and store scoping.">
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor="branch-name">Branch name</FieldLabel>
                          <Input
                            id="branch-name"
                            value={branchName}
                            onChange={(event) => {
                              clearFieldError("name");
                              setBranchName(event.target.value);
                            }}
                            required
                          />
                          <FieldError errors={fieldErrors.name?.map((message) => ({ message }))} />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="branch-code">Branch code</FieldLabel>
                          <Input
                            id="branch-code"
                            value={branchCode}
                            onChange={(event) => {
                              clearFieldError("code");
                              setBranchCode(event.target.value);
                            }}
                            required
                          />
                          <FieldError errors={fieldErrors.code?.map((message) => ({ message }))} />
                        </Field>
                      </FieldGroup>
                    </FormSection>
                    <Button type="submit" disabled={submitting} className="w-fit">
                      {submitting ? "Creating..." : "Create branch"}
                    </Button>
                  </form>

                  <div className="grid gap-3">
                    {snapshot.stores.map((store) => (
                      <div key={store.id} className="rounded-xl border px-4 py-3">
                        <div className="font-medium">{store.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {store.code} {store.isDefault ? "• default branch" : ""}
                        </div>
                      </div>
                    ))}
                    {snapshot.stores.length === 0 ? <EmptyState title="No branches yet" description="Create the first branch to scope members and workspace operations." /> : null}
                  </div>
                </div>
              </CrudPanel>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <CrudPanel title="Invites" description="Create team invites, scope them to a branch, and copy registration links.">
                <div className="grid gap-4">
                  <form className="grid gap-4 rounded-xl border bg-muted/20 p-4" onSubmit={createInvite}>
                    <FormSection title="Create invite" description="Invites use the register route and can carry referral attribution at the same time.">
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor="invite-email">Email</FieldLabel>
                          <Input
                            id="invite-email"
                            type="email"
                            value={inviteEmail}
                            onChange={(event) => {
                              clearFieldError("email");
                              setInviteEmail(event.target.value);
                            }}
                            required
                          />
                          <FieldError errors={fieldErrors.email?.map((message) => ({ message }))} />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="invite-role">Role</FieldLabel>
                          <NativeSelect id="invite-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </NativeSelect>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="invite-store">Branch</FieldLabel>
                          <NativeSelect id="invite-store" value={inviteStoreId} onChange={(event) => setInviteStoreId(event.target.value)}>
                            <option value="">All branches</option>
                            {snapshot.stores.map((store) => (
                              <option key={store.id} value={store.id}>
                                {store.name}
                              </option>
                            ))}
                          </NativeSelect>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="invite-expiry">Expires in days</FieldLabel>
                          <Input id="invite-expiry" type="number" min="1" max="30" value={inviteExpiresInDays} onChange={(event) => setInviteExpiresInDays(event.target.value)} required />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="invite-message">Message</FieldLabel>
                          <Textarea id="invite-message" value={inviteMessage} onChange={(event) => setInviteMessage(event.target.value)} placeholder="Optional note that will be visible on the register page." />
                          <FieldDescription>This is informational only in v1 and does not send email by itself.</FieldDescription>
                        </Field>
                      </FieldGroup>
                    </FormSection>
                    <Button type="submit" disabled={submitting} className="w-fit">
                      <Send data-icon="inline-start" />
                      {submitting ? "Creating..." : "Create invite"}
                    </Button>
                  </form>

                  <div className="grid gap-3">
                    {snapshot.invites.map((invite) => (
                      <div key={invite.inviteId} className="grid gap-3 rounded-xl border px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-medium">{invite.email}</div>
                            <div className="text-sm text-muted-foreground">
                              {invite.role}
                              {invite.storeName ? ` • ${invite.storeName}` : " • all branches"}
                              {invite.referralCode ? ` • referral ${invite.referralCode}` : ""}
                            </div>
                          </div>
                          <Badge variant={getInviteStatus(invite) === "accepted" ? "secondary" : "outline"}>{getInviteStatus(invite)}</Badge>
                        </div>
                        {invite.inviteMessage ? <div className="text-sm text-muted-foreground">{invite.inviteMessage}</div> : null}
                        <div className="text-xs text-muted-foreground">
                          Created {formatDate(invite.createdAt)} by {invite.inviterName ?? invite.inviterEmail ?? "Unknown"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Expires {formatDate(invite.expiresAt)}
                          {invite.acceptedAt ? ` • accepted ${formatDate(invite.acceptedAt)}` : ""}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => void copyText(invite.inviteUrl, "Invite link")}>
                            <Copy data-icon="inline-start" />
                            Copy invite link
                          </Button>
                        </div>
                      </div>
                    ))}
                    {snapshot.invites.length === 0 ? <EmptyState title="No invites yet" description="Create the first invite to onboard a teammate through the register flow." /> : null}
                  </div>
                </div>
              </CrudPanel>

              <CrudPanel title="Referrals" description="Generate referral links and review attribution progress from capture to onboarding completion.">
                <div className="grid gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
                    <div>
                      <div className="font-medium">Create referral link</div>
                      <div className="text-sm text-muted-foreground">One active company-scoped referral code is maintained per admin user.</div>
                    </div>
                    <Button type="button" onClick={() => void createReferral()} disabled={creatingReferral}>
                      <Link2 data-icon="inline-start" />
                      {creatingReferral ? "Generating..." : "Generate link"}
                    </Button>
                  </div>

                  <div className="grid gap-3">
                    {snapshot.referralCodes.map((code) => (
                      <div key={code.id} className="grid gap-3 rounded-xl border px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-medium">{code.code}</div>
                            <div className="text-sm text-muted-foreground">{code.referrerName ?? code.referrerEmail ?? code.referrerUserId}</div>
                          </div>
                          <Badge variant={code.isActive ? "secondary" : "outline"}>{code.isActive ? "active" : "inactive"}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">Created {formatDate(code.createdAt)}</div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => void copyText(code.referralUrl, "Referral link")}>
                            <Copy data-icon="inline-start" />
                            Copy referral link
                          </Button>
                        </div>
                      </div>
                    ))}
                    {snapshot.referralCodes.length === 0 ? <EmptyState title="No referral links yet" description="Generate the first referral link for your company operators." /> : null}
                  </div>

                  <div className="grid gap-3">
                    {snapshot.referralAttributions.map((attribution) => (
                      <div key={attribution.id} className="grid gap-2 rounded-xl border px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">{attribution.referredEmail ?? attribution.referredUserId ?? "Pending referral"}</div>
                          <Badge variant={attribution.status === "completed_onboarding" ? "secondary" : "outline"}>{attribution.status}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Code {attribution.referralCode ?? "Unknown"} • Referrer {attribution.referrerName ?? attribution.referrerEmail ?? attribution.referrerUserId}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Captured {formatDate(attribution.capturedAt)}</span>
                          <span>Registered {formatDate(attribution.registeredAt)}</span>
                          <span>Verified {formatDate(attribution.verifiedAt)}</span>
                          <span>Joined company {formatDate(attribution.joinedCompanyAt)}</span>
                          <span>Completed onboarding {formatDate(attribution.completedOnboardingAt)}</span>
                        </div>
                      </div>
                    ))}
                    {snapshot.referralAttributions.length === 0 ? (
                      <EmptyState title="No referral attributions yet" description="Referral traffic will appear here as soon as referred users register or finish onboarding." />
                    ) : null}
                  </div>
                </div>
              </CrudPanel>
            </div>
          </PageSection>
        ) : null}
      </div>
    </>
  );
}

