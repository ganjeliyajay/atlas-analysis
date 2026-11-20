# ADR-009: Idempotent Event Ingestion and High-Throughput Batch Processing

- **Status:** Accepted
- **Date:** 2026-11-06 (Updated 2026-11-12)
- **Deciders:** Lead Architect, Backend Engineering Team

## Context
The ATLAS public ingestion API receives event telemetry from client-side SDKs, server-side backend services, and webhooks. Network retries, mobile disconnects, and consumer crashes frequently lead to duplicate deliveries. The system must ingest up to 500 events per batch request at high throughput (at least 200 events/sec sustained locally) while guaranteeing strict 24-hour deduplication without corrupting product analytics.

## Problem
Processing incoming ingestion batches one event at a time causes excessive database round-trips and connection pool exhaustion. Conversely, naive batch inserts without concurrency control can lead to duplicate entries if client retries are delivered simultaneously to multiple application workers.

## Options Considered
1. **Per-event sequential inserts:** Individual `INSERT` statements per event with per-event idempotency checks.
   - *Pros:* Granular error reporting.
   - *Cons:* Severe throughput degradation ($< 30$ events/sec), excessive connection acquisition.
2. **Redis-backed distributed deduplication:** Key-value store tracking idempotency tokens with Redis TTL.
   - *Pros:* Fast memory lookups.
   - *Cons:* Additional external operational dependency, non-transactional coupling between Redis and PostgreSQL events table.
3. **PostgreSQL Unique Constraints with Keyset Transactions (Selected):** Normalize batch into single array, compute SHA-256 payload digest, enforce database-level unique constraint on `(projectId, key)`, and execute batch insert with Prisma `createMany` inside a single tenant-scoped transaction.

## Decision
Adopt Option 3.
- Normalization: `POST /api/v1/events` normalizes single event objects, bare arrays, or `{ "events": [...] }` into a typed batch up to 500 records.
- Validation: Validated strictly using Zod before acquiring database connections.
- Idempotency Storage: `ingestion_idempotency_keys` table stores `(projectId, key, payloadHash, expiresAt)`.
- Concurrent Replays: A 24-hour expiration window is enforced. Identical payloads replayed with the same key return HTTP 202 without creating duplicate rows; replaying an altered payload with the same key returns HTTP 409 Conflict.
- Atomic Reservation: Idempotency reservation and `createMany` batch writes execute inside the same transaction.

## Consequences
- Single-query efficiency: Ingestion executes in $O(1)$ database transactions per batch rather than $O(N)$ operations.
- Zero external memory dependencies: Operates entirely within standard PostgreSQL without requiring Redis.
- Batch granularity: An invalid event in a batch causes transactional rejection of the batch, preventing partial or corrupt states.

## Trade-offs
- `createMany` does not return generated auto-increment IDs, which is acceptable since the ingestion response requires only accepted count and quota metrics.

## Testing Strategy
- Unit test in `tests/unit/ingestion-idempotency.test.ts` verifying duplicate payload detection and 409 conflict detection on altered payloads.
- Integration test in `tests/integration/ingestion-token-bucket.test.ts` verifying transaction serialization under concurrent requests.
- Live automated benchmark in `scripts/benchmark-ingest.mjs` verifying sustained throughput $\ge 200$ events/sec.
