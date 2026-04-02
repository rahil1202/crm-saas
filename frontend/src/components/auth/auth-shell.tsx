import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Building2, ShieldCheck, Sparkles, Waypoints } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface AuthShellProps {
  badge: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}

const authSignals = [
  {
    title: "Session security",
    description: "The backend rotates access and refresh tokens and only keeps the browser on signed cookie sessions.",
    icon: ShieldCheck,
  },
  {
    title: "Workspace-aware onboarding",
    description: "Verified users go straight into first-company setup instead of landing in a dead-end auth state.",
    icon: Building2,
  },
  {
    title: "Recovery continuity",
    description: "Verification, reset, and sign-in all feed into the same callback path so recovery does not branch off.",
    icon: Waypoints,
  },
];

const authJourney = [
  "Create the operator account and confirm the inbox.",
  "Complete the first company and branch setup.",
  "Return later with email, Google, or recovery without losing the route.",
];

export function AuthShell({ badge, title, description, children, footer }: AuthShellProps) {
  return (
    <main className="relative overflow-hidden bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--color-primary)_0%,transparent_32%),radial-gradient(circle_at_bottom_right,var(--color-secondary)_0%,transparent_42%)] opacity-15" />
      <div className="absolute inset-x-0 top-0 h-80 bg-linear-to-b from-muted/60 via-background to-background" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl items-center px-6 py-10 lg:px-10">
        <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="hidden border-border/60 bg-card/90 shadow-sm lg:flex">
            <CardHeader className="gap-5">
              <div className="flex items-center gap-3">
                <Avatar size="lg">
                  <AvatarFallback>CR</AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-1">
                  <Badge variant="secondary" className="w-fit">
                    CRM SaaS Access
                  </Badge>
                  <CardTitle className="text-3xl leading-tight">Auth that matches the actual product lifecycle.</CardTitle>
                </div>
              </div>
              <CardDescription className="max-w-xl text-sm leading-6">
                Email verification, recovery, backend session issuance, and workspace onboarding are handled as one connected flow instead of scattered screens.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid gap-4">
                {authSignals.map((signal) => {
                  const Icon = signal.icon;

                  return (
                    <Card key={signal.title} size="sm" className="border-border/60 bg-background/80">
                      <CardHeader className="gap-3">
                        <div className="flex items-center gap-3">
                          <div className="rounded-xl bg-primary/10 p-2 text-primary">
                            <Icon />
                          </div>
                          <CardTitle>{signal.title}</CardTitle>
                        </div>
                        <CardDescription className="leading-6">{signal.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
              <Separator />
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles />
                  <span>Default operator journey</span>
                </div>
                <div className="grid gap-3">
                  {authJourney.map((step, index) => (
                    <div key={step} className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3">
                      <Badge variant="secondary">{index + 1}</Badge>
                      <p className="text-sm leading-6 text-muted-foreground">{step}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="justify-between gap-3">
              <span className="text-sm text-muted-foreground">Need a different auth action?</span>
              <Link href="/login" className="inline-flex items-center gap-2 text-sm font-medium text-foreground transition-colors hover:text-primary">
                Return to sign in
                <ArrowRight />
              </Link>
            </CardFooter>
          </Card>

          <Card className="border-border/70 bg-card/95 shadow-xl shadow-primary/5">
            <CardHeader className="gap-4">
              <Badge variant="secondary" className="w-fit">
                {badge}
              </Badge>
              <div className="flex flex-col gap-2">
                <CardTitle className="text-3xl leading-tight">{title}</CardTitle>
                <CardDescription className="text-sm leading-6">{description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">{children}</CardContent>
            {footer ? (
              <CardFooter className="flex-col items-start gap-3 border-t bg-muted/30">
                <div className="text-sm text-muted-foreground">{footer}</div>
              </CardFooter>
            ) : null}
          </Card>
        </div>
      </div>
    </main>
  );
}
