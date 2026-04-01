import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/lib/config";
import * as schema from "@/db/schema";

const client = postgres(env.DATABASE_URL, {
  max: 10,
  prepare: false,
});

export const db = drizzle(client, { schema });
export { client as pgClient };
