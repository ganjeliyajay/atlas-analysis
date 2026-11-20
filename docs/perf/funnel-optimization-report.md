# ATLAS — Advanced Funnel Query Optimization Report

## 1. Executive Summary & Verification Context
- **Target Component**: ATLAS Funnel Analytics Engine (`lib/analytics/funnel-engine.ts`, `app/api/analytics/funnels/route.ts`).
- **Dataset Evaluated**: **5,023,790 events** in multi-tenant PostgreSQL with Row-Level Security (`atlas_app` role).
- **Partition Under Test**: `Seed Project 01` (`id: 2022da25-b8e1-4890-8a42-9031a7ff5f9d`) with **1,669,517 partition events**.
- **Funnel Evaluated**: 5-step conversion journey (`session_started` → `product_viewed` → `signup_started` → `signup_completed` → `purchase`).
- **Conversion Window**: 30 Days.
- **Benchmark Execution Role**: `atlas_app` (least-privilege application role with RLS enforcement).
- **Result Status**: **Verified 100% Mathematical Precision with 58.1% - 95.0% Latency Reduction**.

---

## 2. Quantitative Performance Comparison

| Metric | Legacy Successive CTE | Optimized Engine | Delta / Improvement |
| :--- | :--- | :--- | :--- |
| **Execution Time (Full Range)** | **10,336.63 ms** | **4,330.04 ms** | **58.1% Reduction (2.39x Faster)** |
| **Execution Time (Direct Projection)** | **8,176.45 ms** | **411.94 ms** | **95.0% Reduction (19.8x Faster)** |
| **Planning Time** | **33.47 ms** | **1.69 ms** | **19.8x Faster Planning** |
| **Shared Hit Buffers** | 1,285,114 pages | 501,506 pages | **61.0% I/O Reduction** |
| **Shared Read Buffers** | 18,387 pages | 14,106 pages | **23.3% Physical Read Reduction** |
| **Table Scan Method** | Parallel Seq Scan (1.6M rows) | **Index-Only Scan** | **Zero Table Heap Scans** |
| **Outer Join Operations** | 5-way Cartesian Left Join | **Zero Join (InitPlan Aggregates)** | **100% Join Overhead Eliminated** |

---

## 3. Mathematical Correctness & Verification

Both legacy and optimized query engines produce identical user progression metrics across all steps:

```
Step 0 [session_started] : 7,244 users (100.0%)
Step 1 [product_viewed]  :   800 users ( 11.04%)  [Drop-off: 6,444 users (88.96%)]
Step 2 [signup_started]  :   500 users (  6.90%)  [Drop-off:   300 users (37.50%)]
Step 3 [signup_completed]:   350 users (  4.83%)  [Drop-off:   150 users (30.00%)]
Step 4 [purchase]        :   200 users (  2.76%)  [Drop-off:   150 users (42.86%)]

Overall Funnel Conversion Rate : 2.76% (200 / 7,244)
Overall Funnel Drop-off Rate   : 97.24%
```

All funnel step counts are strictly monotonically non-increasing:
$$\text{Users}(S_0) \ge \text{Users}(S_1) \ge \text{Users}(S_2) \ge \text{Users}(S_3) \ge \text{Users}(S_4)$$

---

## 4. Root Cause Analysis of Legacy Architecture Bottlenecks

1. **Parallel Sequential Scan on Step 0**:
   - The legacy index was `("projectId", "userId", "createdAt")`. Because `userId` was positioned before `createdAt` and `eventName` was omitted entirely, PostgreSQL could not use the index for step 0 queries filtering across all users by `eventName = 'session_started'`. It fell back to scanning all 1,669,517 rows.
2. **Heap Page Thrashing in Intermediate Steps**:
   - For every loop in steps 1 through 4, index probes on `("projectId", "userId", "createdAt")` had to visit heap pages to verify `eventName`, reading over 118,000 heap pages.
3. **Cartesian Outer Join Explosion**:
   - In the legacy final SELECT, joining 5 CTEs via `LEFT JOIN` caused PostgreSQL to evaluate nested loops with Cartesian join filters (`Rows Removed by Join Filter: 99,800` and `174,650`), re-evaluating CTE 4 multiple times.
4. **Redundant Step 0 Re-joins**:
   - In intermediate steps, `step_0` was repeatedly joined to verify conversion window boundaries (`s0.step_time + interval`), generating unnecessary join vertices in the query planner.

---

## 5. Architectural Improvements in the Optimized Engine

1. **New Composite Covering B-Tree Index**:
   - Migration `20261117110000_funnel_composite_index`:
     ```sql
     CREATE INDEX IF NOT EXISTS "AnalyticsEvent_projectId_eventName_userId_createdAt_idx"
     ON "AnalyticsEvent"("projectId", "eventName", "userId", "createdAt");
     ```
   - Matches all 4 filter columns in index order:
     - `projectId` (Exact match)
     - `eventName` (Exact match)
     - `userId` (Equality probe or stream scan)
     - `createdAt` (Range bounds)
   - Enables **100% Index-Only Scans** with zero heap page visits.
2. **`DISTINCT ON` Streaming Stream Deduplication**:
   - Replaced expensive `GROUP BY` with `DISTINCT ON ("projectId", "userId")` and `ORDER BY "projectId", "userId", "createdAt" ASC`.
   - Leverages pre-sorted B-Tree index order, immediately emitting the earliest timestamp per user.
3. **`MATERIALIZED` CTE Boundaries**:
   - Guarantees each CTE executes exactly once, preventing PostgreSQL's query optimizer from inlining intermediate steps into redundant nested loops.
4. **`s0_time` Chaining**:
   - Step 1 carries `prev.step_time AS s0_time`, passing it downstream through the chain. Intermediate steps never perform redundant joins back to `step_0`.
5. **Zero-Overhead Scalar Subquery Projection**:
   - Replaced the 5-way `LEFT JOIN` with independent scalar subqueries:
     ```sql
     SELECT
       (SELECT COUNT(DISTINCT "userId")::bigint FROM step_0) AS step_0_users,
       (SELECT COUNT(DISTINCT "userId")::bigint FROM step_1) AS step_1_users,
       ...
     ```
   - Eliminates Cartesian join filters and sorting overhead completely.

---

## 6. PostgreSQL Row-Level Security (RLS) Verification

Tested under least-privilege `atlas_app` role:
1. **Unauthenticated / Missing Context**:
   - `app.tenant_id = ''` → Returns `step_0_users: 0, step_1_users: 0, ...` (Protected).
2. **Cross-Tenant Attack**:
   - Tenant B queries Tenant A's project → Returns `0` conversions across all steps (Blocked).
3. **Legitimate Tenant Context**:
   - Tenant A queries Tenant A's project → Returns authentic conversion metrics (Authorized).

---

## 7. Automated Test Evidence
- **Vitest**: `tests/integration/funnel-engine.test.ts` (7 passing tests covering 2-step, 3-step, 6-step, equal timestamps, repeated events, missing intermediate steps, conversion window boundaries, and cross-project isolation).
- **Playwright**: `e2e/analytics-platform.spec.ts` & `e2e/journeys.spec.ts` (15/15 browser journey tests passing).
- **TypeScript**: `npx tsc --noEmit` exited with code 0 (0 errors).
- **ESLint**: `npm run lint` exited with code 0 (0 errors, 0 warnings).
