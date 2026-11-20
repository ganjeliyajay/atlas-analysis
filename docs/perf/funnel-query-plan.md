# ATLAS Analytics — Funnel Query Execution Plans (Apples-to-Apples Verification)

**Database Total AnalyticsEvent Rows**: 5,023,918  
**Selected Project**: `2022da25-b8e1-4890-8a42-9031a7ff5f9d`  
**Selected Project Event Count**: 1,669,517  
**Date Range**: `2026-09-14T05:07:11.304Z` to `2026-11-26T04:00:01.000Z`  
**Conversion Window**: `30 days` from Step 0 (ADR-013 Semantics)  
**Execution Timestamp**: 2026-11-17T15:03:19.782Z  

---

## 1. Apples-to-Apples Conversion Counts Verification

| Funnel Step | Event Name | Legacy Count | Optimized Count | Semantics Verification |
| :--- | :--- | :---: | :---: | :---: |
| **Step 0** | `session_started` | **7,244** | **7,244** | **100% IDENTICAL MATCH** |
| **Step 1** | `product_viewed` | **800** | **800** | **100% IDENTICAL MATCH** |
| **Step 2** | `signup_started` | **500** | **500** | **100% IDENTICAL MATCH** |
| **Step 3** | `signup_completed` | **350** | **350** | **100% IDENTICAL MATCH** |
| **Step 4** | `purchase` | **200** | **200** | **100% IDENTICAL MATCH** |

---

## 2. Benchmark Summary Metrics

| Metric | Legacy Engine | Optimized Engine | Delta / Improvement |
| :--- | :---: | :---: | :---: |
| **Full Funnel Execution Time** | **9557.70 ms** | **4503.83 ms** | **2.12x FASTER (52.9% latency reduction)** |
| **Planning Time** | **2.21 ms** | **1.85 ms** | **1.2x FASTER** |

---

## 3. Legacy Query Plan (EXPLAIN ANALYZE)

```
Aggregate  (cost=180221.89..180221.90 rows=1 width=40) (actual time=9556.945..9556.961 rows=1.00 loops=1)
  Buffers: shared hit=1498559 read=19151
  CTE step_0
    ->  GroupAggregate  (cost=0.56..176969.46 rows=37556 width=68) (actual time=0.356..3929.481 rows=7244.00 loops=1)
          Group Key: "AnalyticsEvent"."userId"
          Buffers: shared hit=461849 read=16731
          ->  Index Only Scan using "AnalyticsEvent_projectId_eventName_userId_createdAt_idx" on "AnalyticsEvent"  (cost=0.56..176249.19 rows=68942 width=60) (actual time=0.287..3837.679 rows=209328.00 loops=1)
                Index Cond: (("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text) AND ("eventName" = 'session_started'::text) AND ("userId" IS NOT NULL) AND ("createdAt" >= '2026-09-14 05:07:11.304'::timestamp without time zone) AND ("createdAt" <= '2026-11-26 04:00:01'::timestamp without time zone))
                Filter: current_tenant_owns_project("projectId")
                Heap Fetches: 19770
                Index Searches: 1
                Buffers: shared hit=461849 read=16731
  CTE step_1
    ->  GroupAggregate  (cost=63.06..1814.62 rows=29 width=68) (actual time=3.698..4187.605 rows=800.00 loops=1)
          Group Key: e_1."userId", prev_1.s0_time
          Buffers: shared hit=491425 read=18521
          ->  Incremental Sort  (cost=63.06..1814.11 rows=29 width=68) (actual time=3.692..4186.697 rows=800.00 loops=1)
                Sort Key: e_1."userId", prev_1.s0_time
                Presorted Key: e_1."userId"
                Full-sort Groups: 25  Sort Method: quicksort  Average Memory: 27kB  Peak Memory: 27kB
                Buffers: shared hit=491425 read=18521
                ->  Nested Loop  (cost=0.56..1812.81 rows=29 width=68) (actual time=0.068..4185.551 rows=800.00 loops=1)
                      Buffers: shared hit=491425 read=18521
                      ->  CTE Scan on step_0 prev_1  (cost=0.00..845.01 rows=188 width=80) (actual time=0.001..3941.321 rows=7244.00 loops=1)
                            Filter: ("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text)
                            Storage: Memory  Maximum Storage: 744kB
                            Buffers: shared hit=461842 read=16727
                      ->  Index Only Scan using "AnalyticsEvent_projectId_eventName_userId_createdAt_idx" on "AnalyticsEvent" e_1  (cost=0.56..5.14 rows=1 width=60) (actual time=0.032..0.032 rows=0.11 loops=7244)
                            Index Cond: (("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text) AND ("eventName" = 'product_viewed'::text) AND ("userId" = prev_1."userId") AND ("createdAt" >= prev_1.step_time) AND ("createdAt" <= '2026-11-26 04:00:01'::timestamp without time zone))
                            Filter: (current_tenant_owns_project("projectId") AND ("createdAt" <= (prev_1.s0_time + '30 days'::interval)))
                            Heap Fetches: 800
                            Index Searches: 7244
                            Buffers: shared hit=29583 read=1794
  CTE step_2
    ->  GroupAggregate  (cost=0.56..9.52 rows=1 width=68) (actual time=0.234..4220.008 rows=500.00 loops=1)
          Group Key: e_2."userId", prev_2.s0_time
          Buffers: shared hit=495479 read=18840
          ->  Nested Loop  (cost=0.56..9.50 rows=1 width=68) (actual time=0.151..4219.256 rows=500.00 loops=1)
                Buffers: shared hit=495479 read=18840
                ->  CTE Scan on step_1 prev_2  (cost=0.00..0.65 rows=1 width=80) (actual time=0.005..4184.595 rows=800.00 loops=1)
                      Filter: ("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text)
                      Storage: Memory  Maximum Storage: 92kB
                      Buffers: shared hit=491154 read=18464
                ->  Index Only Scan using "AnalyticsEvent_projectId_eventName_userId_createdAt_idx" on "AnalyticsEvent" e_2  (cost=0.56..8.84 rows=1 width=60) (actual time=0.042..0.042 rows=0.62 loops=800)
                      Index Cond: (("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text) AND ("eventName" = 'signup_started'::text) AND ("userId" = prev_2."userId") AND ("createdAt" >= prev_2.step_time) AND ("createdAt" <= '2026-11-26 04:00:01'::timestamp without time zone))
                      Filter: (current_tenant_owns_project("projectId") AND ("createdAt" <= (prev_2.s0_time + '30 days'::interval)))
                      Heap Fetches: 500
                      Index Searches: 800
                      Buffers: shared hit=4325 read=376
  CTE step_3
    ->  GroupAggregate  (cost=0.56..8.89 rows=1 width=68) (actual time=0.403..4244.762 rows=350.00 loops=1)
          Group Key: e_3."userId", prev_3.s0_time
          Buffers: shared hit=498266 read=19089
          ->  Nested Loop  (cost=0.56..8.87 rows=1 width=68) (actual time=0.145..4244.163 rows=350.00 loops=1)
                Buffers: shared hit=498266 read=19089
                ->  CTE Scan on step_2 prev_3  (cost=0.00..0.02 rows=1 width=80) (actual time=0.001..4220.298 rows=500.00 loops=1)
                      Filter: ("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text)
                      Storage: Memory  Maximum Storage: 63kB
                      Buffers: shared hit=495465 read=18839
                ->  Index Only Scan using "AnalyticsEvent_projectId_eventName_userId_createdAt_idx" on "AnalyticsEvent" e_3  (cost=0.56..8.84 rows=1 width=60) (actual time=0.046..0.046 rows=0.70 loops=500)
                      Index Cond: (("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text) AND ("eventName" = 'signup_completed'::text) AND ("userId" = prev_3."userId") AND ("createdAt" >= prev_3.step_time) AND ("createdAt" <= '2026-11-26 04:00:01'::timestamp without time zone))
                      Filter: (current_tenant_owns_project("projectId") AND ("createdAt" <= (prev_3.s0_time + '30 days'::interval)))
                      Heap Fetches: 350
                      Index Searches: 500
                      Buffers: shared hit=2801 read=250
  ->  Merge Left Join  (cost=0.56..949.95 rows=37556 width=143) (actual time=5.131..9551.959 rows=7244.00 loops=1)
        Merge Cond: (step_0."userId" = step_1."userId")
        Join Filter: (step_1."projectId" = step_0."projectId")
        Buffers: shared hit=1498559 read=19151
        ->  CTE Scan on step_0  (cost=0.00..751.12 rows=37556 width=64) (actual time=0.358..1.678 rows=7244.00 loops=1)
              Storage: Memory  Maximum Storage: 744kB
              Buffers: shared hit=7 read=4
        ->  Materialize  (cost=0.56..9.71 rows=29 width=143) (actual time=4.765..9545.575 rows=800.00 loops=1)
              Storage: Memory  Maximum Storage: 17kB
              Buffers: shared hit=1498552 read=19147
              ->  Merge Left Join  (cost=0.56..9.64 rows=29 width=143) (actual time=4.757..9544.755 rows=800.00 loops=1)
                    Merge Cond: (step_1."userId" = step_2."userId")
                    Join Filter: (step_2."projectId" = step_1."projectId")
                    Buffers: shared hit=1498552 read=19147
                    ->  CTE Scan on step_1  (cost=0.00..0.58 rows=29 width=64) (actual time=3.700..4.108 rows=800.00 loops=1)
                          Storage: Memory  Maximum Storage: 92kB
                          Buffers: shared hit=271 read=57
                    ->  Materialize  (cost=0.56..8.97 rows=1 width=111) (actual time=1.045..9537.336 rows=500.00 loops=1)
                          Storage: Memory  Maximum Storage: 17kB
                          Buffers: shared hit=1498281 read=19090
                          ->  Nested Loop Left Join  (cost=0.56..8.97 rows=1 width=111) (actual time=1.032..9536.450 rows=500.00 loops=1)
                                Join Filter: ((e."projectId" = step_3."projectId") AND (e."userId" = step_3."userId"))
                                Rows Removed by Join Filter: 99800
                                Buffers: shared hit=1498281 read=19090
                                ->  Nested Loop Left Join  (cost=0.00..0.06 rows=1 width=128) (actual time=0.643..56.439 rows=500.00 loops=1)
                                      Join Filter: ((step_3."projectId" = step_2."projectId") AND (step_3."userId" = step_2."userId"))
                                      Rows Removed by Join Filter: 174650
                                      Buffers: shared hit=33 read=4
                                      ->  CTE Scan on step_2  (cost=0.00..0.02 rows=1 width=64) (actual time=0.236..0.481 rows=500.00 loops=1)
                                            Storage: Memory  Maximum Storage: 63kB
                                            Buffers: shared hit=14 read=1
                                      ->  CTE Scan on step_3  (cost=0.00..0.02 rows=1 width=64) (actual time=0.001..0.041 rows=350.00 loops=500)
                                            Storage: Memory  Maximum Storage: 49kB
                                            Buffers: shared hit=19 read=3
                                ->  GroupAggregate  (cost=0.56..8.89 rows=1 width=68) (actual time=0.092..18.902 rows=200.00 loops=500)
                                      Group Key: e."userId", prev.s0_time
                                      Buffers: shared hit=1498248 read=19086
                                      ->  Nested Loop  (cost=0.56..8.87 rows=1 width=60) (actual time=0.047..18.682 rows=200.00 loops=500)
                                            Buffers: shared hit=1498248 read=19086
                                            ->  CTE Scan on step_3 prev  (cost=0.00..0.02 rows=1 width=80) (actual time=0.000..8.615 rows=350.00 loops=500)
                                                  Filter: ("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text)
                                                  Storage: Memory  Maximum Storage: 49kB
                                                  Buffers: shared hit=498247 read=19086
                                            ->  Index Only Scan using "AnalyticsEvent_projectId_eventName_userId_createdAt_idx" on "AnalyticsEvent" e  (cost=0.56..8.84 rows=1 width=60) (actual time=0.028..0.028 rows=0.57 loops=175000)
                                                  Index Cond: (("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text) AND ("eventName" = 'purchase'::text) AND ("userId" = prev."userId") AND ("createdAt" >= prev.step_time) AND ("createdAt" <= '2026-11-26 04:00:01'::timestamp without time zone))
                                                  Filter: (current_tenant_owns_project("projectId") AND ("createdAt" <= (prev.s0_time + '30 days'::interval)))
                                                  Heap Fetches: 100000
                                                  Index Searches: 175000
                                                  Buffers: shared hit=1000001
Planning Time: 2.211 ms
Execution Time: 9557.701 ms
```

---

## 4. Optimized Query Plan (EXPLAIN ANALYZE)

```
Result  (cost=179108.94..179108.95 rows=1 width=40) (actual time=4502.951..4502.962 rows=1.00 loops=1)
  Buffers: shared hit=500029 read=19681
  CTE step_0
    ->  Unique  (cost=0.56..176421.54 rows=37556 width=60) (actual time=0.329..4232.653 rows=7244.00 loops=1)
          Buffers: shared hit=461686 read=16894
          ->  Index Only Scan using "AnalyticsEvent_projectId_eventName_userId_createdAt_idx" on "AnalyticsEvent"  (cost=0.56..176249.19 rows=68942 width=60) (actual time=0.327..4173.981 rows=209328.00 loops=1)
                Index Cond: (("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text) AND ("eventName" = 'session_started'::text) AND ("userId" IS NOT NULL) AND ("createdAt" >= '2026-09-14 05:07:11.304'::timestamp without time zone) AND ("createdAt" <= '2026-11-26 04:00:01'::timestamp without time zone))
                Filter: current_tenant_owns_project("projectId")
                Heap Fetches: 19770
                Index Searches: 1
                Buffers: shared hit=461686 read=16894
  CTE step_1
    ->  Unique  (cost=63.06..1814.19 rows=29 width=68) (actual time=1.855..182.760 rows=800.00 loops=1)
          Buffers: shared hit=29172 read=2205
          ->  Incremental Sort  (cost=63.06..1814.11 rows=29 width=68) (actual time=1.854..182.531 rows=800.00 loops=1)
                Sort Key: e."userId", e."createdAt"
                Presorted Key: e."userId"
                Full-sort Groups: 25  Sort Method: quicksort  Average Memory: 27kB  Peak Memory: 27kB
                Buffers: shared hit=29172 read=2205
                ->  Nested Loop  (cost=0.56..1812.81 rows=29 width=68) (actual time=0.108..181.585 rows=800.00 loops=1)
                      Buffers: shared hit=29172 read=2205
                      ->  CTE Scan on step_0 prev  (cost=0.00..845.01 rows=188 width=72) (actual time=0.002..2.925 rows=7244.00 loops=1)
                            Filter: ("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text)
                            Storage: Memory  Maximum Storage: 687kB
                      ->  Index Only Scan using "AnalyticsEvent_projectId_eventName_userId_createdAt_idx" on "AnalyticsEvent" e  (cost=0.56..5.14 rows=1 width=60) (actual time=0.024..0.024 rows=0.11 loops=7244)
                            Index Cond: (("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text) AND ("eventName" = 'product_viewed'::text) AND ("userId" = prev."userId") AND ("createdAt" >= prev.step_time) AND ("createdAt" <= '2026-11-26 04:00:01'::timestamp without time zone))
                            Filter: (current_tenant_owns_project("projectId") AND ("createdAt" <= (prev.step_time + '30 days'::interval)))
                            Heap Fetches: 800
                            Index Searches: 7244
                            Buffers: shared hit=29172 read=2205
  CTE step_2
    ->  Unique  (cost=9.51..9.56 rows=1 width=68) (actual time=2.396..36.264 rows=500.00 loops=1)
          Buffers: shared hit=4347 read=354
          ->  Incremental Sort  (cost=9.51..9.56 rows=2 width=68) (actual time=2.394..36.099 rows=500.00 loops=1)
                Sort Key: e_1."userId", e_1."createdAt"
                Presorted Key: e_1."userId"
                Full-sort Groups: 16  Sort Method: quicksort  Average Memory: 27kB  Peak Memory: 27kB
                Buffers: shared hit=4347 read=354
                ->  Nested Loop  (cost=0.56..9.50 rows=1 width=68) (actual time=0.158..35.395 rows=500.00 loops=1)
                      Buffers: shared hit=4347 read=354
                      ->  CTE Scan on step_1 prev_1  (cost=0.00..0.65 rows=1 width=80) (actual time=0.002..0.432 rows=800.00 loops=1)
                            Filter: ("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text)
                            Storage: Memory  Maximum Storage: 92kB
                      ->  Index Only Scan using "AnalyticsEvent_projectId_eventName_userId_createdAt_idx" on "AnalyticsEvent" e_1  (cost=0.56..8.84 rows=1 width=60) (actual time=0.042..0.043 rows=0.62 loops=800)
                            Index Cond: (("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text) AND ("eventName" = 'signup_started'::text) AND ("userId" = prev_1."userId") AND ("createdAt" >= prev_1.step_time) AND ("createdAt" <= '2026-11-26 04:00:01'::timestamp without time zone))
                            Filter: (current_tenant_owns_project("projectId") AND ("createdAt" <= (prev_1.s0_time + '30 days'::interval)))
                            Heap Fetches: 500
                            Index Searches: 800
                            Buffers: shared hit=4347 read=354
  CTE step_3
    ->  Unique  (cost=8.88..8.93 rows=1 width=68) (actual time=1.854..24.537 rows=350.00 loops=1)
          Buffers: shared hit=2823 read=228
          ->  Incremental Sort  (cost=8.88..8.93 rows=2 width=68) (actual time=1.853..24.436 rows=350.00 loops=1)
                Sort Key: e_2."userId", e_2."createdAt"
                Presorted Key: e_2."userId"
                Full-sort Groups: 11  Sort Method: quicksort  Average Memory: 27kB  Peak Memory: 27kB
                Buffers: shared hit=2823 read=228
                ->  Nested Loop  (cost=0.56..8.87 rows=1 width=68) (actual time=0.122..23.993 rows=350.00 loops=1)
                      Buffers: shared hit=2823 read=228
                      ->  CTE Scan on step_2 prev_2  (cost=0.00..0.02 rows=1 width=80) (actual time=0.001..0.234 rows=500.00 loops=1)
                            Filter: ("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text)
                            Storage: Memory  Maximum Storage: 63kB
                      ->  Index Only Scan using "AnalyticsEvent_projectId_eventName_userId_createdAt_idx" on "AnalyticsEvent" e_2  (cost=0.56..8.84 rows=1 width=60) (actual time=0.046..0.046 rows=0.70 loops=500)
                            Index Cond: (("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text) AND ("eventName" = 'signup_completed'::text) AND ("userId" = prev_2."userId") AND ("createdAt" >= prev_2.step_time) AND ("createdAt" <= '2026-11-26 04:00:01'::timestamp without time zone))
                            Filter: (current_tenant_owns_project("projectId") AND ("createdAt" <= (prev_2.s0_time + '30 days'::interval)))
                            Heap Fetches: 350
                            Index Searches: 500
                            Buffers: shared hit=2823 read=228
  CTE step_4
    ->  Unique  (cost=8.88..8.93 rows=1 width=68) (actual time=1.228..9.929 rows=200.00 loops=1)
          Buffers: shared hit=2001
          ->  Incremental Sort  (cost=8.88..8.93 rows=2 width=68) (actual time=1.227..9.872 rows=200.00 loops=1)
                Sort Key: e_3."userId", e_3."createdAt"
                Presorted Key: e_3."userId"
                Full-sort Groups: 7  Sort Method: quicksort  Average Memory: 27kB  Peak Memory: 27kB
                Buffers: shared hit=2001
                ->  Nested Loop  (cost=0.56..8.87 rows=1 width=68) (actual time=0.077..9.650 rows=200.00 loops=1)
                      Buffers: shared hit=2001
                      ->  CTE Scan on step_3 prev_3  (cost=0.00..0.02 rows=1 width=80) (actual time=0.001..0.124 rows=350.00 loops=1)
                            Filter: ("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text)
                            Storage: Memory  Maximum Storage: 49kB
                      ->  Index Only Scan using "AnalyticsEvent_projectId_eventName_userId_createdAt_idx" on "AnalyticsEvent" e_3  (cost=0.56..8.84 rows=1 width=60) (actual time=0.026..0.026 rows=0.57 loops=350)
                            Index Cond: (("projectId" = '2022da25-b8e1-4890-8a42-9031a7ff5f9d'::text) AND ("eventName" = 'purchase'::text) AND ("userId" = prev_3."userId") AND ("createdAt" >= prev_3.step_time) AND ("createdAt" <= '2026-11-26 04:00:01'::timestamp without time zone))
                            Filter: (current_tenant_owns_project("projectId") AND ("createdAt" <= (prev_3.s0_time + '30 days'::interval)))
                            Heap Fetches: 200
                            Index Searches: 350
                            Buffers: shared hit=2001
  InitPlan 6
    ->  Aggregate  (cost=845.01..845.02 rows=1 width=8) (actual time=4248.312..4248.313 rows=1.00 loops=1)
          Buffers: shared hit=461686 read=16894
          ->  CTE Scan on step_0  (cost=0.00..751.12 rows=37556 width=32) (actual time=0.332..4240.628 rows=7244.00 loops=1)
                Storage: Memory  Maximum Storage: 687kB
                Buffers: shared hit=461686 read=16894
  InitPlan 7
    ->  Aggregate  (cost=0.65..0.66 rows=1 width=8) (actual time=183.270..183.271 rows=1.00 loops=1)
          Buffers: shared hit=29172 read=2205
          ->  CTE Scan on step_1  (cost=0.00..0.58 rows=29 width=32) (actual time=1.857..183.075 rows=800.00 loops=1)
                Storage: Memory  Maximum Storage: 92kB
                Buffers: shared hit=29172 read=2205
  InitPlan 8
    ->  Aggregate  (cost=0.02..0.03 rows=1 width=8) (actual time=36.582..36.582 rows=1.00 loops=1)
          Buffers: shared hit=4347 read=354
          ->  CTE Scan on step_2  (cost=0.00..0.02 rows=1 width=32) (actual time=2.401..36.445 rows=500.00 loops=1)
                Storage: Memory  Maximum Storage: 63kB
                Buffers: shared hit=4347 read=354
  InitPlan 9
    ->  Aggregate  (cost=0.02..0.03 rows=1 width=8) (actual time=24.736..24.736 rows=1.00 loops=1)
          Buffers: shared hit=2823 read=228
          ->  CTE Scan on step_3  (cost=0.00..0.02 rows=1 width=32) (actual time=1.856..24.658 rows=350.00 loops=1)
                Storage: Memory  Maximum Storage: 49kB
                Buffers: shared hit=2823 read=228
  InitPlan 10
    ->  Aggregate  (cost=0.02..0.03 rows=1 width=8) (actual time=10.037..10.037 rows=1.00 loops=1)
          Buffers: shared hit=2001
          ->  CTE Scan on step_4  (cost=0.00..0.02 rows=1 width=32) (actual time=1.229..9.993 rows=200.00 loops=1)
                Storage: Memory  Maximum Storage: 35kB
                Buffers: shared hit=2001
Planning Time: 1.846 ms
Execution Time: 4503.830 ms
```
