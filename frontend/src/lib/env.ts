export interface FrontendEnv {
  apiUrl: string;
  appUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  turnstileSiteKey: string;
}

export function getFrontendEnv(): FrontendEnv {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://apicrm.theonebranding.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://crm.theonebranding.com";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://htuaithcjwwrcbnrtsca.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "dev-anon-key";
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  return {
    apiUrl,
    appUrl,
    supabaseUrl,
    supabaseAnonKey,
    turnstileSiteKey,
  };
}

export function getAuthCallbackUrl(): string {
  const { appUrl } = getFrontendEnv();
  const configuredBase = appUrl.replace(/\/$/, "");

  if (typeof window === "undefined") {
    return `${configuredBase}/auth/callback`;
  }

  const runtimeBase = window.location.origin.replace(/\/$/, "");
  const runtimeIsLocalhost = /localhost|127\.0\.0\.1/i.test(runtimeBase);
  const configuredIsHttps = configuredBase.startsWith("https://");
  const base = runtimeIsLocalhost && configuredIsHttps ? configuredBase : runtimeBase;

  return `${base}/auth/callback`;
}
