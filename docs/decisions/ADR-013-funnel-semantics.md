# ADR-013: Funnel Query Architecture and Multi-Step Conversion Semantics

- **Status:** Accepted
- **Date:** 2026-11-06 (Updated 2026-11-12)
- **Deciders:** Lead Architect, Analytics & Query Engineering

## Context
Funnel analysis measures customer conversion progression through ordered event steps (e.g., `page_view` $\rightarrow$ `signup_started` $\rightarrow$ `signup_completed` $\rightarrow$ `purchase`). Funnels require configurable conversion windows (e.g. 1 to 30 days) and date ranges, with step-by-step drop-off and conversion percentages.

## Problem
A naive implementation performs $N-1$ recursive `JOIN` operations (self-joins) on `AnalyticsEvent` for an $N$-step funnel. On tables with millions of rows, self-joins cause exponential query complexity ($O(R^N)$), plan explosions, and database lockups. Furthermore, repeated events and unordered executions must not double-count or falsely register as conversions.

## Options Considered
1. **Self-Join Per Step:** `FROM "AnalyticsEvent" e1 JOIN "AnalyticsEvent" e2 ON e1.userId = e2.userId AND e2.createdAt >= e1.createdAt...`
   - *Pros:* Conceptual simplicity.
   - *Cons:* Extremely slow on $\ge 3$ steps; catastrophic memory and temporary disk usage.
2. **In-Memory Graph Traversal in Node.js:** Stream all events to application server and trace user paths.
   - *Pros:* High flexibility in JavaScript.
   - *Cons:* Heavy network serialization, high memory usage, unacceptable latency.
3. **Optimized PostgreSQL Conditional Window Aggregation (Selected):** Aggregate user event occurrences in a CTE, project first-occurrence timestamps per step, and compute sequential conversion windows using conditional filters.

## Decision
Adopt Option 3.
- Strict Sequential Ordering: Step $K+1$ is counted only if its occurrence timestamp is strictly greater than or equal to Step $K$ ($t_{K+1} \ge t_K$).
- Conversion Window Enforcement: Step $N$ must occur within the specified window (e.g. $t_N - t_1 \le \text{window\_days}$).
- First-Touch Deduplication: For users repeating step events multiple times (e.g., viewing pricing 5 times), only the first valid progression through the funnel is evaluated.
- Database Strategy:
  - Phase 1: Filter events in time range for the tenant's projects.
  - Phase 2: Compute `MIN(createdAt)` per user for each funnel step.
  - Phase 3: Evaluate progressive validity ($t_1 \le t_2 \le \dots \le t_K$) and conversion window constraint.
  - Phase 4: Calculate step drop-offs and overall conversion rates.

## Consequences
- Single table scan over the indexed `(projectId, userId, createdAt)` index.
- Clean linear execution performance for 2 to 6 step funnels.

## Trade-offs
- Strict sequential ordering ignores out-of-order conversions (e.g. buying before viewing product page), which aligns with standard analytics semantics (Mixpanel/Amplitude).

## Testing Strategy
- Unit tests in `lib/analytics/funnel-utils.test.ts` covering:
  - Correct step ordering
  - Missing steps
  - Repeated events by same user
  - Multiple conversion paths
  - Conversion window expiration
  - Empty results and off-by-one boundary checks.
