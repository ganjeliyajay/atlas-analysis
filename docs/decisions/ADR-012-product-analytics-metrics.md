# ADR-012: Product Analytics Metric Definitions (DAU, WAU, MAU, and Stickiness)

- **Status:** Accepted
- **Date:** 2026-11-06 (Updated 2026-11-12)
- **Deciders:** Lead Architect, Product Analytics Team

## Context
A product analytics platform must provide reliable metrics for Daily Active Users (DAU), Weekly Active Users (WAU), Monthly Active Users (MAU), and platform stickiness ($\frac{\text{DAU}}{\text{MAU}}$). Inconsistent counting of anonymous sessions, duplicate user identifiers, or multiple events by the same user will invalidate metrics.

## Problem
Naively summing daily unique users across a 30-day period creates gross over-counting because a single user active on 15 days would be counted 15 times rather than once for MAU. Furthermore, computing rolling distinct counts across separate database round-trips strains query resources.

## Options Considered
1. **Application-level user set deduplication:** Fetch all user IDs into Node.js `Set` and measure `.size`.
   - *Pros:* Simple to write in JavaScript.
   - *Cons:* Massive memory consumption on 50,000+ unique users; fails scalability requirements.
2. **Multiple separate SQL queries:** Issue independent `COUNT(DISTINCT "userId")` queries for DAU, WAU, and MAU.
   - *Pros:* Modular.
   - *Cons:* 3–4 table scans across large partitions; connection saturation.
3. **Single Scan with Filtered Aggregates (Selected):** Single SQL query utilizing `FILTER (WHERE ...)` clauses over a unified time window.

## Decision
Adopt Option 3.
- DAU: Count of distinct `userId` values with at least one event where `createdAt >= UTC_TODAY_START`.
- WAU: Count of distinct `userId` values with at least one event where `createdAt >= NOW - 7 DAYS`.
- MAU: Count of distinct `userId` values with at least one event where `createdAt >= NOW - 30 DAYS`.
- Single Database Scan: When querying raw events, execute a unified SQL query using conditional filter clauses:
  ```sql
  SELECT
    COUNT(DISTINCT "userId") FILTER (WHERE "createdAt" >= :today) AS dau,
    COUNT(DISTINCT "userId") FILTER (WHERE "createdAt" >= :seven_days_ago) AS wau,
    COUNT(DISTINCT "userId") FILTER (WHERE "createdAt" >= :thirty_days_ago) AS mau
  FROM "AnalyticsEvent"
  WHERE "projectId" IN (...) AND "createdAt" >= :thirty_days_ago;
  ```
- Anonymous Event Handling: Unauthenticated events with `userId IS NULL` are tracked under Session and Event Volume metrics but are strictly excluded from Active User counts to avoid inflating unique user figures.

## Consequences
- Database scans the event index once to derive DAU, WAU, and MAU simultaneously.
- Metrics are deterministic and reflect verified unique individuals.

## Trade-offs
- Filtering out `userId IS NULL` means anonymous browsing is not reflected in user metrics until an identify call links the user.

## Testing Strategy
- Unit tests against mocked fixture distributions.
- End-to-end audit verification in `scripts/test-e2e.mjs` verifying accurate metric computation after multi-event ingestion.
