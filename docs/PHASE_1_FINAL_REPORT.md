# ATLAS — Phase 1 Implementation Report

**Scope:** Phase 1 — Foundation and tenancy only  
**Implementation review:** 2026-11-06  
**Application:** Next.js App Router, strict TypeScript, PostgreSQL, Prisma 7, Auth.js v5

## 1. Phase 1 domain model

The existing application names are retained to avoid a destructive schema rename:

| Brief concept | Existing Prisma model | Meaning |
|---|---|---|
| Tenant | `Organization` | One customer workspace / tenant |
| User | `User` | Global authenticated identity |
| Membership | `OrganizationMember` | User-to-tenant membership and role |
| API key | `ApiKey` | Dedicated, revocable tenant/project key |
| Event | `AnalyticsEvent` | Event associated with a tenant-owned project |
| Event properties | `AnalyticsEvent.properties` (`Json?`) | Flexible JSONB-backed event payload |

`Project` belongs to an `Organization`; `AnalyticsEvent` belongs to a `Project`. The database policies derive the event tenant through the project relationship.

## 2. Implemented Phase 1 work

- Kept strict TypeScript and confirmed `strict: true` and `noUncheckedIndexedAccess: true` are enabled.
- Retained the existing Prisma schema and committed migrations.
- Added a forward-only RLS hardening migration. It prevents an admin from creating/promoting admin or owner memberships, prevents removal/demotion of the canonical owner through direct `atlas_app` SQL, restricts admin invitations to owners, and scopes usage/error-log access.
- Retained transaction-local RLS context using `set_config(..., true)` inside Prisma interactive transactions. Tenant context is set only after membership is verified. This project deliberately uses the explicit `withTenantContext` transaction wrapper rather than an automatic Prisma query extension; ADR-003 documents why an extension cannot reliably set a transaction-local variable in the same transaction as the intercepted query.
- Kept separate runtime, operations, and migration database connections.
- Retained the unfiltered `SELECT * FROM "AnalyticsEvent"` tenant isolation integration test, which asserts that the actual `atlas_app` role sees only the current tenant's event rows.
- Extended write-isolation tests to check that an admin cannot create an owner/admin membership, demote the canonical owner, or remove the canonical owner. The read-isolation test also asserts that `atlas_app` is neither superuser nor `BYPASSRLS`.
- Changed new dedicated API key hashes to salted scrypt using Node's built-in crypto implementation. Legacy SHA-256 project keys remain verifiable only for compatibility.
- Updated ingestion key lookup to use the indexed non-secret key prefix followed by scrypt verification. Legacy key lookup remains supported.
- Changed project creation and key regeneration paths to issue dedicated `ApiKey` rows, revoke prior project keys, and avoid storing newly issued secrets in `Project.apiKeyHash`.
- Added server-side project permission checks and Zod validation for project create/update/delete and project-key regeneration.
- Added Zod validation for invitation/key route identifiers and malformed registration JSON.
- Kept invitation token hashing, expiry, one-time acceptance, and authenticated-email matching.
- Kept active organization selection as an untrusted cookie hint that is verified against the authenticated user's database membership.
- Changed organization switching to use `router.refresh()` instead of a full browser reload.
- Retained all eight ADRs and updated ADR-001, ADR-006, and ADR-007 to match the implemented decisions.

## 3. RLS coverage

The tenant-scoped tables are:

- `Organization`
- `OrganizationMember`
- `Project`
- `AnalyticsEvent`
- `OrganizationUsage`
- `invitations`
- `api_keys`
- `ingestion_idempotency_keys`
- `ingestion_error_logs`

The existing RLS migrations enable and force RLS on these tables. The new migration tightens membership-owner invariants and adds tenant-scoped error-log reads and usage deletes. `User` is intentionally global identity data and is not tenant-scoped.

`ingestion_error_logs` is append-only for `atlas_app`: it has tenant-scoped insert/select policies and intentionally has no update/delete policy.

## 4. Important security design notes

- `app.tenant_id` and `app.user_id` are transaction-local settings. They must never be set with session-persistent `SET` or `set_config(..., false)`.
- Every request path that uses `withTenantContext` verifies the authenticated user's membership before setting `app.tenant_id`.
- The `atlas_app` role must remain non-superuser and `NOBYPASSRLS`; the migration/superuser URL must never be used by normal request handlers.
- `prismaOps` is reserved for cross-tenant system operations that cannot run under an ordinary member tenant context, such as accepting an invitation using its one-time token and resolving an incoming API key. It must not be used for tenant dashboard queries.
- The active-organization cookie is only a preference hint. `getActiveOrganization` always checks membership in PostgreSQL before returning an organization.
- Legacy SHA-256 API key verification is compatibility-only. All newly created dedicated keys use scrypt.

## 5. Required verification before Phase 1 mentor sign-off

The ZIP did not include a usable `.env` file or a live PostgreSQL connection. Dependency installation in the review environment could not complete, so a full Next.js production build and database-backed test run could not be truthfully certified here.

Run these commands in the project environment after configuring the three database URLs and applying migrations:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Run database-backed integration tests with `DATABASE_URL_APP` pointing to the actual non-superuser `atlas_app` connection. Do not point these tests at `postgres`, a table owner, or an account with `BYPASSRLS`.

The critical acceptance test is:

```sql
BEGIN;
SELECT set_config('app.tenant_id', '<tenant-a-id>', true);
SELECT * FROM "AnalyticsEvent";
ROLLBACK;
```

Run it as `atlas_app` after creating test events in Tenant A and Tenant B. It must return only Tenant A rows, with no `WHERE` clause. The automated test in `tests/integration/rls-tenant-isolation.test.ts` performs this check and verifies `current_user = 'atlas_app'`.

## 6. Phase boundary

This report does not claim Phase 2, Phase 3, or Phase 4 completion. Ingestion throughput, idempotency, rate limiting, rollups, five-million-event seeding, dashboard funnels/retention/live SSE, streaming SSR, ops quotas, CSV streaming, and Lighthouse/performance targets remain outside this Phase 1 change set.
