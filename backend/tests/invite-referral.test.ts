import { describe, expect, test } from "bun:test";

import {
  buildInviteRegistrationUrl,
  buildReferralRegistrationUrl,
  canAcceptInviteForUser,
  isInviteActive,
  normalizeReferralCapture,
  resolveReferralStatusAfterInviteAcceptance,
  resolveReferralStatusAfterOnboarding,
  resolveReferralStatusAfterRegistration,
  resolveReferralStatusAfterVerification,
} from "@/modules/auth/invite-referral";

describe("invite + referral lifecycle helpers", () => {
  test("invite links carry both invite token and referral code", () => {
    const url = buildInviteRegistrationUrl({
      frontendUrl: "https://app.example.com",
      inviteToken: "invite-token",
      referralCode: "TEAM-REF",
    });

    expect(url).toBe("https://app.example.com/register?inviteToken=invite-token&referralCode=TEAM-REF");
  });

  test("referral-only links are generated without invite state", () => {
    const url = buildReferralRegistrationUrl({
      frontendUrl: "https://app.example.com",
      referralCode: "REF-CODE",
    });

    expect(url).toBe("https://app.example.com/register?referralCode=REF-CODE");
  });

  test("registration with referral only enters the registered state", () => {
    expect(resolveReferralStatusAfterRegistration()).toBe("registered");
  });

  test("verification without company membership keeps referral separate from invite join behavior", () => {
    expect(
      resolveReferralStatusAfterVerification({
        hasCompanyMembership: false,
      }),
    ).toBe("verified");
  });

  test("verification with company membership upgrades referral attribution to joined_company", () => {
    expect(
      resolveReferralStatusAfterVerification({
        hasCompanyMembership: true,
      }),
    ).toBe("joined_company");
  });

  test("invite acceptance and onboarding move attribution through the final lifecycle states", () => {
    expect(resolveReferralStatusAfterInviteAcceptance()).toBe("joined_company");
    expect(resolveReferralStatusAfterOnboarding()).toBe("completed_onboarding");
  });

  test("invalid invite does not block capture context and inactive invites are rejected", () => {
    expect(
      normalizeReferralCapture({
        inviteToken: " expired-token ",
        referralCode: " REF-123 ",
      }),
    ).toEqual({
      inviteToken: "expired-token",
      referralCode: "REF-123",
    });

    expect(
      isInviteActive({
        status: "pending",
        expiresAt: new Date(Date.now() - 60_000),
      }),
    ).toBe(false);
  });

  test("invite email mismatch blocks acceptance while matching email is allowed", () => {
    expect(
      canAcceptInviteForUser({
        inviteEmail: "teammate@example.com",
        authenticatedEmail: "owner@example.com",
      }),
    ).toBe(false);

    expect(
      canAcceptInviteForUser({
        inviteEmail: "teammate@example.com",
        authenticatedEmail: "TEAMMATE@example.com",
      }),
    ).toBe(true);
  });
});
