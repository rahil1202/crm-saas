"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, MailCheck, Send } from "lucide-react";
import { toast } from "sonner";

import { AuthShell } from "@/components/auth/auth-shell";
import { FormErrorSummary, FormSection } from "@/components/forms/form-primitives";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/api";
import { useAsyncForm } from "@/hooks/use-async-form";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const { submitting, formError, fieldErrors, clearFieldError, runSubmit } = useAsyncForm();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess(null);

    try {
      await runSubmit(
        () =>
          apiRequest("/auth/forgot-password", {
            method: "POST",
            body: JSON.stringify({ email }),
          }),
        "Unable to send password reset email",
      );
    } catch {
      return;
    }

    const message = `Password reset instructions were sent to ${email}.`;
    setSuccess(message);
    toast.success(message);
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
      <FormErrorSummary title="Reset request failed" error={formError} />

      {success ? (
        <Alert>
          <MailCheck />
          <AlertTitle>Check your inbox</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <FormSection title="Recovery email" description="Use the same verified operator email used for sign-in.">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Account email</FieldLabel>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => { clearFieldError("email"); setEmail(event.target.value); }} required />
              <FieldDescription>The recovery email is only usable if this address belongs to an account.</FieldDescription>
              <FieldError errors={fieldErrors.email?.map((message) => ({ message }))} />
            </Field>
          </FieldGroup>
        </FormSection>

        <Button type="submit" size="lg" disabled={submitting}>
          <Send data-icon="inline-start" />
          {submitting ? "Sending reset link..." : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}
