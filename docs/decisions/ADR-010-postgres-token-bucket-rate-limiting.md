# ADR-010: PostgreSQL-backed token bucket

- **Status:** Accepted
- **Date:** 2026-11-06

## Context
An in-memory limiter is inconsistent across server instances and resets on restart. Phase 2 requires a per-key token bucket and a machine-actionable 429 response.

## Decision
Store one bucket per organization and SHA-256 API-key hash in PostgreSQL. The bucket table is tenant-scoped by `app.tenant_id` and its RLS policy. A PL/pgSQL function locks the bucket row, refills tokens using elapsed wall-clock seconds, consumes one token per event in the validated batch, and returns remaining capacity plus a retry delay. The initial capacity is 10,000 events and the refill rate is 200 events/second. The SECURITY INVOKER function verifies the transaction-local tenant context and is atomic across concurrent application instances.

## Trade-offs
PostgreSQL adds one short database round trip per batch, but provides shared state and avoids a new hosted dependency. Rate-limit records contain only one-way key digests, not raw API keys. Rate-limit table is operational state rather than tenant-readable analytics data, so it is not exposed to tenant dashboard roles.
