# ADR-002: PostgreSQL Row-Level Security Implementation

**Status:** Accepted  
**Date:** 2026-11-05  
**Deciders:** ATLAS Engineering Team

---

## Context

Having decided on a shared database with RLS (ADR-001), this ADR defines _how_ RLS is implemented: which policies are written, which database role enforces them, how `FORCE ROW LEVEL SECURITY` is applied, and how isolation is proven via integration tests.

The key implementation question is: at what layer is tenant context established, and how do we prove that the enforcement is actually effective for the role the application uses at runtime?

---

## Decision Drivers

- **Auditability:** Policies must be explicit, reviewable, and testable.
- **Defense-in-depth:** Isolation must hold even when application code omits `WHERE organizationId = ...`.
- **Role accuracy:** Tests must prove isolation for the actual runtime role, not a privileged superuser.
- **Correctness under concurrency:** Policies must be safe for connection pooling (no cross-request context bleed).

---

## Considered Options

### Option A: Application-Level Filtering Only
Every query includes `WHERE organizationId = currentOrgId`. No database-level policies.

**Rejected:** One missed WHERE clause exposes all tenants' data. No DB-layer backstop. Cannot be proven in isolation from application code.

### Option B: View-Based Filtering
Create PostgreSQL views for each table that filter by a session variable. Grant application access only to views, not base tables.

**Rejected:** Prisma generates queries against base table names. Maintaining both views and base tables in sync with Prisma migrations adds significant complexity. Views cannot be used for INSERT without additional trigger/rule machinery.

### Option C: PostgreSQL Row-Level Security with FORCE ✅ (Chosen)
Apply `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` to all tenant tables. Create policies that read `current_setting('app.tenant_id', true)` from the transaction-local configuration variable.

---

## Decision

**Option C — PostgreSQL RLS with `FORCE ROW LEVEL SECURITY` and transaction-local `app.tenant_id` context.**

---

## Implementation Details

### RLS Policy Pattern

For every tenant-scoped table, the following pattern is applied in the migration:

```sql
ALTER TABLE "<TableName>" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "<TableName>" FORCE ROW LEVEL SECURITY;

-- SELECT policy
CREATE POLICY "<table>_tenant_select" ON "<TableName>"
  FOR SELECT
  USING ("organizationId" = current_setting('app.tenant_id', true));

-- INSERT policy
CREATE POLICY "<table>_tenant_insert" ON "<TableName>"
  FOR INSERT
  WITH CHECK ("organizationId" = current_setting('app.tenant_id', true));

-- UPDATE policy
CREATE POLICY "<table>_tenant_update" ON "<TableName>"
  FOR UPDATE
  USING ("organizationId" = current_setting('app.tenant_id', true))
  WITH CHECK ("organizationId" = current_setting('app.tenant_id', true));

-- DELETE policy
CREATE POLICY "<table>_tenant_delete" ON "<TableName>"
  FOR DELETE
  USING ("organizationId" = current_setting('app.tenant_id', true));
```

### Tables with RLS Enabled

| Table | RLS Enabled | FORCE RLS | Isolation Column |
|-------|-------------|-----------|-----------------|
| `Organization` | ✅ | ✅ | `id` |
| `OrganizationMember` | ✅ | ✅ | `organizationId` |
| `OrganizationUsage` | ✅ | ✅ | `organizationId` |
| `Project` | ✅ | ✅ | `organizationId` |
| `AnalyticsEvent` | ✅ | ✅ | via `projectId → organizationId` |
| `IngestionIdempotencyKey` | ✅ | ✅ | via `projectId → organizationId` |
| `invitations` | ✅ | ✅ | `organizationId` |
| `api_keys` | ✅ | ✅ | `organizationId` |

### Superuser Bypass Risk

PostgreSQL superusers and roles with `BYPASSRLS` privilege ignore all RLS policies. To mitigate:

- The application runtime connection string (`DATABASE_URL_APP`) connects as `atlas_app`, which is a non-superuser with `rolbypassrls = false`.
- The `postgres` superuser connection string (`DATABASE_URL_MIGRATION`) is used only by Prisma `migrate deploy` during CI/CD — never in request handlers.
- This is enforced structurally: separate env vars make it impossible to accidentally use the migration URL in application code without an explicit, visible code change.

---

## Security Constraints

- `FORCE ROW LEVEL SECURITY` is applied on all tenant tables. Without it, the table owner could bypass policies.
- `current_setting('app.tenant_id', true)` returns `NULL` (not an error) if the setting is unset. This means queries without a set tenant context return **zero rows** — a safe fail-closed default.
- Every new tenant-scoped table introduced in future migrations **must** include RLS setup. Failure to do so is a security regression.

---

## Testing: RLS Isolation Proof

The file `tests/integration/rls-tenant-isolation.test.ts` provides the definitive proof that RLS works for the actual application role:

1. **Test setup:** Seeds two independent tenants (A and B) using an admin connection (`DATABASE_URL_MIGRATION` / superuser).
2. **All isolation tests run via `appPool`:** The app pool connects as `atlas_app` (non-superuser, `rolbypassrls = false`).
3. **Test 0** explicitly verifies `current_user = 'atlas_app'` and `rolbypassrls = false` — confirming the test role cannot bypass policies.
4. **Tests 1–14** cover:
   - Missing context → zero rows (fail-closed).
   - Tenant A context → only Tenant A rows returned.
   - Cross-tenant SELECT returns zero rows.
   - Cross-tenant INSERT raises policy violation error.
   - Cross-tenant UPDATE/DELETE affects zero rows.
   - New models (`api_keys`, `invitations`, `OrganizationUsage`, `IngestionIdempotencyKey`) all isolated.
   - Concurrent connections with shared pool maintain strict per-connection isolation.
5. **15 integration tests all pass.**

---

## Consequences

- All application queries against tenant tables must run inside transactions with `app.tenant_id` set (see ADR-003).
- Future tables that are tenant-scoped must include RLS in their migration file.
- CI pipeline must include the RLS integration test suite running against a real PostgreSQL instance with the `atlas_app` role.
- Superuser connection strings must never appear in application environment configuration other than the migration/ops roles.
