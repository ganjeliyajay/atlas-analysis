# ADR-003: Tenant Context and Prisma Transactions

**Status:** Accepted  
**Date:** 2026-11-05  
**Deciders:** ATLAS Engineering Team

---

## Context

PostgreSQL RLS policies read `current_setting('app.tenant_id', true)` to determine which rows are visible (ADR-002). Prisma does not natively understand RLS or PostgreSQL session variables. We need a reliable mechanism to set `app.tenant_id` before every tenant-scoped query in a way that is:

- **Correct:** The setting is applied before the query executes.
- **Safe for connection pooling:** The setting cannot bleed to the next request on the same pooled connection.
- **Easy to use:** Developers should not need to remember to set context manually for every query.

---

## Decision Drivers

- Prisma does not support pre-query hooks that set PostgreSQL session variables natively.
- Connection pools reuse connections — session-level settings (`SET` / `SET SESSION`) persist after a transaction ends and could contaminate a later request on the same connection.
- Developer ergonomics: a utility wrapper is better than requiring every route to repeat boilerplate.

---

## Considered Options

### Option A: Prisma Middleware / Client Extension
Use Prisma's `$use` middleware or a client extension to intercept every query and prepend a `SET LOCAL` call.

**Rejected:**
- Prisma middleware operates at the ORM level, not the SQL level. There is no native way to issue a raw `SET LOCAL` statement before each query within the same transaction through middleware.
- Middleware that opens its own raw query before each Prisma operation would run in a different implicit transaction, defeating the purpose of `SET LOCAL`.

### Option B: Connection-Level Attributes via `@prisma/adapter-pg`
Set a startup parameter or `options` in the `pg.Pool` configuration so the setting is applied when a connection is initialized.

**Rejected:**
- Connection-level initialization sets the value once per connection lifetime. It cannot be changed per-request on a pooled connection without explicit reset.
- `SET SESSION` on a pooled connection leaks the previous request's tenant context to the next request if the connection is reused before the session resets.

### Option C: `SET LOCAL` Inside Prisma `$transaction` ✅ (Chosen)
Wrap all tenant-scoped database operations in `prisma.$transaction(async (tx) => { ... })`. As the first statement inside the transaction callback, execute `tx.$executeRawUnsafe("SELECT set_config('app.tenant_id', $1, true)", orgId)`.

---

## Decision

**Option C — Wrap tenant-scoped queries in `prisma.$transaction` with `SET LOCAL` context-setting as the first statement.**

---

## Implementation Details

### The `withTenantContext` / `withUserContext` Pattern

The utility in `lib/db-context.ts` encapsulates the pattern:

```typescript
export async function withTenantContext<T>(
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.tenant_id', $1, true)`,
      organizationId
    );
    return fn(tx);
  });
}
```

Usage in route handlers:

```typescript
// ✅ Correct — all queries in `fn` are inside the transaction with tenant context set
const projects = await withTenantContext(session.orgId, async (tx) => {
  return tx.project.findMany();
});
```

### Why `set_config(..., true)` Instead of `SET LOCAL ...`

`set_config('app.tenant_id', value, true)` is the SQL function form of `SET LOCAL app.tenant_id = value`. The third argument `true` means "apply only for the current transaction" — semantically equivalent to `SET LOCAL`. We use the function form because it accepts a parameterized value (`$1`), making it safe from SQL injection.

**Direct `SET LOCAL` via `$executeRawUnsafe` with string interpolation must never be used** (SQL injection risk). Always use parameterized `set_config`.

### Transaction Scope

- The `app.tenant_id` setting exists only for the duration of the transaction.
- When the transaction commits or rolls back, the setting is automatically cleared.
- The next request using the same pooled connection starts with no `app.tenant_id` set — which causes RLS policies to return zero rows (fail-closed by default).

---

## Trade-offs

| Concern | Impact |
|---------|--------|
| All tenant-scoped queries must be inside `$transaction` | Slight latency overhead for implicit transactions; acceptable for correctness |
| Raw SQL used for context-setting (`$executeRawUnsafe`) | Necessary; mitigated by parameterized `set_config` (not string interpolation) |
| Developers must use `withTenantContext` wrapper | Enforced by code review; not automatically enforced by TypeScript |
| Nested transactions | Prisma's interactive transactions support savepoints; nested `withTenantContext` is safe |

---

## Security Guarantees

- **Context cannot leak between requests:** `SET LOCAL` / `set_config(..., true)` is scoped to the current transaction. When the transaction ends, the setting reverts to the previous value (empty), and RLS returns zero rows for the next request on the same connection.
- **Parameterized setting:** `set_config('app.tenant_id', $1, true)` with a bound parameter prevents SQL injection in the tenant ID value.
- **RLS is the final enforcer:** Even if `withTenantContext` is accidentally bypassed in application code, RLS returns zero rows (or raises a policy violation on write). Defense-in-depth is maintained.

---

## Consequences

- All new route handlers that query tenant-scoped tables **must** use `withTenantContext` or `withUserContext`.
- Code review checklist: any `prisma.X.findMany()` / `create()` / `update()` / `delete()` call outside a `withTenantContext` wrapper for tenant data is a security defect.
- The `prismaOps` client (which connects as a privileged ops role) intentionally bypasses `withTenantContext` for specific administrative operations (e.g., invitation accept). These uses are documented in ADR-008 and in inline code comments.
