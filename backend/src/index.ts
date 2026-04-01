import { app } from "@/app/router";

const port = Number(process.env.PORT ?? 8787);

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`crm-saas backend listening on http://localhost:${port}`);
