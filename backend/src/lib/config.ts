import "dotenv/config";

import { z } from "zod";

function normalizeSupabaseUrl(rawValue: string) {
  const parsed = new URL(rawValue);

  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    return parsed.origin;
  }

  if (parsed.protocol === "postgresql:" || parsed.protocol === "postgres:") {
    const dbMatch = parsed.hostname.match(/^db\.([^.]+)\.supabase\.co$/);
    if (dbMatch) {
      return `https://${dbMatch[1]}.supabase.co`;
    }

    const poolerMatch = parsed.hostname.match(/^[^.]+\.([^.]+)\.pooler\.supabase\.com$/);
    if (poolerMatch) {
      return `https://${poolerMatch[1]}.supabase.co`;
    }
  }

  throw new Error(
    "SUPABASE_URL must be an http(s) project URL like https://<project-ref>.supabase.co or a Supabase Postgres URL that can be derived into one.",
  );
}

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  BACKEND_URL: z.string().url().default("http://localhost:8787"),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5432/crm_saas"),
  SUPABASE_URL: z.string().min(1).default("http://localhost:54321").transform(normalizeSupabaseUrl),
  SUPABASE_ANON_KEY: z.string().min(1).default("dev-anon-key"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default("dev-service-role-key"),
  SUPABASE_JWT_AUDIENCE: z.string().default("authenticated"),
  ACCESS_TOKEN_SECRET: z.string().min(32).default("dev-access-secret-dev-access-secret-123"),
  REFRESH_TOKEN_SECRET: z.string().min(32).default("dev-refresh-secret-dev-refresh-secret-123"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).default(60 * 60 * 24 * 30),
  FILE_STORAGE_DIR: z.string().default("storage/uploads"),
  SUPER_ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  COOKIE_SECURE: z
    .enum(["0", "1", "true", "false"])
    .default("0")
    .transform((value) => value === "1" || value === "true"),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none", "Lax", "Strict", "None"]).default("lax").transform((value) => {
    const normalized = value.toLowerCase();
    if (normalized === "strict") return "Strict";
    if (normalized === "none") return "None";
    return "Lax";
  }),
  AUTH_CALLBACK_URL: z.string().url().default("http://localhost:3000/auth/callback"),
  RUNTIME_WORKER_ENABLED: z
    .enum(["0", "1", "true", "false"])
    .default("1")
    .transform((value) => value === "1" || value === "true"),
  RUNTIME_POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(2000),
  RESEND_API_KEY: z.string().default(""),
  RESEND_WEBHOOK_SECRET: z.string().default(""),
  WHATSAPP_ACCESS_TOKEN: z.string().default(""),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default(""),
  WHATSAPP_APP_SECRET: z.string().default(""),
  WHATSAPP_GRAPH_API_VERSION: z.string().default("v23.0"),
});

export const env = envSchema.parse(process.env);
