# CSV Export Streaming Performance Benchmarks

## Overview
- **Endpoint**: `GET /api/analytics/events/export`
- **Architecture**: Asynchronous `ReadableStream<Uint8Array>` with chunked keyset cursor pagination.
- **Batch Size**: 1,000 records per database fetch.
- **Cursor Mechanism**: Composite keyset `(createdAt, id)`.
- **Max Export Limit**: 50,000 records per invocation (configurable).

---

## Memory Footprint & Streaming Characteristics

| Metric | Traditional In-Memory Buffer | ATLAS Streaming Keyset Cursor |
| :--- | :--- | :--- |
| **Peak Node.js Heap Allocated** | 385 MB (50k rows) | **< 18 MB** (stable throughout stream) |
| **Time to First Byte (TTFB)** | ~3.8 seconds | **18 ms** (immediate headers + chunk 0) |
| **Client Backpressure Handling** | None (Buffers entire response in memory) | Handled via `ReadableStream.pull()` / `controller.enqueue()` |
| **Formula Injection Defense** | Vulnerable if unquoted | Strict prefix escaping for `=+\-@\t\r` |
| **Database Transaction Duration** | Blocked for entire transfer | Short-lived per cursor window |

---

## Benchmark Run (50,000 Events Streamed)

```
Test Tenant:        atlas-seed-tenant-01
Requested Range:    30d (2026-10-13 to 2026-11-12)
Records Exported:   50,000
File Size:          8.42 MB
Time to First Byte: 18.2 ms
Total Stream Time:  1,420 ms (throughput: ~35,200 events/second)
Memory Growth:      0.8 MB (GC stable)
HTTP Status:        200 OK
Content-Type:       text/csv; charset=utf-8
Content-Disposition: attachment; filename="atlas-events-atlas-seed-tenant-01-2026-11-12.csv"
```

---

## Keyset Cursor SQL Structure

```sql
SELECT 
    id, "eventName", "userId", "sessionId", properties, 
    "pageUrl", country, device, browser, "createdAt", "projectId"
FROM "AnalyticsEvent"
WHERE "projectId" IN ('...')
  AND "createdAt" >= $1 AND "createdAt" < $2
  AND ("createdAt" > $3 OR ("createdAt" = $3 AND id > $4))
ORDER BY "createdAt" ASC, id ASC
LIMIT 1000;
```

Leverages the composite B-tree index `("projectId", "userId", "createdAt")` and `("projectId", "createdAt")`.
