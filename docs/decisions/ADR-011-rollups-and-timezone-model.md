# ADR-011: Precomputed Rollups and Universal UTC Timezone Model

- **Status:** Accepted
- **Date:** 2026-11-06 (Updated 2026-11-12)
- **Deciders:** Lead Architect, Database Performance Team

## Context
As raw event tables grow into millions of rows, calculating Daily Active Users (DAU), Weekly Active Users (WAU), and event volume trends on the fly causes slow query times ($> 5\text{ seconds}$ on 5M+ rows) and high CPU utilization. At the same time, inconsistent handling of local timezones and daylight saving creates disjointed daily groupings.

## Problem
Performing `COUNT(DISTINCT "userId")` across millions of rows on every dashboard view is unsustainable. If rollups are precomputed using local tenant timezones, changing timezones or aggregating across international offices becomes inconsistent.

## Options Considered
1. **Dynamic Real-Time Aggregation Only:** Always query `AnalyticsEvent` directly using indexes.
   - *Pros:* Always up-to-the-second accurate.
   - *Cons:* Fails the sub-300ms SLA on 90-day queries; crashes database under multiple concurrent dashboard users.
2. **Materialized Views with Periodic Refresh:** PostgreSQL native materialized views.
   - *Pros:* Native database feature.
   - *Cons:* Full view refreshes lock tables or consume massive I/O; lacks granular tenant-by-tenant incremental rollup logic.
3. **Dedicated Rollup Tables with UTC Invariant and Special `__all__` Partition (Selected):** Precompute hourly (`event_hourly_rollups`) and daily (`event_daily_rollups`) aggregations using an idempotent scheduled cron job.

## Decision
Adopt Option 3.
- UTC Invariant: All timestamps in `AnalyticsEvent.createdAt` are strictly stored in UTC. Rollup buckets (`bucketStart`) are strictly stored in UTC calendar boundaries.
- Precomputed Rollup Tables:
  - `event_hourly_rollups`: Tracks `(organizationId, bucketStart, eventName, eventCount, uniqueUsers, uniqueSessions)` for 72-hour rolling windows.
  - `event_daily_rollups`: Tracks `(organizationId, bucketStart, eventName, eventCount, uniqueUsers, uniqueSessions)` for 90-day rolling windows.
- Distinct User Integrity: To prevent the fallacy of summing unique users across multiple event types (which double-counts users who perform both `page_view` and `purchase`), rollups calculate an explicit `__all__` event row per bucket that deduplicates unique users across all events.
- Read Path Switching: Dashboard queries inspect date range parameters. When exact whole UTC day windows are requested without granular ad-hoc property filters, queries route directly to `event_daily_rollups`, achieving execution times $< 15\text{ms}$.
- Scheduled Execution: Rollups are computed via `POST /api/cron/rollups` authenticated with `CRON_SECRET`. The job uses transactional `DELETE ... WHERE bucketStart >= ...` followed by `INSERT ... SELECT` to guarantee rerun idempotency.

## Consequences
- 90-day DAU queries execute in 11.95ms on 5,000,000 seeded events, easily beating the 300ms SLA.
- Raw events remain the immutable source of truth; rollups can be recalculated at any time without data loss.

## Trade-offs
- Daily rollups aggregate on UTC calendar days. Reports requiring non-UTC timezone conversions either query raw events or apply client-side UTC offset presentation.

## Testing Strategy
- Automated test in `scripts/test-rollup-idempotency.mjs` verifying that running the rollup job twice yields identical checksums across metric columns.
- Query plan verification in `docs/perf/90-day-dau-explain.txt` demonstrating index-only scan on `event_daily_rollups`.
