# ADR-017: Multi-Tenant Monthly Quota Enforcement and Atomic Concurrency Invariants

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** Lead Architect, Systems & Security Engineer

## Context
Tenants on the ATLAS platform are assigned monthly event quotas (e.g., 100,000 events/month on starter tier, 10,000,000 on enterprise). When a tenant exceeds their quota, event ingestion must stop immediately with machine-readable HTTP 429 status codes without silent data drops.

## Problem
In a distributed multi-tenant platform receiving concurrent ingestion batches from multiple web workers, checking quota with a naive `SELECT COUNT(*)` followed by an `INSERT` creates a classic Time-of-Check to Time-of-Use (TOCTOU) race condition. Multiple concurrent requests can read a remaining quota of 10 events and each insert 500 events, overrunning the quota by thousands of events without detection.

## Options Considered
1. **Application-Level Check-Then-Insert:** Read `OrganizationUsage.eventCount` in Node.js, verify $< \text{quota}$, then insert.
   - *Pros:* Simple code.
   - *Cons:* Severe TOCTOU race conditions under concurrent requests; easily bypassed.
2. **Periodic Background Enforcement:** Ingest unconditionally and disable ingestion after an hourly job detects quota overage.
   - *Pros:* Fast ingestion path.
   - *Cons:* High quota leakage; tenants can overrun quotas by millions of events during the lag window.
3. **Atomic PostgreSQL Conditional Upsert with In-Transaction Rollback (Selected):** Single atomic `INSERT ... ON CONFLICT DO UPDATE` with a strict `WHERE` guard comparing projected usage against `Organization.eventQuota`.

## Decision
Adopt Option 3.
- Monthly Period Alignment: Quotas are tracked by UTC calendar month (`periodStart = UTC_MONTH_START`).
- Atomic Reservation:
  ```sql
  INSERT INTO "OrganizationUsage" ("id", "organizationId", "periodStart", "eventCount", "createdAt", "updatedAt")
  SELECT gen_random_uuid(), org."id", :periodStart, :batchSize, NOW(), NOW()
  FROM "Organization" AS org
  WHERE org."id" = :organizationId AND org."eventQuota" >= :batchSize
  ON CONFLICT ("organizationId", "periodStart")
  DO UPDATE SET
    "eventCount" = "OrganizationUsage"."eventCount" + :batchSize,
    "updatedAt" = NOW()
  WHERE "OrganizationUsage"."eventCount" + :batchSize <= (
    SELECT "eventQuota" FROM "Organization" WHERE "id" = :organizationId
  )
  RETURNING "eventCount";
  ```
- Rejection Semantics: If the atomic upsert returns 0 rows, the transaction immediately detects quota exhaustion, logs the error to `ingestion_error_logs`, and aborts the transaction.
- Response: Returns HTTP 429 with machine-readable JSON:
  ```json
  {
    "error": "quota_exceeded",
    "message": "Monthly event quota exceeded for this organization.",
    "quota": { "limit": 100000, "used": 100000, "remaining": 0, "resetAt": "2026-12-01T00:00:00.000Z" }
  }
  ```

## Consequences
- Guaranteed zero quota leakage even under hundreds of parallel concurrent requests.
- No silent data loss: clients receive definitive 429 rejection and can back off or upgrade.

## Trade-offs
- Requires acquiring an atomic row update lock on `OrganizationUsage` for that tenant month. Contention is negligible because lock duration is $< 1\text{ms}$.

## Testing Strategy
- Concurrency integration tests validating parallel batch submissions near quota limits.
- Automated API rejection test asserting HTTP 429 and machine-readable payload format when quota is exhausted.

