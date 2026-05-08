import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Privacy Policy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-slate-700">
          <p>We collect account profile, workspace, lead, deal, and communication data required to provide the CRM service.</p>
          <p>Data is used for authentication, workflow operations, reporting, and platform reliability. We do not sell your personal data.</p>
          <p>Workspace administrators control team access and can request data export or removal according to applicable laws.</p>
          <p>By using this platform you consent to this processing for service delivery and security operations.</p>
          <Link href="/auth/register" className="font-medium text-foreground underline underline-offset-4">Return to register</Link>
        </CardContent>
      </Card>
    </main>
  );
}
