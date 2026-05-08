"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, SkipForward } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress, ProgressLabel } from "@/components/ui/progress";

import { onboardingTourSteps, type OnboardingTourStep } from "@/features/onboarding/tour-steps";

interface OnboardingTourProps {
  onFinish: () => void;
  onSkipTour: () => void;
  title?: string;
  description?: string;
  steps?: OnboardingTourStep[];
  role?: "owner" | "admin" | "member";
  customRoleModules?: string[];
  isPartnerAccess?: boolean;
}

function canAccessStep(
  step: OnboardingTourStep,
  role: "owner" | "admin" | "member",
  customRoleModules: string[],
  isPartnerAccess: boolean,
) {
  if (step.hiddenForPartnerAccess && isPartnerAccess) {
    return false;
  }

  const roleRank: Record<"owner" | "admin" | "member", number> = { owner: 3, admin: 2, member: 1 };
  const requiredRole = step.minRole ?? "member";

  const hasScopedModules = role === "member" && customRoleModules.length > 0;
  if (hasScopedModules && step.moduleKey) {
    return customRoleModules.includes(step.moduleKey);
  }

  return roleRank[role] >= roleRank[requiredRole];
}

export function OnboardingTour({
  onFinish,
  onSkipTour,
  title = "CRM guided tour",
  description = "Walk through the core workspace modules and jump directly into each area.",
  steps = onboardingTourSteps,
  role = "owner",
  customRoleModules = [],
  isPartnerAccess = false,
}: OnboardingTourProps) {
  const visibleSteps = useMemo(
    () => steps.filter((step) => canAccessStep(step, role, customRoleModules, isPartnerAccess)),
    [customRoleModules, isPartnerAccess, role, steps],
  );
  const [index, setIndex] = useState(0);

  const totalSteps = visibleSteps.length;
  const currentStep = visibleSteps[index];
  const isFirst = index === 0;
  const isLast = index === totalSteps - 1;
  const progress = useMemo(() => Math.round(((index + 1) / totalSteps) * 100), [index, totalSteps]);

  useEffect(() => {
    if (index >= totalSteps && totalSteps > 0) {
      setIndex(0);
    }
  }, [index, totalSteps]);

  if (!currentStep) {
    return (
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>No modules are currently available for this role in the active workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={onFinish}>
            Finish
          </Button>
        </CardContent>
      </Card>
    );
  }

  const handleNext = () => {
    if (isLast) {
      onFinish();
      return;
    }
    setIndex((current) => Math.min(current + 1, totalSteps - 1));
  };

  const handlePrevious = () => {
    setIndex((current) => Math.max(current - 1, 0));
  };

  const handleSkipModule = () => {
    if (isLast) {
      onFinish();
      return;
    }
    setIndex((current) => Math.min(current + 1, totalSteps - 1));
  };

  return (
    <Card className="border-border/60">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button type="button" variant="destructive" size="sm" onClick={onSkipTour}>
            Skip tour
          </Button>
        </div>
        <Progress value={progress}>
          <ProgressLabel>
            Step {index + 1} of {totalSteps}
          </ProgressLabel>
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">{progress}%</span>
        </Progress>
      </CardHeader>

      <CardContent className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="hidden lg:flex lg:flex-col lg:gap-2">
          {visibleSteps.map((step, stepIndex) => (
            <button
              type="button"
              key={step.id}
              className={`rounded-xl border px-3 py-2 text-left transition ${
                stepIndex === index
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-border/60 bg-background text-foreground hover:border-border"
              }`}
              onClick={() => setIndex(stepIndex)}
            >
              <p className="text-xs uppercase tracking-wide opacity-80">Module {stepIndex + 1}</p>
              <p className="text-sm font-medium leading-5">{step.title}</p>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Badge variant="secondary">Module {index + 1}</Badge>
              <span className="text-sm text-muted-foreground">{currentStep.title}</span>
            </div>
            <p className="text-sm leading-6 text-foreground sm:text-base">{currentStep.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {currentStep.highlights.map((highlight) => (
                <Badge key={highlight} variant="outline">
                  {highlight}
                </Badge>
              ))}
            </div>
            {currentStep.href ? (
              <div className="mt-5">
                <Link
                  href={currentStep.href}
                  className="inline-flex items-center rounded-xl border border-border/60 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/40"
                >
                  {currentStep.ctaLabel ?? "Open module"}
                </Link>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={handlePrevious} disabled={isFirst}>
                <ArrowLeft data-icon="inline-start" />
                Previous
              </Button>
              <Button type="button" variant="outline" onClick={handleSkipModule}>
                <SkipForward data-icon="inline-start" />
                Skip module
              </Button>
            </div>

            <Button type="button" onClick={handleNext}>
              {isLast ? (
                <>
                  <CheckCircle2 data-icon="inline-start" />
                  Finish tour
                </>
              ) : (
                <>
                  <ArrowRight data-icon="inline-start" />
                  Next
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
