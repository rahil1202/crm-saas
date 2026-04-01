export interface FrontendEnv {
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function getFrontendEnv(): FrontendEnv {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "dev-anon-key";

  return {
    apiUrl,
    supabaseUrl,
    supabaseAnonKey,
  };
}
