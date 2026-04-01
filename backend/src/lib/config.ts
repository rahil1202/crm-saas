import "dotenv/config";

import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(8787),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgres://postgres:postgres@localhost:5432/crm_saas"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a URL").default("http://localhost:54321"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).default("dev-service-role-key"),
  SUPABASE_JWT_AUDIENCE: z.string().default("authenticated"),
});

export const env = envSchema.parse(process.env);
