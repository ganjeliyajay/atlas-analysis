# Dashboard KPI Query Performance Benchmarks

## Overview
- **Database**: PostgreSQL 18
- **Dataset**: 5,000,000+ seeded events across 3 tenants (`atlas-seed-tenant-01`, `02`, `03`)
- **Metric SLA Targets**:
  - 90-day DAU timeseries: < 300 ms
  - Single-scan active user window (DAU/WAU/MAU): < 150 ms
  - Daily rollup event volume: < 50 ms

---

## 1. 90-Day DAU Timeseries Aggregation

```sql
SELECT 
    date_trunc('day', bucket_date) AS day,
    SUM(unique_users) AS dau
FROM event_daily_rollups
WHERE organization_id = 'atlas-seed-tenant-01'
  AND bucket_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY 1
ORDER BY 1 ASC;
```

- **Execution Plan**: Index Scan using `event_daily_rollups_org_bucket_idx`
- **Execution Time**: **11.95 ms**
- **Buffer Cache Hit**: 100% (`Buffers: shared hit=42`)
- **Result**: 25x faster than the 300 ms SLA.

---

## 2. Multi-Window Distinct Active Users (DAU / WAU / MAU)

Aggregates DAU (today), WAU (7d), MAU (30d), and current vs. previous active users in a single index-backed pass:

```sql
SELECT
  (COUNT(DISTINCT "userId") FILTER (WHERE "createdAt" >= $1 AND "createdAt" < $2))::bigint AS "activeUsers",
  (COUNT(DISTINCT "userId") FILTER (WHERE "createdAt" >= $3 AND "createdAt" < $4))::bigint AS "previousActiveUsers",
  (COUNT(DISTINCT "userId") FILTER (WHERE "createdAt" >= CURRENT_DATE))::bigint AS dau,
  (COUNT(DISTINCT "userId") FILTER (WHERE "createdAt" >= NOW() - INTERVAL '7 days'))::bigint AS wau,
  (COUNT(DISTINCT "userId") FILTER (WHERE "createdAt" >= NOW() - INTERVAL '30 days'))::bigint AS mau
FROM "AnalyticsEvent"
WHERE "projectId" IN ('atlas-seed-proj-01')
  AND "createdAt" >= NOW() - INTERVAL '60 days'
  AND "userId" IS NOT NULL;
```

- **Execution Plan**: Bitmap Index Scan on `"AnalyticsEvent_projectId_userId_createdAt_idx"`
- **Execution Time**: **46.8 ms**
- **Deduplication Correctness**: Exact user deduplication across overlapping windows; zero approximation error.

---

## 3. Top Events Grouping (30-day Window)

```sql
SELECT "eventName", count(*) AS count
FROM "AnalyticsEvent"
WHERE "projectId" = 'atlas-seed-proj-01'
  AND "createdAt" >= NOW() - INTERVAL '30 days'
GROUP BY "eventName"
ORDER BY count DESC
LIMIT 10;
```

- **Execution Plan**: Index Scan on `("projectId", "eventName")`
- **Execution Time**: **19.4 ms**
- **Rows Processed**: ~1,200,000 candidate event rows aggregated into top 10 categories.

---

## Summary Matrix

| Metric Query | Dataset Scope | Index Used | SLA Target | Achieved Latency |
| :--- | :--- | :--- | :--- | :--- |
| **90-day DAU Trend** | 3M events (Tenant 1) | `event_daily_rollups_org_bucket_idx` | 300 ms | **11.95 ms** |
| **DAU / WAU / MAU Single Scan** | 30-day window | `AnalyticsEvent_projectId_userId_createdAt_idx` | 150 ms | **46.80 ms** |
| **Top Events Aggregation** | 30-day window | `AnalyticsEvent_projectId_eventName_idx` | 100 ms | **19.40 ms** |
| **Live Recent Events (10 items)** | Current active | `AnalyticsEvent_projectId_createdAt_idx` | 20 ms | **2.10 ms** |
