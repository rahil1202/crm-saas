"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AlertCircle, ArrowLeft, MailCheck, Send } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth/auth-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/auth-client";
import { getFrontendEnv } from "@/lib/env";

export default function ForgotPasswordPage() {
  const env = getFrontendEnv();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const response = await fetch(`${env.apiUrl}/api/v1/auth/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      setError(await readApiError(response, "Unable to send password reset email"));
      setLoading(false);
      return;
    }

    const message = `Password reset instructions were sent to ${email}.`;
    setSuccess(message);
    toast.success(message);
    setLoading(false);
  };

  return (
    <AuthShell
      badge="Recover access"
      title="Send a password reset link"
      description="The recovery email returns to this frontend callback and then routes the user into the dedicated reset-password screen."
      footer={
        <Link href="/login" className="inline-flex items-center gap-2 font-medium text-foreground underline underline-offset-4">
          <ArrowLeft />
          Back to login
        </Link>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Reset request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {success ? (
        <Alert>
          <MailCheck />
          <AlertTitle>Check your inbox</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Account email</FieldLabel>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <FieldDescription>The recovery email is only usable if this address belongs to an account.</FieldDescription>
          </Field>
        </FieldGroup>

        <Card className="border-border/60 bg-muted/20">
          <CardHeader>
            <CardTitle className="text-base">What happens next</CardTitle>
            <CardDescription>Recovery stays inside the same auth system used for sign-in and onboarding.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3">
              <Badge variant="secondary">1</Badge>
              <p className="text-sm leading-6 text-muted-foreground">Open the reset link from the inbox for this email address.</p>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3">
              <Badge variant="secondary">2</Badge>
              <p className="text-sm leading-6 text-muted-foreground">The callback verifies the recovery session before showing the password form.</p>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-background/80 px-4 py-3">
              <Badge variant="secondary">3</Badge>
              <p className="text-sm leading-6 text-muted-foreground">After the password is saved, the temporary recovery session is cleared and login starts fresh.</p>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" disabled={loading}>
          <Send data-icon="inline-start" />
          {loading ? "Sending reset link..." : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}
