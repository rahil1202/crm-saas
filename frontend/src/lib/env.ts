export interface FrontendEnv {
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  turnstileSiteKey: string;
}

export function getFrontendEnv(): FrontendEnv {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://apicrm.theonebranding.com";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://htuaithcjwwrcbnrtsca.supabase.co";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "dev-anon-key";
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  return {
    apiUrl,
    supabaseUrl,
    supabaseAnonKey,
    turnstileSiteKey,
  };
}
