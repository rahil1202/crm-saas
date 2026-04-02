import { app } from "@/app/router";
import { checkSupabaseConnection } from "@/lib/auth";
import { env } from "@/lib/config";

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`crm-saas backend listening on http://localhost:${env.PORT}`);
console.log(`[startup] Supabase auth target: ${env.SUPABASE_URL}`);

void (async () => {
  const supabaseStatus = await checkSupabaseConnection();
  if (supabaseStatus.ok) {
    console.log(`[startup] Supabase connection: connected (status ${supabaseStatus.status})`);
  } else {
    console.error(
      `[startup] Supabase connection: failed (status ${supabaseStatus.status})${
        "message" in supabaseStatus && supabaseStatus.message ? ` - ${supabaseStatus.message}` : ""
      }`,
    );
  }
})();
