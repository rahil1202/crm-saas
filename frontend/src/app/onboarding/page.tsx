"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Building2, CheckCircle2, LoaderCircle, Plus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { OnboardingTour } from "@/features/onboarding/onboarding-tour";

import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, ApiError } from "@/lib/api";
import { fetchAuthMe, readApiError, type AuthMePayload } from "@/lib/auth-client";
import { setCompanyCookie, setStoreCookie } from "@/lib/cookies";
import { getFrontendEnv } from "@/lib/env";

interface OnboardingResponse {
  companyId: string;
  storeId: string;
}

interface InviteRow {
  id: string;
  email: string;
  role: "owner" | "admin" | "member";
  storeScope: "company" | "primary";
}

const STEP_TITLES = ["Owner profile", "Primary branch", "Team invitations", "Role guidance", "Guided tour"];

export default function OnboardingPage() {
  const env = getFrontendEnv();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [authMe, setAuthMe] = useState<AuthMePayload | null>(null);
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null);
  const [tourRole, setTourRole] = useState<"owner" | "admin" | "member">("owner");
  const [tourCustomModules, setTourCustomModules] = useState<string[]>([]);
  const [tourPartnerAccess, setTourPartnerAccess] = useState(false);

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [storeName, setStoreName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [currency, setCurrency] = useState("INR");

  const [invites, setInvites] = useState<InviteRow[]>([{ id: crypto.randomUUID(), email: "", role: "member", storeScope: "company" }]);
  const [inviteErrors, setInviteErrors] = useState<Array<{ email: string; message: string }>>([]);

  const progress = useMemo(() => Math.round(((step + 1) / STEP_TITLES.length) * 100), [step]);

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      const me = await fetchAuthMe();

      if (!me) {
        router.replace("/auth/login");
        return;
      }

      if (!disposed) {
        if (!me.needsOnboarding) {
          router.replace("/dashboard");
          return;
        }

        setAuthMe(me);
        setFullName(me.user.fullName ?? "");
        setLoading(false);
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
    };
  }, [router]);

  const goNext = () => {
    setError(null);
    setStep((current) => Math.min(current + 1, STEP_TITLES.length - 1));
  };

  const goPrevious = () => {
    setError(null);
    setStep((current) => Math.max(current - 1, 0));
  };

  const handleInviteChange = (inviteId: string, field: keyof InviteRow, value: string | null) => {
    if (value === null) {
      return;
    }
    setInvites((current) =>
      current.map((row) =>
        row.id === inviteId
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    );
  };

  const handleAddInviteRow = () => {
    setInvites((current) => [...current, { id: crypto.randomUUID(), email: "", role: "member", storeScope: "company" }]);
  };

  const handleRemoveInviteRow = (inviteId: string) => {
    setInvites((current) => {
      if (current.length === 1) {
        return [{ ...current[0], email: "" }];
      }
      return current.filter((row) => row.id !== inviteId);
    });
  };

  const finalizeSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setInviteErrors([]);

    const onboardingResponse = await fetch(`${env.apiUrl}/api/v1/auth/onboarding`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName,
        companyName,
        storeName,
        timezone,
        currency,
      }),
    });

    if (!onboardingResponse.ok) {
      setError(await readApiError(onboardingResponse, "Onboarding failed"));
      setSubmitting(false);
      return;
    }

    const onboardingPayload = (await onboardingResponse.json()) as { data?: OnboardingResponse };
    const onboardingData = onboardingPayload.data;

    if (!onboardingData?.companyId || !onboardingData.storeId) {
      setError("Onboarding response is missing company context.");
      setSubmitting(false);
      return;
    }

    setCompanyCookie(onboardingData.companyId);
    setStoreCookie(onboardingData.storeId);
    setCreatedCompanyId(onboardingData.companyId);

    try {
      const refreshedMe = await apiRequest<AuthMePayload>("/auth/me", { skipCache: true });
      setAuthMe(refreshedMe);
      const currentMembership = refreshedMe.memberships?.find((membership) => membership.companyId === onboardingData.companyId) ?? null;
      if (currentMembership?.role === "owner" || currentMembership?.role === "admin" || currentMembership?.role === "member") {
        setTourRole(currentMembership.role);
      }
      setTourCustomModules(currentMembership?.customRoleModules ?? []);
      setTourPartnerAccess(Boolean(currentMembership?.isPartnerAccess));
    } catch {
      setTourRole("owner");
      setTourCustomModules([]);
      setTourPartnerAccess(false);
    }

    const inviteRows = invites.filter((invite) => invite.email.trim().length > 0);
    const failedInvites: Array<{ email: string; message: string }> = [];

    for (const invite of inviteRows) {
      try {
        await apiRequest("/auth/invite", {
          method: "POST",
          body: JSON.stringify({
            email: invite.email.trim(),
            role: invite.role,
            storeId: invite.storeScope === "primary" ? onboardingData.storeId : null,
            expiresInDays: 7,
          }),
        });
      } catch (caughtError) {
        const message = caughtError instanceof ApiError ? caughtError.message : "Unable to send invite.";
        failedInvites.push({ email: invite.email, message });
      }
    }

    if (failedInvites.length) {
      setInviteErrors(failedInvites);
      toast.error("Some invites failed. You can continue to the tour and resend later.");
    } else if (inviteRows.length) {
      toast.success("Invites sent successfully.");
    }

    setSubmitting(false);
    setStep(4);
  };

  const finishTour = () => {
    if (typeof window !== "undefined" && authMe?.user.id && createdCompanyId) {
      window.localStorage.setItem(`crm-saas-tour-completed:${authMe.user.id}:${createdCompanyId}`, "true");
    }
    router.replace("/dashboard");
  };

  return (
    <AuthShell
      badge="Onboarding"
      title="Set up your first workspace"
      description="Configure company basics, add teammates, and complete a guided CRM walkthrough."
    >
      {loading ? (
        <Alert>
          <LoaderCircle className="animate-spin" />
          <AlertTitle>Loading onboarding state</AlertTitle>
          <AlertDescription>Checking whether this account already belongs to a company workspace.</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Onboarding failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!loading ? (
        <Progress value={progress}>
          <ProgressLabel>{STEP_TITLES[step]}</ProgressLabel>
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">{progress}%</span>
        </Progress>
      ) : null}

      {!loading && step === 0 ? (
        <div className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="fullName">Owner name</FieldLabel>
              <Input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
              <FieldDescription>This name is used in ownership, assignments, and activity logs.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="companyName">Company name</FieldLabel>
              <Input id="companyName" value={companyName} onChange={(event) => setCompanyName(event.target.value)} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
              <Input id="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="currency">Currency</FieldLabel>
              <Input id="currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} required />
            </Field>
          </FieldGroup>

          <div className="flex items-center justify-end">
            <Button type="button" onClick={goNext} disabled={!fullName.trim() || !companyName.trim() || !timezone.trim() || !currency.trim()}>
              Next
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      ) : null}

      {!loading && step === 1 ? (
        <div className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="storeName">Primary branch or store</FieldLabel>
              <Input id="storeName" value={storeName} onChange={(event) => setStoreName(event.target.value)} required />
              <FieldDescription>You can add more branches after setup in Settings.</FieldDescription>
            </Field>
          </FieldGroup>

          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" onClick={goPrevious}>
              <ArrowLeft data-icon="inline-start" />
              Previous
            </Button>
            <Button type="button" onClick={goNext} disabled={!storeName.trim()}>
              Next
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      ) : null}

      {!loading && step === 2 ? (
        <div className="flex flex-col gap-6">
          <Card className="border-border/60">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users />
                <CardTitle>Invite your team</CardTitle>
              </div>
              <CardDescription>Add teammates now or continue and invite later from Team management.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {invites.map((invite, index) => (
                <div key={invite.id} className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 sm:grid-cols-2">
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor={`invite-email-${invite.id}`}>Email #{index + 1}</FieldLabel>
                    <Input
                      id={`invite-email-${invite.id}`}
                      type="email"
                      value={invite.email}
                      onChange={(event) => handleInviteChange(invite.id, "email", event.target.value)}
                      placeholder="teammate@company.com"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Role</FieldLabel>
                    <Select value={invite.role} onValueChange={(value) => handleInviteChange(invite.id, "role", value)}>
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
                  </Field>
                  <Field>
                    <FieldLabel>Scope</FieldLabel>
                    <Select value={invite.storeScope} onValueChange={(value) => handleInviteChange(invite.id, "storeScope", value)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="company">Company-wide</SelectItem>
                          <SelectItem value="primary">Primary branch only</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveInviteRow(invite.id)}>
                      Remove row
                    </Button>
                  </div>
                </div>
              ))}

              <Button type="button" variant="outline" size="sm" onClick={handleAddInviteRow}>
                <Plus data-icon="inline-start" />
                Add invite row
              </Button>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" onClick={goPrevious}>
              <ArrowLeft data-icon="inline-start" />
              Previous
            </Button>
            <Button type="button" onClick={goNext}>
              Next
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      ) : null}

      {!loading && step === 3 ? (
        <form onSubmit={finalizeSetup} className="flex flex-col gap-6">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle>Built-in roles and custom role guidance</CardTitle>
              <CardDescription>Start with built-in roles now. Fine-grained custom roles can be configured in Team management after setup.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="font-medium">Owner</p>
                <p className="text-sm text-muted-foreground">Full company access, billing-level authority, and owner safeguards.</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="font-medium">Admin</p>
                <p className="text-sm text-muted-foreground">Manages CRM modules, settings, and team operations.</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="font-medium">Member</p>
                <p className="text-sm text-muted-foreground">Core day-to-day CRM usage. Restrict further later with custom roles.</p>
              </div>
              <Badge variant="outline" className="w-fit">
                Custom role setup is available in Team page after workspace creation.
              </Badge>
            </CardContent>
          </Card>

          {inviteErrors.length ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Some invites could not be sent</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5">
                  {inviteErrors.map((entry) => (
                    <li key={`${entry.email}-${entry.message}`}>{entry.email}: {entry.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" onClick={goPrevious} disabled={submitting}>
              <ArrowLeft data-icon="inline-start" />
              Previous
            </Button>
            <Button type="submit" size="lg" disabled={submitting}>
              <Building2 data-icon="inline-start" />
              {submitting ? "Creating workspace..." : "Create workspace and start tour"}
            </Button>
          </div>
        </form>
      ) : null}

      {!loading && step === 4 ? (
        <OnboardingTour
          onFinish={finishTour}
          onSkipTour={finishTour}
          role={tourRole}
          customRoleModules={tourCustomModules}
          isPartnerAccess={tourPartnerAccess}
          description="Tour the key CRM modules now. You can replay this later from Settings > Tour."
        />
      ) : null}

      {!loading && step < 4 ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <UserPlus className="h-4 w-4" />
          Step {step + 1} of {STEP_TITLES.length}: {STEP_TITLES[step]}
        </div>
      ) : null}

      {!loading && step === 4 ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Workspace created</AlertTitle>
          <AlertDescription>Complete the tour or skip it to continue to the dashboard.</AlertDescription>
        </Alert>
      ) : null}
    </AuthShell>
  );
}
