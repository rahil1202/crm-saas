import { app } from "@/app/router";
import { env } from "@/lib/config";

Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
});

console.log(`crm-saas backend listening on http://localhost:${env.PORT}`);
