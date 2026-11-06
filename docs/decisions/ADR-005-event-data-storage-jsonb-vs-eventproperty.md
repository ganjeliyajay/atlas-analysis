# ADR-005: Event Data Storage — JSONB vs. Normalized EventProperty Table

**Status:** Accepted  
**Date:** 2026-11-05  
**Deciders:** ATLAS Engineering Team

---

## Context

Analytics events captured by ATLAS have a fixed set of standard fields (event name, timestamp, user ID, session ID, page URL, country, device, browser) and an **arbitrary set of custom key-value properties** supplied by the customer's tracking snippet.

For example, an e-commerce customer might send:
```json
{
  "eventName": "purchase_complete",
  "properties": {
    "product_id": "prod_abc123",
    "revenue": 49.99,
    "currency": "USD",
    "category": "electronics"
  }
}
```

A SaaS customer might send entirely different keys. We need to decide how to store these arbitrary properties in PostgreSQL.

---

## Decision Drivers

- **Flexible schema:** Customer-defined property keys cannot be known in advance.
- **Query performance:** Properties must be queryable (e.g., filter events where `properties.revenue > 100`).
- **Write throughput:** Event ingestion is a high-frequency, low-latency write path.
- **Operational simplicity:** Schema migrations for new property "types" must not block ingestion.
- **Tenant isolation:** Property data must remain isolated per tenant (RLS applies to the parent row).

---

## Considered Options

### Option A: Normalized `EventProperty` Table (Entity-Attribute-Value / EAV)
Create a separate `EventProperty` table with columns `(eventId, key, value_text, value_number, value_bool)`. Each custom property becomes a separate row.

**Pros:**
- Strongly normalized; each property is individually addressable.
- Can enforce types per property key (via constraints or lookup tables).
- Standard SQL querying with `JOIN`.

**Cons:**
- JOIN overhead on every event read: a single event with 10 properties requires joining 10 rows.
- High write amplification: 10 properties → 10 `INSERT` statements (or a multi-row batch).
- Aggregation queries (e.g., "average revenue per day") require complex EAV-unfolding queries.
- RLS must cover the `EventProperty` table separately, with foreign-key-based tenant isolation (more complex policy).
- Schema migrations required to add new "property types."

### Option B: JSONB Column on `AnalyticsEvent` ✅ (Chosen)
Add a `properties Json?` column to the `AnalyticsEvent` table. Store all custom properties as a JSONB object.

**Pros:**
- Schema-less: arbitrary keys stored without migrations.
- Single row write per event regardless of property count.
- PostgreSQL JSONB supports GIN indexing for fast key/value lookups: `WHERE properties @> '{"revenue": 49.99}'`.
- Native JSON operators (`->>`, `->`, `@>`, `?`) available in SQL queries and Prisma `$queryRaw`.
- RLS on `AnalyticsEvent` automatically covers all properties — no separate table or policy needed.
- Prisma maps `Json` type to `JsonValue` in TypeScript; round-trips cleanly.

**Cons:**
- Less normalized: no DB-level type enforcement on property values.
- Property schema validation must happen at the application/API layer (Zod).
- GIN index helps but very high-cardinality property scanning can be slower than a B-tree on a typed column.

---

## Decision

**Option B — `properties Json?` JSONB column on `AnalyticsEvent`.**

The flexibility and write-throughput benefits of JSONB decisively outweigh EAV's normalization advantages for a product analytics use case. Analytics properties are inherently schema-free, and EAV's JOIN overhead would significantly increase read latency for event aggregation queries. PostgreSQL's native JSONB operators and GIN indexing provide the query capability needed without sacrificing write performance.

---

## Implementation: Prisma Schema

```prisma
model AnalyticsEvent {
  id         String   @id @default(uuid())
  eventName  String
  userId     String?
  sessionId  String?
  properties Json?          // ← JSONB column for arbitrary properties
  pageUrl    String?
  country    String?
  device     String?
  browser    String?
  createdAt  DateTime @default(now())

  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId, createdAt])
  @@index([projectId, eventName])
  @@index([projectId, userId])
}
```

A GIN index on `properties` can be added in a future migration when property-based filtering becomes a prominent query pattern:

```sql
CREATE INDEX ON "AnalyticsEvent" USING GIN (properties);
```

---

## Validation Strategy

Custom properties are validated at the ingestion API layer using Zod before being written to the database:

```typescript
const eventSchema = z.object({
  eventName: z.string().min(1).max(255),
  properties: z.record(z.string(), z.unknown()).optional(),
  // ...
});
```

This ensures:
- `properties` is always an object (never an array or primitive at the top level).
- No unbounded nesting that could cause storage bloat.
- Downstream query safety.

---

## Security: Tenant Isolation

JSONB data is stored within rows of the `AnalyticsEvent` table. The RLS policy on `AnalyticsEvent` enforces tenant isolation at the row level — a tenant cannot SELECT, INSERT, UPDATE, or DELETE rows belonging to another tenant's project. The properties JSONB column is fully contained within the row and inherits RLS protection automatically.

---

## Consequences

- Property schema validation is the application's responsibility (Zod at ingestion boundary).
- Future analytics features requiring typed aggregation on specific properties (e.g., `revenue`) should use a GIN-indexed `properties` column with PostgreSQL's `->>`/`::numeric` casting, or consider a dedicated column for high-value properties in Phase 2.
- Event ingestion tests validate that JSONB properties are stored and retrieved correctly, including nested objects and unicode values.
- EAV normalization can be introduced later for high-value properties without breaking existing event storage.
