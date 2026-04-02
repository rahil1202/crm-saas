"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, MailCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { readApiError } from "@/lib/auth-client";
import { evaluatePasswordStrength } from "@/lib/auth-ui";
import { getFrontendEnv } from "@/lib/env";

export default function RegisterPage() {
  const env = getFrontendEnv();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  const passwordStrength = useMemo(
    () =>
      evaluatePasswordStrength(password, {
        email,
        fullName,
      }),
    [email, fullName, password],
  );

  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!acknowledged) {
      setError("Confirm the setup acknowledgement before creating the account.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessEmail(null);

    const response = await fetch(`${env.apiUrl}/api/v1/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName,
        email,
        password,
        confirmPassword,
      }),
    });

    if (!response.ok) {
      setError(await readApiError(response, "Registration failed"));
      setLoading(false);
      return;
    }

    setSuccessEmail(email);
    toast.success("Account created. Verify the inbox to continue.");
    setLoading(false);
  };

  const handleResendVerification = async () => {
    if (!email) {
      setError("Enter the email you used for registration first.");
      return;
    }

    setResendingVerification(true);
    setError(null);

    const response = await fetch(`${env.apiUrl}/api/v1/auth/resend-verification`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      setError(await readApiError(response, "Unable to resend verification email"));
      setResendingVerification(false);
      return;
    }

    setSuccessEmail(email);
    toast.success("Verification email sent again.");
    setResendingVerification(false);
  };

  return (
    <AuthShell
      badge="Register"
      title="Create the first operator account"
      description="Registration is email-first. After verification, the callback sends the user into workspace onboarding automatically."
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <span>Already registered?</span>
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </div>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Registration failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
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
          <Card className="border-border/60 bg-muted/20">
            <CardHeader>
              <CardTitle className="text-base">Next steps</CardTitle>
              <CardDescription>Keep this flow moving by finishing verification first.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3">
                <Badge variant="secondary">1</Badge>
                <p className="text-sm leading-6 text-muted-foreground">Confirm the inbox from the verification link.</p>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3">
                <Badge variant="secondary">2</Badge>
                <p className="text-sm leading-6 text-muted-foreground">Return here if the browser opened a separate verification session.</p>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3">
                <Badge variant="secondary">3</Badge>
                <p className="text-sm leading-6 text-muted-foreground">Finish company onboarding before reaching the dashboard.</p>
              </div>
            </CardContent>
          </Card>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => void handleResendVerification()} disabled={resendingVerification}>
              <MailCheck data-icon="inline-start" />
              {resendingVerification ? "Resending..." : "Resend verification"}
            </Button>
            <Button type="button" onClick={() => (window.location.href = "/login?registered=success")}>
              <ArrowRight data-icon="inline-start" />
              Continue to login
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="fullName">Full name</FieldLabel>
              <Input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
              <FieldDescription>This becomes the owner profile name used during onboarding.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              <FieldDescription>The backend enforces the same strength rules shown below.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
              <Input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
              <FieldDescription>
                {confirmPassword.length === 0 ? "Re-enter the password to avoid setup mistakes." : passwordsMatch ? "Passwords match." : "Passwords do not match yet."}
              </FieldDescription>
            </Field>
            <Field orientation="horizontal" data-invalid={!acknowledged && error?.includes("acknowledgement") ? true : undefined}>
              <Checkbox checked={acknowledged} onCheckedChange={(checked) => setAcknowledged(checked === true)} aria-label="Acknowledge onboarding requirements" />
              <FieldContent>
                <FieldLabel>I understand this owner account creates the first CRM workspace.</FieldLabel>
                <FieldDescription>The next step after verification is workspace onboarding, not the dashboard.</FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>

          <Card className="border-border/60 bg-muted/20">
            <CardHeader>
              <CardTitle className="text-base">Password strength</CardTitle>
              <CardDescription>Use a password the backend will accept immediately.</CardDescription>
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

          <Button type="submit" size="lg" disabled={loading}>
            <UserPlus data-icon="inline-start" />
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
