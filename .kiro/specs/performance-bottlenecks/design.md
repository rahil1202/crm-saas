# Technical Design: Performance Bottleneck Fixes

## Overview

This design addresses 6 performance bottlenecks causing application-wide latency in the CRM SaaS backend. The fixes are isolated to backend infrastructure code and do not change any business logic or API contracts.

## Fix 1: Database Connection Pool Optimization

**File:** `backend/src/db/client.ts`

**Current State:**
```typescript
const client = postgres(env.DATABASE_URL, {
  max: 10,
  prepare: false,
});
```

**Design:**
- Increase `max` to 40 for the main application pool
- Remove `prepare: false` to enable prepared statements (query plan caching)
- Add `idle_timeout: 20` (seconds) to release idle connections
- Add `connect_timeout: 10` (seconds) to fail fast on connection issues
- Create a separate `workerClient` with `max: 8` for the background automation worker
- Export both `db` (main) and `workerDb` (background) drizzle instances

**Changes:**
```typescript
// Main pool for user-facing requests
const client = postgres(env.DATABASE_URL, {
  max: 40,
  idle_timeout: 20,
  connect_timeout: 10,
});

// Dedicated pool for background worker
const workerClient = postgres(env.DATABASE_URL, {
  max: 8,
  idle_timeout: 30,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export const workerDb = drizzle(workerClient, { schema });
export { client as pgClient, workerClient as workerPgClient };
```

## Fix 2: Remove Profile Upsert from Auth Middleware

**File:** `backend/src/middleware/auth.ts`

**Current State:** The `requireAuth` middleware runs a profile upsert (`INSERT ... ON CONFLICT UPDATE`) on every authenticated request.

**Design:**
- Remove the profile upsert block from `requireAuth`
- The profile record is already created during signup/login flows (auth controller)
- The super admin check query remains (it's a simple SELECT with LIMIT 1)

**Before (remove this block):**
```typescript
if (verified.email) {
  await db
    .insert(profiles)
    .values({ id: verified.userId, email: verified.email })
    .onConflictDoUpdate({
      target: profiles.id,
      set: { email: verified.email, updatedAt: new Date() },
    });
}
```

## Fix 3: In-Memory Rate Limiting

**File:** `backend/src/lib/security.ts`

**Current State:** `consumeRateLimit` does an INSERT...ON CONFLICT UPDATE to PostgreSQL on every rate-limited request.

**Design:**
- Replace the DB-based `consumeRateLimit` with an in-memory sliding window counter
- Use a `Map<string, { count: number; windowStart: number }>` structure
- Add a periodic cleanup (every 60s) to evict expired windows
- Keep the same `RateLimitPolicy` and `RateLimitRule` interfaces so all callers remain unchanged
- The `requestRateLimits` table remains for audit/historical purposes but is no longer written to on every request

**Implementation:**
```typescript
const rateLimitBuckets = new Map<string, { count: number; windowStart: number; expiresAt: number }>();

// Cleanup expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.expiresAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}, 60_000).unref();

export async function consumeRateLimit(policy: RateLimitPolicy, input: {...}) {
  const now = Date.now();
  for (const rule of policy.rules) {
    const resolvedKey = rule.resolveKey(input);
    if (!resolvedKey) continue;

    const bucketKey = `${rule.scope}:${resolvedKey}`;
    const windowMs = rule.windowSeconds * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;

    const existing = rateLimitBuckets.get(bucketKey);
    if (existing && existing.windowStart === windowStart) {
      existing.count += 1;
      if (existing.count > rule.limit) {
        throw AppError.tooManyRequests(...);
      }
    } else {
      rateLimitBuckets.set(bucketKey, {
        count: 1,
        windowStart,
        expiresAt: windowStart + windowMs,
      });
    }
  }
}
```

## Fix 4: Separate Worker Connection Pool

**File:** `backend/src/lib/automation-runtime.ts`, `backend/src/index.ts`

**Design:**
- Import `workerDb` from `@/db/client` in the automation runtime
- Replace all `db` references in `automation-runtime.ts` with `workerDb`
- Also update `sequence-runtime.ts`, `email-runtime.ts`, `whatsapp-runtime.ts` etc. that are called from the worker context
- Alternative simpler approach: Pass the db instance as a parameter to `startAutomationRuntimeWorker` and have the runtime tick use it

**Simpler approach chosen:** Since the automation runtime imports many other modules that also use `db`, the cleanest fix is to have the automation-runtime and its direct dependencies (sequence-runtime, email-runtime, whatsapp-runtime, campaign-engine) import from a `workerDb` export. However, this requires touching many files.

**Pragmatic approach:** Since the main fix is increasing the pool to 40 AND separating the worker pool, we'll:
1. Create the `workerDb` in `client.ts`
2. Update `automation-runtime.ts` to import and use `workerDb` for its direct queries
3. For sub-modules called by the worker (sequence-runtime, email-runtime, etc.), they continue using `db` but now the main pool is 40 connections which provides adequate headroom

## Fix 5: Response Compression

**File:** `backend/src/app/route.ts`, `backend/package.json`

**Design:**
- Hono has a built-in `compress` middleware in `hono/compress`
- Add `app.use("*", compress())` after the security headers middleware
- No additional dependencies needed — it's built into Hono

**Changes to route.ts:**
```typescript
import { compress } from "hono/compress";
// ...
app.use("*", compress());
```

## Fix 6: Batch Queries in Sequence Runtime

**File:** `backend/src/lib/sequence-runtime.ts`

**Current State:** `processDueSequenceRuns` fetches enrollments, then for each enrollment:
- Queries the current step individually
- Inserts a run record
- Queries the next step individually

**Design:**
- After fetching due enrollments, batch-fetch all relevant steps in a single query using `IN` clause on (companyId, sequenceId, stepIndex) combinations
- Build a lookup map from the batch result
- Process enrollments using the pre-fetched step data instead of individual queries
- The run inserts and status updates remain per-enrollment (they have side effects)

## Testing Strategy

- All fixes are infrastructure-level and don't change API contracts
- Existing API behavior remains identical (same responses, same status codes)
- Manual verification: run the app and confirm faster response times
- TypeScript compilation (`bun run check`) must pass
- The app must start without errors (`bun run dev`)
