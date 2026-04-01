const ACCESS_TOKEN_COOKIE = "crm_access_token";
const COMPANY_COOKIE = "crm_company_id";
const STORE_COOKIE = "crm_store_id";

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}

export function setCookie(name: string, value: string, maxAgeSeconds = 60 * 60 * 24 * 7) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

export function clearCookie(name: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function getAccessTokenFromCookie() {
  return getCookie(ACCESS_TOKEN_COOKIE);
}

export function setAccessTokenCookie(token: string) {
  setCookie(ACCESS_TOKEN_COOKIE, token);
}

export function clearAccessTokenCookie() {
  clearCookie(ACCESS_TOKEN_COOKIE);
}

export function getCompanyCookie() {
  return getCookie(COMPANY_COOKIE);
}

export function setCompanyCookie(companyId: string) {
  setCookie(COMPANY_COOKIE, companyId);
}

export function clearCompanyCookie() {
  clearCookie(COMPANY_COOKIE);
}

export function getStoreCookie() {
  return getCookie(STORE_COOKIE);
}

export function setStoreCookie(storeId: string) {
  setCookie(STORE_COOKIE, storeId);
}

export function clearStoreCookie() {
  clearCookie(STORE_COOKIE);
}
