export type ReferralAttributionStatus = "captured" | "registered" | "verified" | "joined_company" | "completed_onboarding";

export interface InviteStatusInput {
  status: string;
  expiresAt: Date;
}

export function isInviteActive(invite: InviteStatusInput | null | undefined, now = new Date()) {
  if (!invite) {
    return false;
  }

  return invite.status === "pending" && invite.expiresAt.getTime() > now.getTime();
}

export function buildInviteRegistrationUrl(input: { frontendUrl: string; inviteToken: string; referralCode?: string | null }) {
  const inviteToken = encodeURIComponent(input.inviteToken);
  const referralSuffix = input.referralCode ? `&referralCode=${encodeURIComponent(input.referralCode)}` : "";
  return `${input.frontendUrl}/register?inviteToken=${inviteToken}${referralSuffix}`;
}

export function buildReferralRegistrationUrl(input: { frontendUrl: string; referralCode: string }) {
  return `${input.frontendUrl}/register?referralCode=${encodeURIComponent(input.referralCode)}`;
}

export function normalizeReferralCapture(input: { inviteToken?: string | null; referralCode?: string | null }) {
  return {
    inviteToken: input.inviteToken?.trim() || null,
    referralCode: input.referralCode?.trim() || null,
  };
}

export function canAcceptInviteForUser(input: { inviteEmail: string; authenticatedEmail: string | null | undefined }) {
  if (!input.authenticatedEmail) {
    return false;
  }

  return input.inviteEmail.trim().toLowerCase() === input.authenticatedEmail.trim().toLowerCase();
}

export function resolveReferralStatusAfterRegistration() {
  return "registered" as ReferralAttributionStatus;
}

export function resolveReferralStatusAfterVerification(input: { hasCompanyMembership: boolean }) {
  return (input.hasCompanyMembership ? "joined_company" : "verified") as ReferralAttributionStatus;
}

export function resolveReferralStatusAfterInviteAcceptance() {
  return "joined_company" as ReferralAttributionStatus;
}

export function resolveReferralStatusAfterOnboarding() {
  return "completed_onboarding" as ReferralAttributionStatus;
}
