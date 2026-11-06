# ADR-004: Connection Pooling and Transaction Safety

**Status:** Accepted  
**Date:** 2026-11-05  
**Deciders:** ATLAS Engineering Team

---

## Context

ATLAS uses `@prisma/adapter-pg` (`PrismaPg`) with a `pg.Pool` to manage database connections. In a production SaaS application, connection pools are essential for performance — but they introduce a subtle security risk: if a request sets a PostgreSQL session variable (like `app.tenant_id`) and the connection is reused by another request before the variable is cleared, the second request could read the first tenant's data.

This ADR defines our strategy for ensuring that tenant context never leaks across requests in a shared connection pool.

---

## Decision Drivers

- **Connection pool reuse:** `pg.Pool` holds open connections and assigns them to requests. The pool does not reset connection state between uses by default.
- **Session variable persistence:** `SET SESSION app.tenant_id = 'org-123'` persists for the entire lifetime of the connection — even after the transaction ends.
- **Request isolation:** Each HTTP request must start with a clean, context-free connection state.
- **Performance:** Per-request connections (new `pg.Client` per request) are prohibitively expensive at scale.

---

## Considered Options

### Option A: Per-Request Connections (No Pool)
Create a new `pg.Client` and connect on every HTTP request; disconnect when done.

**Rejected:** Prohibitive connection overhead. PostgreSQL has a hard limit on simultaneous connections. TLS handshake and authentication cost per request is unacceptable at scale.

### Option B: PgBouncer in Transaction Mode
Use PgBouncer as a transaction-mode connection pooler in front of PostgreSQL. In transaction mode, a connection is returned to PgBouncer's pool after each transaction completes.

**Pros:** Strong isolation guarantee — each transaction gets a "clean" server connection from PgBouncer's perspective.  
**Cons:**  
- Requires additional infrastructure (PgBouncer sidecar or external service).  
- In transaction mode, `SET SESSION` variables do NOT persist across transactions (PgBouncer resets state), which is beneficial — but `PREPARE` and advisory locks also cannot persist, which breaks some use cases.  
- Operational complexity for local development.

**Not chosen as primary approach.** PgBouncer is compatible with our design and can be added in a later phase without code changes, because our `SET LOCAL` approach works correctly with or without PgBouncer.

### Option C: `SET SESSION` with Explicit Reset
Use `SET SESSION app.tenant_id = value` before queries, then `SET SESSION app.tenant_id = ''` (or `RESET`) after.

**Rejected:** Relies on the application always running the cleanup step. If a request errors out mid-transaction without reaching the reset, the next request on the same connection inherits stale tenant context. This is not fail-safe.

### Option D: `SET LOCAL` Inside Transactions (Transaction-Scoped) ✅ (Chosen)
Use `set_config('app.tenant_id', value, true)` (the `true` flag means "local to current transaction") inside every `prisma.$transaction` block. The setting is automatically cleared when the transaction commits or rolls back.

---

## Decision

**Option D — Transaction-scoped `SET LOCAL` via `set_config(..., true)` using `@prisma/adapter-pg` PrismaPg adapter.**

---

## Implementation Details

### PrismaPg Adapter Configuration

```typescript
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_APP,
  max: 10,
});

const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });
```

The `PrismaPg` adapter bridges Prisma's query engine to the `pg` driver, enabling `prisma.$transaction` to issue raw `SET LOCAL` statements via `$executeRawUnsafe`.

### Why `SET LOCAL` Is Safe for Pooled Connections

| Setting Type | Scope | Safe with Pool? |
|---|---|---|
| `SET SESSION app.tenant_id = val` | Until explicitly reset or connection closed | ❌ No — persists past transaction end |
| `SET LOCAL app.tenant_id = val` / `set_config(..., true)` | Current transaction only | ✅ Yes — auto-cleared on COMMIT/ROLLBACK |

When a transaction commits or rolls back, all `SET LOCAL` / `set_config(..., true)` variables revert to their pre-transaction value. Since the pool never sets `app.tenant_id` at the session level, the reverted value is effectively unset — causing subsequent RLS queries to return zero rows.

### Concurrency Verification

The RLS integration test suite includes **Test 14: Concurrent pooled connections maintain strict isolation without state leakage**, which:

1. Acquires two distinct connections from the same `pg.Pool` simultaneously (up to `max: 10`).
2. Sets different `app.tenant_id` values on each connection inside separate transactions.
3. Issues interleaved reads to verify each connection sees only its own tenant's rows.
4. Commits both transactions.
5. Verifies that after commit, `current_setting('app.tenant_id', true)` returns null/empty on both connections — confirming `SET LOCAL` was transaction-scoped.

**All 15 integration tests pass**, including this concurrent isolation test.

---

## Trade-offs

| Concern | Decision |
|---------|----------|
| All tenant queries must be inside explicit transactions | Required; enforced by `withTenantContext` wrapper (ADR-003) |
| Slightly more verbose code than a session-variable approach | Acceptable; safety is non-negotiable |
| PgBouncer not required | True; design is compatible if added later without code changes |
| `max: 10` pool size | Appropriate for initial deployment; tunable via env var |

---

## Security Guarantees

- **No cross-request context leakage:** `SET LOCAL` clearing on transaction end is a PostgreSQL guarantee, not an application convention.
- **Fail-closed on error:** If a transaction errors before setting `app.tenant_id`, the next query uses the unset default → RLS returns zero rows.
- **Concurrent isolation proven:** Test 14 proves that two simultaneous connections with different tenant contexts produce strictly isolated results with zero cross-contamination.
- **Compatible with PgBouncer transaction mode:** Our `SET LOCAL` approach is PgBouncer-safe. When PgBouncer is added for horizontal scaling, no code changes are required.

---

## Consequences

- The `pool.max` and other pool tuning parameters should be configurable via environment variables in Phase 2.
- PgBouncer can be added transparently in future phases for connection multiplexing without application code changes.
- Any future refactoring that moves queries outside `prisma.$transaction` for tenant-scoped tables must undergo security review.
