# Bugfix Requirements Document

## Introduction

The entire CRM SaaS application (frontend and backend) feels laggy and slow due to multiple performance bottlenecks across the backend stack. Six root causes have been identified: an undersized database connection pool, unnecessary database writes on every authenticated request, database-backed rate limiting adding round-trips per API call, a background worker competing for the same connection pool as user requests, no response compression, and N+1 query patterns in sequence processing. Together these issues cause request queuing, unnecessary write locks, excessive DB round-trips, and inflated response payloads — all contributing to perceived application-wide latency.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the application is under normal load with 30+ route modules, a background worker, and rate limiting all sharing the connection pool THEN the system queues requests waiting for free connections because the pool is limited to 10 connections with prepared statements disabled

1.2 WHEN any authenticated API request is processed THEN the system executes an INSERT ... ON CONFLICT UPDATE on the profiles table (profile upsert) regardless of whether profile data has changed, creating unnecessary write locks on every request

1.3 WHEN any rate-limited API request is processed THEN the system performs an INSERT ... ON CONFLICT UPDATE to the requestRateLimits table in PostgreSQL, adding 1-2 database round-trips per API call for rate limit tracking

1.4 WHEN the automation runtime worker polls every 2 seconds THEN the system runs 8+ heavy sequential operations (automation runs, sequence processing, campaign queues, WhatsApp outbox, email processing, webhook events, conversation expiry, lead inactivity scans) all competing for the same 10-connection pool as user-facing requests

1.5 WHEN the server sends JSON API responses to clients THEN the system transmits responses uncompressed (no gzip/brotli), increasing payload sizes and transfer times

1.6 WHEN processDueSequenceRuns executes THEN the system fetches enrollments and then loops through each enrollment performing individual queries for steps, run inserts, condition checks, and next-step lookups (N+1 pattern)

### Expected Behavior (Correct)

2.1 WHEN the application is under normal load THEN the system SHALL provide a connection pool sized appropriately (max 40 connections) with prepared statements enabled, idle timeout, and connect timeout configured to prevent request queuing

2.2 WHEN any authenticated API request is processed THEN the system SHALL NOT perform a profile upsert; profile creation/update SHALL only occur during login or signup flows

2.3 WHEN any rate-limited API request is processed THEN the system SHALL use an in-memory sliding window rate limiter that requires zero database round-trips for rate limit checks

2.4 WHEN the automation runtime worker executes background tasks THEN the system SHALL use a separate dedicated connection pool so that background operations do not compete with user-facing request connections

2.5 WHEN the server sends JSON API responses to clients THEN the system SHALL compress responses using gzip or brotli encoding via compression middleware, reducing payload sizes

2.6 WHEN processDueSequenceRuns executes THEN the system SHALL batch-fetch steps and related data for all due enrollments in bulk queries instead of issuing individual queries per enrollment

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user logs in or signs up THEN the system SHALL CONTINUE TO create or update their profile record in the profiles table

3.2 WHEN rate limits are exceeded THEN the system SHALL CONTINUE TO reject requests with a 429 Too Many Requests response and appropriate retry-after information

3.3 WHEN automation runs, sequence processing, campaign queues, and other background tasks execute THEN the system SHALL CONTINUE TO process them correctly with the same business logic and error handling

3.4 WHEN API endpoints return data THEN the system SHALL CONTINUE TO return the same JSON response bodies with identical data structures and status codes

3.5 WHEN database queries execute across all modules THEN the system SHALL CONTINUE TO return correct results with proper tenant isolation and data integrity

3.6 WHEN sequence enrollments are due for processing THEN the system SHALL CONTINUE TO execute steps in order, handle conditions, send emails/WhatsApp messages, and update enrollment status correctly
