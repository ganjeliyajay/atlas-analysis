# ATLAS — Security Architecture & Threat Model

**Classification:** Multi-Tenant SaaS Security Standard  
**Revision:** 2026-11-12

---

## 1. Multi-Tenant Threat Model

ATLAS operates as a shared-infrastructure multi-tenant SaaS application where multiple customer organizations co-exist within the same PostgreSQL cluster. The primary security objectives are:

1. **Strict Data Confidentiality:** Tenant A must never be able to read Tenant B's data under any circumstance, even if application logic suffers an injection or IDOR bug.
2. **Write Isolation:** Tenant A must never insert, mutate, or delete records in Tenant B's namespace.
3. **Privilege Separation:** Ordinary tenant members (`owner`, `admin`, `viewer`) must never gain access to platform operations or foreign organizations.
4. **Denial of Service Resistance:** Ingestion abuse or runaway batch traffic from one tenant must not degrade service or exhaust database connections for other tenants.

---

## 2. PostgreSQL Row-Level Security (RLS)

Application-level `WHERE organizationId = ...` filtering is inherently fragile and vulnerable to developer oversight. ATLAS enforces **defense-in-depth Row-Level Security** directly in PostgreSQL:

### A. RLS Invariant
- Every tenant-scoped table has RLS explicitly enabled and forced:
  - `Organization`
  - `OrganizationMember`
  - `Project`
  - `AnalyticsEvent`
  - `OrganizationUsage`
  - `invitations`
  - `api_keys`
  - `ingestion_idempotency_keys`
  - `ingestion_error_logs`
  - `ingestion_token_buckets`
  - `event_hourly_rollups`
  - `event_daily_rollups`

### B. Application Role Restrictions
- Normal web traffic connects using `DATABASE_URL_APP` under the `atlas_app` role.
- Invariants enforced by database migrations:
  - `atlas_app` has `NOSUPERUSER` and `NOBYPASSRLS`.
  - Direct execution of `SELECT * FROM "AnalyticsEvent"` without a WHERE clause returns **only** the active tenant's rows. If no tenant context is set, it returns **0 rows**.

### C. Transaction-Local Tenant Context
- Setting session variables via `SET app.tenant_id = '...'` or `set_config(..., false)` is **prohibited** because pooled connections in transaction pooling (PgBouncer) will bleed the context to subsequent requests.
- ATLAS mandates:
  ```sql
  SELECT set_config('app.tenant_id', :organizationId, true);
  ```
  The third argument `true` ensures that the tenant context is strictly **transaction-local** and resets automatically upon `COMMIT` or `ROLLBACK`.

---

## 3. Authentication & Access Control (RBAC)

- **Session Authentication:** Auth.js v5 with AES-encrypted, HTTP-only, secure, SameSite cookies.
- **Organization Cookie Safety:** The active organization cookie (`atlas_active_org_id`) is treated as an **untrusted preference hint**. Before executing queries, `getActiveOrganization()` verifies the user's active membership in PostgreSQL.
- **Roles:**
  - `owner`: Full organization management, project deletion, API key regeneration, ownership transfer.
  - `admin`: Member invitations (viewer/admin), project creation, settings. Cannot demote or remove the canonical owner.
  - `viewer`: Read-only access to analytics dashboards, funnels, retention, and live event feeds.
  - `superadmin`: Dedicated global role restricted to staff for `/ops` console access. Ordinary tenant owners cannot access ops routes.

---

## 4. API Key Storage & Verification

- Plaintext API keys (`atlas_live_...`) are shown to users **exactly once** upon creation.
- Keys are never stored in plaintext.
- **Hashing Algorithm:** Salted **scrypt** using Node.js crypto:
  - N = 16384, r = 8, p = 1 (OWASP recommended parameters).
- **Prefix Indexing:** The first 23 characters (`keyPrefix`) are stored as an indexed column for $O(1)$ candidate retrieval.
- **Constant-Time Verification:** Candidates are verified against the salted scrypt hash using `crypto.timingSafeEqual` to eliminate timing side-channel attacks.

---

## 5. Defense Against Common Vulnerabilities

| Threat | ATLAS Countermeasure |
|---|---|
| **SQL Injection** | Zero string interpolation in SQL queries. All database access uses Prisma parameterized queries or tagged template literals (`tx.$queryRaw\`...\``). |
| **Insecure Direct Object Reference (IDOR)** | RLS enforces tenant ownership at the database engine level. Querying a foreign project ID returns 0 rows / 404 regardless of URL parameters. |
| **Spreadsheet Formula Injection (CSV)** | The streaming CSV export prepends a single quote (`'`) to any cell value starting with `=`, `+`, `-`, or `@`, neutralizing Excel/Sheets command execution. |
| **Cross-Site Scripting (XSS)** | React Server Components sanitize dynamic values. `next.config.ts` enforces `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`. |
| **Credential Leakage in Logs** | `lib/logger.ts` recursively inspects and redacts sensitive keys (`password`, `token`, `secret`, `authorization`, `apiKey`, `cookie`). |
| **Denial of Service / Connection Starvation** | Token-bucket rate limiter restricts ingestion to 10,000 capacity per key with 200/s refill, returning 429 before database exhaustion. |

