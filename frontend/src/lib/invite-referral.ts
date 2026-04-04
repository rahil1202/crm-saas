"use client";

const STORAGE_KEY = "crm_pending_invite_referral";

export interface PendingInviteReferralContext {
  inviteToken?: string | null;
  referralCode?: string | null;
}

export function savePendingInviteReferralContext(input: PendingInviteReferralContext) {
  if (typeof window === "undefined") {
    return;
  }

  const inviteToken = input.inviteToken?.trim() || null;
  const referralCode = input.referralCode?.trim() || null;

  if (!inviteToken && !referralCode) {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      inviteToken,
      referralCode,
    }),
  );
}

export function readPendingInviteReferralContext(): PendingInviteReferralContext {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as PendingInviteReferralContext;
    return {
      inviteToken: parsed.inviteToken?.trim() || null,
      referralCode: parsed.referralCode?.trim() || null,
    };
  } catch {
    return {};
  }
}

export function clearPendingInviteReferralContext() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}
