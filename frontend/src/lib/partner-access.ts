type PartnerMembershipLike = {
  companyId: string;
  isPartnerAccess?: boolean;
};

type PartnerMeLike = {
  memberships?: PartnerMembershipLike[];
  needsOnboarding?: boolean;
  isSuperAdmin?: boolean;
};

const PARTNER_COMPANY_SELECTION_KEY = "crm.partnerCompanySelection";

export function getPartnerMemberships(me: PartnerMeLike | null | undefined) {
  return (me?.memberships ?? []).filter((membership) => membership.isPartnerAccess);
}

export function isPartnerUser(me: PartnerMeLike | null | undefined) {
  return getPartnerMemberships(me).length > 0;
}

export function hasMultiplePartnerCompanies(me: PartnerMeLike | null | undefined) {
  return getPartnerMemberships(me).length > 1;
}

export function resolveAuthenticatedRouteFromMe(me: PartnerMeLike | null | undefined) {
  if (!me) {
    return "/dashboard";
  }

  if (me.needsOnboarding && !me.isSuperAdmin) {
    return "/onboarding";
  }

  return hasMultiplePartnerCompanies(me) ? "/dashboard/company" : "/dashboard";
}

export function rememberPartnerCompanySelection(companyId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(PARTNER_COMPANY_SELECTION_KEY, companyId);
}

export function getRememberedPartnerCompanySelection() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(PARTNER_COMPANY_SELECTION_KEY);
}

export function clearRememberedPartnerCompanySelection() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(PARTNER_COMPANY_SELECTION_KEY);
}
