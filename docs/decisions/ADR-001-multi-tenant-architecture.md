# ADR-001: Multi-Tenant Architecture

**Status:** Accepted  
**Date:** 2026-11-05  
**Deciders:** ATLAS Engineering Team

---

## Context

ATLAS Analytics is a SaaS product analytics platform that must securely isolate data between multiple customer organizations (tenants). Each tenant's analytics events, projects, API keys, and invitations must be strictly segregated — one tenant must never be able to read, modify, or delete another tenant's data, even in the event of application-layer bugs.

We evaluated three primary multi-tenancy strategies.

---

## Decision Drivers

- **Security:** Strong, verifiable tenant isolation even if application code has a bug.
- **Cost Efficiency:** Avoid per-tenant infrastructure overhead in early-stage growth.
- **Operational Simplicity:** Single database to back up, migrate, and monitor.
- **Developer Experience:** Standard ORM (Prisma) workflow without complex sharding logic.
- **Scalability:** Architecture must not block future scale-out.

---

## Considered Options

### Option A: Database-per-Tenant
Provision a separate PostgreSQL database instance for each organization.

**Pros:**
- Complete physical isolation; no risk of data leakage.
- Independent backup and restore per tenant.
- Can tune per-tenant resource limits (connection pools, storage).

**Cons:**
- Significant operational overhead — schema migrations must be applied to N databases.
- High infrastructure cost even with minimal per-tenant traffic.
- Cross-tenant reporting (e.g., platform-level aggregates) requires cross-database federation.
- Application must route connections dynamically per request.

### Option B: Schema-per-Tenant
Use PostgreSQL schemas (namespaces) so each tenant gets its own set of tables within a single database cluster.

**Pros:**
- Better isolation than shared tables; schema search path controls visibility.
- Single database cluster for lower operational cost vs. Option A.

**Cons:**
- Prisma does not natively support dynamic schema routing — requires complex connection-string or search-path manipulation.
- Schema migrations become multi-step fan-out operations.
- Connection pool sizing remains per-tenant if using `search_path` isolation.
- Moderate tooling friction with standard ORMs.

### Option C: Shared Database with Application-Level Filtering
All tenants share the same tables. Every query in application code includes a `WHERE organizationId = $currentOrg` clause.

**Pros:**
- Simple infrastructure; Prisma works out of the box.
- No migration fan-out complexity.

**Cons:**
- Isolation is only as strong as developer discipline — a missing `WHERE` clause exposes all tenant data.
- No DB-layer safety net; a single code bug causes a data breach.
- Difficult to audit and prove isolation in security reviews.

### Option D: Shared Database with PostgreSQL Row-Level Security (RLS) ✅ (Chosen)
All tenants share the same tables. PostgreSQL Row-Level Security policies enforce isolation at the database layer, independent of application code.

**Pros:**
- DB-layer enforcement: even a buggy application query without `WHERE` returns only the current tenant's rows.
- Single database — simple migrations, single backup, single monitoring target.
- Cost-efficient for SaaS bootstrapping (scales to larger tenants by adding read replicas or upgrading hardware).
- Auditable: RLS policies live in the migration files and can be reviewed and tested independently.
- No cross-shard JOIN complexity.

**Cons:**
- RLS policy design requires expertise — policies must cover SELECT, INSERT, UPDATE, DELETE.
- Every application query must run inside a transaction that sets the `app.tenant_id` session variable.
- `FORCE ROW LEVEL SECURITY` must be applied to all tenant tables — missing it on a new table is a latent bug.
- Superuser connections bypass RLS; application must never use the migration superuser role for runtime queries.

---

## Domain model mapping

The project uses the domain names `Organization` and `OrganizationMember` instead of the brief's generic `Tenant` and `Membership` names. In this codebase, **one Organization is one tenant**, and **one OrganizationMember row is one user's membership in that tenant**. `User` is global identity data. The naming is retained to avoid a destructive rename across the existing application and migrations; the security boundary is the organization ID.

## Decision

**Option D — Shared database with PostgreSQL Row-Level Security.**

RLS is the strongest isolation guarantee available short of physical database separation, and it operates independently of application code. When a developer forgets a `WHERE` clause, the database itself enforces the boundary. For a bootstrapped SaaS platform targeting early growth, the operational cost and migration complexity of database-per-tenant or schema-per-tenant is not justified.

---

## Security Constraints

- The `atlas_app` database role (used by all runtime queries) is a **non-superuser** with `rolbypassrls = false`. It cannot bypass RLS under any circumstances.
- The `postgres` superuser role is used **only** for schema migrations (`DATABASE_URL_MIGRATION`) and must never be used in request-handling code paths.
- A third `prismaOps` role is used for privileged administrative operations (e.g., accepting invitations where the invitee has no existing membership context yet — intentionally documented).
- Every transaction that accesses tenant tables must call `SET LOCAL app.tenant_id = '<orgId>'` as its first statement. `SET LOCAL` is transaction-scoped and resets automatically when the transaction ends, preventing context leakage across pooled connections.
- `FORCE ROW LEVEL SECURITY` is applied to all tenant tables to prevent table owners from bypassing policies.

---

## Consequences

- All tenant-scoped tables must have RLS policies covering SELECT, INSERT, UPDATE, and DELETE.
- All application queries accessing tenant data must be wrapped in a `prisma.$transaction` block that sets `app.tenant_id` first (see ADR-003).
- Connection pooling must use `SET LOCAL` (not `SET SESSION`) to avoid cross-request context leakage (see ADR-004).
- RLS isolation is verified by integration tests running as the `atlas_app` non-superuser role (see ADR-002).
- New tenant-scoped tables added in future phases must include `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and appropriate RLS policies.
