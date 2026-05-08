import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsAndConditionPage() {
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Terms and Condition</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-slate-700">
          <p>You must use the CRM platform for lawful business purposes and protect your account credentials.</p>
          <p>You are responsible for data entered by your team and for obtaining consent where required for outreach and messaging.</p>
          <p>Service features may evolve over time; misuse, abuse, or unauthorized access attempts may lead to account suspension.</p>
          <p>By creating or using an account, you agree to these terms for platform use, security, and acceptable conduct.</p>
          <Link href="/auth/register" className="font-medium text-foreground underline underline-offset-4">Return to register</Link>
        </CardContent>
      </Card>
    </main>
  );
}
