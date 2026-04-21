import { readdirSync, readFileSync } from "node:fs";
import { dirname, basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pgClient } from "@/db/client";

const currentFileDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(currentFileDir, "..", "..", "..", "drizzle");

async function ensureMigrationsTable() {
  await pgClient`
    CREATE TABLE IF NOT EXISTS drizzle_migrations (
      id serial PRIMARY KEY,
      filename text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

export async function runMigrations() {
  await ensureMigrationsTable();

  const files = readdirSync(migrationsDir)
    .filter((file) => extname(file) === ".sql")
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const [applied] = await pgClient<{ filename: string }[]>`
      SELECT filename
      FROM drizzle_migrations
      WHERE filename = ${file}
      LIMIT 1
    `;

    if (applied) {
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`Applying migration: ${basename(file)}`);
    await pgClient.unsafe(sql);
    await pgClient`INSERT INTO drizzle_migrations (filename) VALUES (${file}) ON CONFLICT (filename) DO NOTHING`;
  }

  console.log("Migrations complete");
}

if (import.meta.main) {
  void runMigrations()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
