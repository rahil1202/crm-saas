import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import websiteLogo from "@/assets/logo-png.png";

interface AuthShellProps {
  badge?: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ badge, title, description, children, footer }: AuthShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-5 lg:px-8 lg:py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(70,146,255,0.18),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(164,220,255,0.26),transparent_30%)]" />

      <div className="relative mx-auto flex w-full max-w-[1220px] flex-col gap-4">
        <header className="flex items-center justify-between rounded-[1.2rem] border border-white/70 bg-white/72 px-4 py-3 shadow-[0_20px_60px_-46px_rgba(34,92,191,0.45)] backdrop-blur-xl">
          <Link href="/" aria-label="Go to home" className="inline-flex items-center">
            <Image src={websiteLogo} alt="The One CRM logo" className="h-9 w-9 object-contain" priority />
          </Link>
          <Link href="/" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Home
          </Link>
        </header>

        <div className="relative grid min-h-[calc(100vh-9rem)] overflow-hidden rounded-[2rem] border border-white/70 bg-white/58 shadow-[0_32px_95px_-58px_rgba(34,92,191,0.45)] backdrop-blur-xl lg:grid-cols-[1fr_0.95fr]">
          <section className="relative hidden min-h-[660px] overflow-hidden bg-linear-to-br from-primary via-sky-500 to-cyan-300 lg:block">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.24),transparent_22%),radial-gradient(circle_at_82%_28%,rgba(255,255,255,0.18),transparent_18%),radial-gradient(circle_at_50%_78%,rgba(255,255,255,0.16),transparent_26%)]" />
            <div className="absolute left-10 top-10 h-28 w-28 rounded-full border border-white/20 bg-white/10 blur-sm" />
            <div className="absolute bottom-10 right-10 h-36 w-36 rounded-full border border-white/20 bg-white/10 blur-sm" />

            <div className="relative flex h-full items-center justify-center p-12">
              <div className="relative w-full max-w-2xl">
                <div className="absolute -left-6 top-16 h-28 w-28 rounded-[2rem] border border-white/18 bg-white/12 backdrop-blur-md" />
                <div className="absolute -right-4 top-0 h-24 w-24 rounded-[1.7rem] border border-white/18 bg-white/10 backdrop-blur-md" />
                <div className="absolute bottom-8 left-6 h-20 w-20 rounded-[1.5rem] border border-white/18 bg-white/10 backdrop-blur-md" />

                <div className="relative overflow-hidden rounded-[2.2rem] border border-white/18 bg-white/12 p-6 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.35)] backdrop-blur-md">
                  <div className="rounded-[1.6rem] border border-white/16 bg-slate-950/10 p-5">
                    <div className="mb-5 flex items-center justify-between">
                      <div>
                        <div className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-white/68">Workspace Preview</div>
                        <div className="mt-2 text-2xl font-semibold text-white">Blue CRM Interface</div>
                      </div>
                      <div className="flex gap-2">
                        <span className="size-3 rounded-full bg-white/55" />
                        <span className="size-3 rounded-full bg-white/35" />
                        <span className="size-3 rounded-full bg-white/25" />
                      </div>
                    </div>

                    <div className="grid gap-4">
                      <div className="grid gap-3 rounded-[1.4rem] border border-white/16 bg-white/12 p-4">
                        <div className="h-3 w-24 rounded-full bg-white/40" />
                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-[1.2rem] bg-white/14 p-4">
                            <div className="h-2 w-14 rounded-full bg-white/40" />
                            <div className="mt-4 h-7 w-16 rounded-full bg-white/70" />
                          </div>
                          <div className="rounded-[1.2rem] bg-white/14 p-4">
                            <div className="h-2 w-12 rounded-full bg-white/40" />
                            <div className="mt-4 h-7 w-20 rounded-full bg-white/55" />
                          </div>
                          <div className="rounded-[1.2rem] bg-white/14 p-4">
                            <div className="h-2 w-16 rounded-full bg-white/40" />
                            <div className="mt-4 h-7 w-12 rounded-full bg-white/65" />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[1.4rem] border border-white/16 bg-white/12 p-4">
                        <div className="mb-4 h-11 rounded-2xl bg-white/78" />
                        <div className="grid gap-3">
                          <div className="h-14 rounded-[1.2rem] bg-white/20" />
                          <div className="h-14 rounded-[1.2rem] bg-white/16" />
                          <div className="h-14 rounded-[1.2rem] bg-white/12" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="flex items-center border-b border-white/70 bg-white/82 p-5 lg:border-l lg:border-b-0 lg:p-8 xl:p-10">
          <Card className="w-full border-0 bg-transparent shadow-none">
            <CardHeader className="px-0">
              {badge ? (
                <Badge variant="secondary" className="w-fit">
                  {badge}
                </Badge>
              ) : null}
              <div className="mt-2 flex flex-col gap-2">
                <CardTitle className="text-4xl leading-tight">{title}</CardTitle>
                <CardDescription className="max-w-lg text-sm leading-7">{description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 px-0 pt-2">{children}</CardContent>
            {footer ? (
              <CardFooter className="mt-6 flex-col items-start gap-3 rounded-[1.6rem] border border-border/70 bg-secondary/35 px-4 py-4">
                <div className="text-sm text-muted-foreground">{footer}</div>
              </CardFooter>
            ) : null}
            <div className="pt-5 text-sm text-muted-foreground lg:hidden">
              <Link href="/auth/login" className="inline-flex items-center gap-2 font-medium text-foreground transition-colors hover:text-primary">
                Return to sign in
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
