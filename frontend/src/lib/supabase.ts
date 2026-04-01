import { createClient } from "@supabase/supabase-js";

import { getFrontendEnv } from "@/lib/env";

const env = getFrontendEnv();

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
