import { redirect } from "next/navigation";

export default function OnboardingRedirectPage() {
  redirect("/company-onboarding?step=1");
}
