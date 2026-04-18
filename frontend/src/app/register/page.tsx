"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, MailCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth/auth-shell";
import { FormErrorSummary, FormSection } from "@/components/forms/form-primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { GoogleIcon } from "@/components/ui/google-icon";
import { Input } from "@/components/ui/input";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { apiRequest } from "@/lib/api";
import { evaluatePasswordStrength } from "@/lib/auth-ui";
import { savePendingInviteReferralContext } from "@/lib/invite-referral";
import { supabase } from "@/lib/supabase";
import { useAsyncForm } from "@/hooks/use-async-form";

interface InviteLookupResponse {
  valid: boolean;
  invite: {
    email: string;
    role: string;
    storeId: string | null;
    referralCode: string | null;
    inviteMessage: string | null;
    expiresAt: string;
  } | null;
}

interface ExternalInviteLookupResponse {
  valid: boolean;
  invite: {
    externalInviteId: string;
    channel: "email" | "whatsapp" | "link";
    contactName: string | null;
    email: string | null;
    phone: string | null;
    message: string | null;
    expiresAt: string;
    createdAt: string;
    companyName: string;
    storeName: string | null;
    inviterName: string | null;
    inviterEmail: string | null;
  } | null;
}

function RegisterPageContent() {
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("inviteToken");
  const externalInviteToken = searchParams.get("externalInvite");
  const referralCodeFromUrl = searchParams.get("referralCode");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [inviteLookup, setInviteLookup] = useState<InviteLookupResponse["invite"] | null>(null);
  const [externalInviteLookup, setExternalInviteLookup] = useState<ExternalInviteLookupResponse["invite"] | null>(null);
  const [inviteWarning, setInviteWarning] = useState<string | null>(null);
  const [externalInviteModalOpen, setExternalInviteModalOpen] = useState(false);
  const { submitting, formError, fieldErrors, clearFieldError, runSubmit } = useAsyncForm();

  const referralCode = referralCodeFromUrl ?? inviteLookup?.referralCode ?? null;

  const passwordStrength = useMemo(
    () =>
      evaluatePasswordStrength(password, {
        email,
        fullName,
      }),
    [email, fullName, password],
  );

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  useEffect(() => {
    savePendingInviteReferralContext({
      inviteToken,
      referralCode,
    });
  }, [inviteToken, referralCode]);

  useEffect(() => {
    let disposed = false;

    const loadInvite = async () => {
      if (!inviteToken) {
        setInviteLookup(null);
        setInviteWarning(null);
        return;
      }

      try {
        const response = await apiRequest<InviteLookupResponse>(`/auth/invite/${encodeURIComponent(inviteToken)}`);
        if (disposed) {
          return;
        }

        if (!response.valid || !response.invite) {
          setInviteLookup(null);
          setInviteWarning("This invite is invalid or expired. Registration can still continue normally.");
          return;
        }

        setInviteLookup(response.invite);
        setInviteWarning(null);
      } catch {
        if (!disposed) {
          setInviteLookup(null);
          setInviteWarning("Invite details could not be verified right now. Registration can still continue.");
        }
      }
    };

    void loadInvite();

    return () => {
      disposed = true;
    };
  }, [inviteToken]);

  useEffect(() => {
    let disposed = false;

    const loadExternalInvite = async () => {
      if (!externalInviteToken) {
        setExternalInviteLookup(null);
        return;
      }

      try {
        const response = await apiRequest<ExternalInviteLookupResponse>(`/companies/external-invite/${encodeURIComponent(externalInviteToken)}`);
        if (disposed) {
          return;
        }

        if (!response.valid || !response.invite) {
          setExternalInviteLookup(null);
          setInviteWarning("This external invite link is invalid or has expired after 7 days.");
          return;
        }

        setExternalInviteLookup(response.invite);
        setExternalInviteModalOpen(true);
      } catch {
        if (!disposed) {
          setExternalInviteLookup(null);
          setInviteWarning("External invite validation is unavailable right now. Please try again.");
        }
      }
    };

    void loadExternalInvite();

    return () => {
      disposed = true;
    };
  }, [externalInviteToken]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!acknowledged) {
      return;
    }

    try {
      savePendingInviteReferralContext({
        inviteToken,
        referralCode,
      });
      await runSubmit(
        () =>
          apiRequest("/auth/register", {
            method: "POST",
            body: JSON.stringify({
              fullName,
              email,
              password,
              confirmPassword,
              inviteToken,
              referralCode,
            }),
          }),
        "Registration failed",
      );
      setSuccessEmail(email);
      toast.success("Account created. Verify the inbox to continue.");
    } catch {
      return;
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      return;
    }

    setResendingVerification(true);
    try {
      await apiRequest("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSuccessEmail(email);
      toast.success("Verification email sent again.");
    } catch {
      setResendingVerification(false);
      return;
    }
    setResendingVerification(false);
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    savePendingInviteReferralContext({
      inviteToken,
      referralCode,
    });

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (oauthError) {
      toast.error("Google sign-in could not be started.");
      setGoogleLoading(false);
    }
  };

  const referralEntryLabel =
    externalInviteLookup?.inviterName ??
    externalInviteLookup?.inviterEmail ??
    externalInviteLookup?.companyName ??
    null;

  return (
    <AuthShell
      // badge="Register"
      title="Create the first operator account"
      // description="Registration is email-first. After verification, the callback sends the user into workspace onboarding automatically."
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <span>Already registered?</span>
          <Link href="/auth/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </div>
      }
    >
      <FormErrorSummary title="Registration failed" error={formError ?? (!acknowledged && successEmail == null ? null : formError)} />

      {externalInviteLookup && externalInviteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
          <Card className="w-full max-w-lg border-sky-200/80 bg-white">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50">Referral Invite</Badge>
              </div>
              <CardTitle>You arrived from an invite link</CardTitle>
              <CardDescription>
                This registration page was opened from a referral or outside-user invite sent by <strong>{referralEntryLabel}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-slate-700">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  Recipient: <strong>{externalInviteLookup.contactName || externalInviteLookup.email || externalInviteLookup.phone || "Outside user"}</strong>
                </div>
                <div>
                  Company: <strong>{externalInviteLookup.companyName}</strong>
                </div>
                <div>
                  Valid until: <strong>{new Date(externalInviteLookup.expiresAt).toLocaleString()}</strong>
                </div>
              </div>
              {externalInviteLookup.message ? (
                <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sky-900">
                  {externalInviteLookup.message}
                </div>
              ) : null}
            </CardContent>
            <div className="flex justify-end px-5 pb-5">
              <Button type="button" onClick={() => setExternalInviteModalOpen(false)}>
                Continue to Register
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {successEmail ? (
        <div className="flex flex-col gap-5">
          <Alert>
            <MailCheck />
            <AlertTitle>Verification email sent</AlertTitle>
            <AlertDescription>
              Open the verification email sent to <strong>{successEmail}</strong>. Once the link is confirmed, this account can continue directly into onboarding.
            </AlertDescription>
          </Alert>
          {inviteLookup || externalInviteLookup || referralCode ? (
            <Alert>
              <CheckCircle2 />
              <AlertTitle>Invite or referral captured</AlertTitle>
              <AlertDescription>
                {inviteLookup
                  ? `This account will try to accept the ${inviteLookup.role} invite for ${inviteLookup.email} after verification.`
                  : externalInviteLookup
                    ? `This link is valid for ${externalInviteLookup.companyName} until ${new Date(externalInviteLookup.expiresAt).toLocaleString()}.`
                  : "Referral attribution is saved and will continue after verification."}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => void handleResendVerification()} disabled={resendingVerification}>
              <MailCheck data-icon="inline-start" />
              {resendingVerification ? "Resending..." : "Resend verification"}
            </Button>
            <Button type="button" onClick={() => (window.location.href = "/auth/login?registered=success")}>
              <ArrowRight data-icon="inline-start" />
              Continue to login
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            <Button type="button" variant="outline" size="lg" disabled={googleLoading} onClick={() => void handleGoogleLogin()}>
              <GoogleIcon className="size-4.5 shrink-0" />
              {googleLoading ? "Redirecting to Google..." : "Continue with Google"}
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {externalInviteLookup ? (
              <Alert className="border-sky-200 bg-sky-50/80">
                <CheckCircle2 />
                <AlertTitle>Referral invite detected</AlertTitle>
                <AlertDescription>
                  You opened this page from a referral or invite link sent by <strong>{referralEntryLabel}</strong>. This invite is valid until{" "}
                  <strong>{new Date(externalInviteLookup.expiresAt).toLocaleString()}</strong>.
                </AlertDescription>
              </Alert>
            ) : null}
            {inviteLookup ? (
              <Alert>
                <CheckCircle2 />
                <AlertTitle>Invite recognized</AlertTitle>
                <AlertDescription>
                  {inviteLookup.email} is invited as <strong>{inviteLookup.role}</strong>.
                  {inviteLookup.inviteMessage ? ` Message: ${inviteLookup.inviteMessage}` : ""}
                </AlertDescription>
              </Alert>
            ) : null}
            {externalInviteLookup ? (
                <Alert>
                  <CheckCircle2 />
                  <AlertTitle>External invite recognized</AlertTitle>
                  <AlertDescription>
                  {externalInviteLookup.contactName || externalInviteLookup.email || externalInviteLookup.phone || "This contact"} was invited by{" "}
                  <strong>{referralEntryLabel}</strong>.
                  {externalInviteLookup.message ? ` Message: ${externalInviteLookup.message}` : ""} This link is valid until{" "}
                  <strong>{new Date(externalInviteLookup.expiresAt).toLocaleString()}</strong>.
                </AlertDescription>
              </Alert>
            ) : null}
            {inviteWarning ? (
              <Alert>
                <AlertCircle />
                <AlertTitle>Invite warning</AlertTitle>
                <AlertDescription>{inviteWarning}</AlertDescription>
              </Alert>
            ) : null}
            {referralCode ? (
              <Alert>
                <CheckCircle2 />
                <AlertTitle>Referral captured</AlertTitle>
                <AlertDescription>
                  Referral code <strong>{referralCode}</strong> will be attached to this registration.
                </AlertDescription>
              </Alert>
            ) : null}
            <FormSection>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="fullName">Full name</FieldLabel>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(event) => {
                      clearFieldError("fullName");
                      setFullName(event.target.value);
                    }}
                    required
                  />
                  <FieldError errors={fieldErrors.fullName?.map((message) => ({ message }))} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      clearFieldError("email");
                      setEmail(event.target.value);
                    }}
                    required
                    className="border-sky-200/90 focus-visible:border-sky-400 focus-visible:ring-sky-100"
                  />
                  <FieldError errors={fieldErrors.email?.map((message) => ({ message }))} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => {
                      clearFieldError("password");
                      setPassword(event.target.value);
                    }}
                    required
                    className="border-blue-200/90 focus-visible:border-blue-400 focus-visible:ring-blue-100"
                  />
                  <FieldError errors={fieldErrors.password?.map((message) => ({ message }))} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
                  <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => {
                      clearFieldError("confirmPassword");
                      setConfirmPassword(event.target.value);
                    }}
                    required
                    className="border-blue-200/90 focus-visible:border-blue-400 focus-visible:ring-blue-100"
                  />
                  <FieldDescription>
                    {confirmPassword.length === 0 ? "Re-enter the password to avoid setup mistakes." : passwordsMatch ? "Passwords match." : "Passwords do not match yet."}
                  </FieldDescription>
                  <FieldError errors={fieldErrors.confirmPassword?.map((message) => ({ message }))} />
                </Field>
                <Field orientation="horizontal">
                  <Checkbox checked={acknowledged} onCheckedChange={(checked) => setAcknowledged(checked === true)} aria-label="Acknowledge onboarding requirements" />
                  <FieldContent>
                    <FieldLabel>I understand this owner account creates the first CRM workspace.</FieldLabel>
                    <FieldDescription>The next step after verification is workspace onboarding, not the dashboard.</FieldDescription>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </FormSection>

            <div className="rounded-[1.6rem] border border-border/70 bg-secondary/35 p-4">
              <div className="mb-4 text-sm font-medium text-slate-900">Password strength</div>
              <Progress value={password.length === 0 ? 0 : passwordStrength.score}>
                <ProgressLabel>{passwordStrength.label}</ProgressLabel>
                <span className="ml-auto text-sm text-muted-foreground tabular-nums">{password.length === 0 ? "0%" : `${passwordStrength.score}%`}</span>
              </Progress>
            </div>

            <Button type="submit" size="lg" disabled={submitting}>
              <UserPlus data-icon="inline-start" />
              {submitting ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <AuthShell
          badge="Register"
          title="Create the first operator account"
          description="Preparing registration details and invite context."
        >
          <Alert>
            <MailCheck />
            <AlertTitle>Loading registration</AlertTitle>
            <AlertDescription>Checking invite and referral context before showing the form.</AlertDescription>
          </Alert>
        </AuthShell>
      }
    >
      <RegisterPageContent />
    </Suspense>
  );
}
