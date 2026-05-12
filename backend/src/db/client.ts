import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/config";
import * as schema from "@/db/schema";

const client = postgres(env.DATABASE_URL, {
  max: 40,
  idle_timeout: 20,
  connect_timeout: 10,
});

const workerClient = postgres(env.DATABASE_URL, {
  max: 8,
  idle_timeout: 30,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export const workerDb = drizzle(workerClient, { schema });
export { client as pgClient, workerClient as workerPgClient };
