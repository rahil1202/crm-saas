export interface FrontendEnv {
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  turnstileSiteKey: string;
}

export function getFrontendEnv(): FrontendEnv {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "dev-anon-key";
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  return {
    apiUrl,
    supabaseUrl,
    supabaseAnonKey,
    turnstileSiteKey,
  };
}
