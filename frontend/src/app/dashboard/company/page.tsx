"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, DoorOpen, Mail, Phone, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, apiRequest } from "@/lib/api";
import { clearCompanyCookie, clearStoreCookie, getCompanyCookie, setCompanyCookie, setStoreCookie } from "@/lib/cookies";
import { clearCachedMe } from "@/lib/me-cache";
import { rememberPartnerCompanySelection } from "@/lib/partner-access";
import { cn } from "@/lib/utils";

type PartnerCompanyItem = {
  companyId: string;
  companyName: string;
  timezone: string;
  currency: string;
  membershipId: string;
  role: "owner" | "admin" | "member";
  storeId: string | null;
  storeName: string | null;
  partnerCompanyId: string;
  partnerCompanyName: string;
  partnerStatus: "active" | "inactive";
  partnerContactName: string | null;
  partnerEmail: string | null;
  partnerPhone: string | null;
  linkedAt: string;
  lastAccessAt: string | null;
  planName: string | null;
  planStatus: string | null;
};

type PartnerCompaniesResponse = {
  items: PartnerCompanyItem[];
};

type CurrentCompanyResponse = {
  company: {
    id: string;
    name: string;
    timezone: string;
    currency: string;
  };
  plan: {
    planName: string;
    status: string;
    seatLimit: number;
    monthlyPrice: number;
  } | null;
  stores: Array<{ id: string }>;
  members: Array<{
    membershipId: string;
    fullName: string | null;
    email: string;
    role: "owner" | "admin" | "member";
    customRoleName: string | null;
    storeName: string | null;
  }>;
  invites: Array<{ inviteId: string }>;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function LeaveCompanyDialog({
  company,
  submitting,
  onCancel,
  onConfirm,
}: {
  company: PartnerCompanyItem;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[1.75rem] border border-border/70 bg-white p-5 shadow-[0_30px_90px_-45px_rgba(15,23,42,0.45)]">
        <div className="text-lg font-semibold text-slate-900">Leave company?</div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This removes your partner access from <span className="font-medium text-slate-900">{company.companyName}</span>. You will need a new link from an admin to rejoin later.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="destructive" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" disabled={submitting} onClick={onConfirm}>
            {submitting ? "Leaving..." : "Confirm leave"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PartnerCompanyPage() {
  const [companies, setCompanies] = useState<PartnerCompanyItem[]>([]);
  const [currentCompany, setCurrentCompany] = useState<CurrentCompanyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<PartnerCompanyItem | null>(null);
  const [leaving, setLeaving] = useState(false);

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const partnerCompanies = await apiRequest<PartnerCompaniesResponse>("/partners/me/companies");
      const cookieCompanyId = getCompanyCookie();
      const resolvedActiveCompany =
        partnerCompanies.items.find((item) => item.companyId === cookieCompanyId) ??
        partnerCompanies.items[0] ??
        null;

      if (!resolvedActiveCompany) {
        throw new Error("No partner companies are available for this account.");
      }

      if (resolvedActiveCompany.companyId !== cookieCompanyId) {
        setCompanyCookie(resolvedActiveCompany.companyId);
      }

      if (resolvedActiveCompany.storeId) {
        setStoreCookie(resolvedActiveCompany.storeId);
      } else {
        clearStoreCookie();
      }

      const currentCompanyPayload = await apiRequest<CurrentCompanyResponse>("/companies/current", {
        skipCache: true,
      });

      setCompanies(partnerCompanies.items);
      setCurrentCompany(currentCompanyPayload);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to load partner companies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const activeCompanyId = currentCompany?.company.id ?? getCompanyCookie();
  const activePartnerCompany = useMemo(
    () => companies.find((item) => item.companyId === activeCompanyId) ?? null,
    [activeCompanyId, companies],
  );
  const supportContacts = useMemo(
    () => currentCompany?.members.filter((member) => member.role === "owner" || member.role === "admin").slice(0, 6) ?? [],
    [currentCompany?.members],
  );

  const handleCompanySelect = (company: PartnerCompanyItem) => {
    setCompanyCookie(company.companyId);
    if (company.storeId) {
      setStoreCookie(company.storeId);
    } else {
      clearStoreCookie();
    }
    rememberPartnerCompanySelection(company.companyId);
    window.location.assign("/dashboard");
  };

  const handleLeaveCompany = async () => {
    if (!leaveTarget) {
      return;
    }

    setLeaving(true);
    setError(null);

    try {
      const response = await apiRequest<{ remainingCompanyIds: string[] }>(`/partners/me/companies/${leaveTarget.companyId}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });

      const nextCompanyId = response.remainingCompanyIds[0] ?? null;
      const nextCompany = companies.find((item) => item.companyId === nextCompanyId) ?? null;

      clearCachedMe();
      if (nextCompany) {
        setCompanyCookie(nextCompany.companyId);
        if (nextCompany.storeId) {
          setStoreCookie(nextCompany.storeId);
        } else {
          clearStoreCookie();
        }
        rememberPartnerCompanySelection(nextCompany.companyId);
      } else {
        clearCompanyCookie();
        clearStoreCookie();
      }

      window.location.assign("/dashboard/company");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Unable to leave company");
      setLeaving(false);
      return;
    }
  };

  return (
    <div className="grid gap-6">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Company access request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="rounded-[1.75rem] border border-dashed border-border/70 bg-white/70 px-5 py-12 text-center text-sm text-muted-foreground">
          Loading partner company access...
        </div>
      ) : null}

      {!loading && currentCompany && activePartnerCompany ? (
        <>
          <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="overflow-hidden border-sky-200/70 bg-linear-to-br from-sky-950 via-sky-700 to-cyan-500 text-white">
              <CardHeader className="gap-4">
                <Badge className="w-fit border-white/15 bg-white/12 text-white">Active company</Badge>
                <CardTitle className="text-3xl text-white">{currentCompany.company.name}</CardTitle>
                <CardDescription className="text-white/78">
                  Choose the company you want to continue with before entering the dashboard. You can return here any time from the sidebar.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[1.35rem] border border-white/15 bg-white/10 p-4">
                  <div className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/65">Timezone</div>
                  <div className="mt-3 text-lg font-semibold">{currentCompany.company.timezone}</div>
                </div>
                <div className="rounded-[1.35rem] border border-white/15 bg-white/10 p-4">
                  <div className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/65">Currency</div>
                  <div className="mt-3 text-lg font-semibold">{currentCompany.company.currency}</div>
                </div>
                <div className="rounded-[1.35rem] border border-white/15 bg-white/10 p-4">
                  <div className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/65">Workspace members</div>
                  <div className="mt-3 text-lg font-semibold">{currentCompany.members.length}</div>
                </div>
                <div className="rounded-[1.35rem] border border-white/15 bg-white/10 p-4">
                  <div className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-white/65">Branches</div>
                  <div className="mt-3 text-lg font-semibold">{currentCompany.stores.length}</div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-white/85">
              <CardHeader>
                <CardTitle>Partner relationship</CardTitle>
                <CardDescription>Your linked partner access for the currently active company.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="rounded-[1.35rem] border border-border/70 bg-slate-50/70 p-4">
                  <div className="text-sm text-muted-foreground">Partner company</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{activePartnerCompany.partnerCompanyName}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="secondary">{activePartnerCompany.partnerStatus}</Badge>
                    <Badge variant="outline">{activePartnerCompany.role}</Badge>
                    {activePartnerCompany.planName ? <Badge variant="outline">{activePartnerCompany.planName}</Badge> : null}
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border/70 px-4 py-3">
                    <div className="text-sm text-muted-foreground">Contact</div>
                    <div className="mt-1 font-medium text-slate-900">{activePartnerCompany.partnerContactName ?? "Not set"}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 px-4 py-3">
                    <div className="text-sm text-muted-foreground">Branch scope</div>
                    <div className="mt-1 font-medium text-slate-900">{activePartnerCompany.storeName ?? "Company-wide"}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="size-4" />
                      Email
                    </div>
                    <div className="mt-1 font-medium text-slate-900">{activePartnerCompany.partnerEmail ?? "Not set"}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="size-4" />
                      Phone
                    </div>
                    <div className="mt-1 font-medium text-slate-900">{activePartnerCompany.partnerPhone ?? "Not set"}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ShieldCheck className="size-4" />
                      Linked since
                    </div>
                    <div className="mt-1 font-medium text-slate-900">{formatDateTime(activePartnerCompany.linkedAt)}</div>
                  </div>
                  <div className="rounded-xl border border-border/70 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="size-4" />
                      Last access
                    </div>
                    <div className="mt-1 font-medium text-slate-900">{formatDateTime(activePartnerCompany.lastAccessAt)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <Card className="border-border/70 bg-white/88">
              <CardHeader>
                <CardTitle>Internal support contacts</CardTitle>
                <CardDescription>Owners and admins for the active company in case you need help or escalation.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {supportContacts.length > 0 ? (
                  supportContacts.map((contact) => (
                    <div key={contact.membershipId} className="rounded-xl border border-border/70 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-900">{contact.fullName || contact.email}</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge variant="outline">{contact.role}</Badge>
                            {contact.storeName ? <Badge variant="secondary">{contact.storeName}</Badge> : null}
                          </div>
                        </div>
                        <ShieldCheck className="size-4 text-sky-600" />
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Mail className="size-4" />
                          <span>{contact.email}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                    No owner or admin contacts are available for this company yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-white/88">
              <CardHeader>
                <CardTitle>Partner access notes</CardTitle>
                <CardDescription>Useful context for working inside this company as a partner.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-muted-foreground">
                <div className="rounded-xl border border-border/70 px-4 py-3">
                  Your active scope is <span className="font-medium text-slate-900">{activePartnerCompany.storeName ?? "company-wide"}</span>.
                </div>
                <div className="rounded-xl border border-border/70 px-4 py-3">
                  Campaigns, templates, and integrations are available from the sidebar for this company.
                </div>
                <div className="rounded-xl border border-border/70 px-4 py-3">
                  If your access needs to be changed, contact an owner or admin before leaving this company.
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4">
            <div>
              <div className="text-lg font-semibold text-slate-900">Choose company</div>
              <p className="text-sm text-muted-foreground">Select the company workspace you want to continue with or remove your access from one of them.</p>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {companies.map((company) => {
                const isActive = company.companyId === activeCompanyId;

                return (
                  <Card
                    key={company.companyId}
                    className={cn(
                      "border-border/70 bg-white/88 transition-shadow",
                      isActive && "border-sky-300/90 shadow-[0_24px_60px_-40px_rgba(56,122,199,0.45)]",
                    )}
                  >
                    <CardHeader className="gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-xl">{company.companyName}</CardTitle>
                          <CardDescription className="mt-1">{company.partnerCompanyName}</CardDescription>
                        </div>
                        <Badge variant={isActive ? "secondary" : "outline"}>{isActive ? "Current" : company.role}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                        <div className="rounded-xl border border-border/70 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Plan</div>
                          <div className="mt-1 font-medium text-slate-900">{company.planName ?? "No plan"}</div>
                        </div>
                        <div className="rounded-xl border border-border/70 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Scope</div>
                          <div className="mt-1 font-medium text-slate-900">{company.storeName ?? "Company-wide"}</div>
                        </div>
                        <div className="rounded-xl border border-border/70 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Timezone</div>
                          <div className="mt-1 font-medium text-slate-900">{company.timezone}</div>
                        </div>
                        <div className="rounded-xl border border-border/70 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Currency</div>
                          <div className="mt-1 font-medium text-slate-900">{company.currency}</div>
                        </div>
                      </div>

                      <div className="flex flex-wrap justify-between gap-2">
                        <Button type="button" onClick={() => handleCompanySelect(company)} disabled={isActive}>
                          <Building2 className="size-4" />
                          {isActive ? "Already selected" : "Continue with this company"}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setLeaveTarget(company)}>
                          <DoorOpen className="size-4" />
                          Leave company
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      {leaveTarget ? (
        <LeaveCompanyDialog company={leaveTarget} submitting={leaving} onCancel={() => setLeaveTarget(null)} onConfirm={() => void handleLeaveCompany()} />
      ) : null}
    </div>
  );
}
