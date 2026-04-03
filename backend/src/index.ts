import { app } from "@/app/route";
import { startAutomationRuntimeWorker } from "@/lib/automation-runtime";
import { checkSupabaseConnection } from "@/lib/auth";
import { env } from "@/lib/config";

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`crm-saas backend listening on http://localhost:${env.PORT}`);

if (env.RUNTIME_WORKER_ENABLED) {
  startAutomationRuntimeWorker(env.RUNTIME_POLL_INTERVAL_MS);
  console.log(`[startup] runtime worker: enabled (${env.RUNTIME_POLL_INTERVAL_MS}ms poll)`);
}

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
