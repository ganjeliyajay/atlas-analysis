# ADR-011: Rebuildable hourly and daily rollups in UTC

- **Status:** Accepted
- **Date:** 2026-11-06

## Context
Raw events remain the source of truth, but dashboard queries over long periods should read compact rollup tables. Repeated job execution must not increment totals twice, and tenant-local timezone semantics must be explicit.

## Decision
Maintain `event_hourly_rollups` and `event_daily_rollups`, keyed by organization, UTC bucket start, and event name. Each bucket aggregates across all projects in the organization and includes an `__all__` row for totals and distinct users/sessions across all event names. The job rebuilds an overlapping 72-hour hourly window and 90-day daily window by deleting and inserting from raw events in one transaction. Rerunning it produces the same metric values. Daily buckets are UTC calendar days; the `atlas_app` database role is configured to UTC because the existing raw-event timestamp is `timestamp without time zone`. Tenant-local reporting is not silently inferred.

## Trade-offs
Rebuilding a bounded window is simpler and safer than incrementally applying deltas, and naturally handles late-arriving events. It scans raw events in the rebuild window, so a later phase may evaluate incremental materialized views or a watermark-based strategy. Exact distinct-user counts are stored per bucket; they must not be summed across days to calculate a multi-day unique-user total.
