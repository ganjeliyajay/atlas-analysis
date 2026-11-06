> **Historical baseline:** This document records the pre-hardening audit from November 5, 2026. It is not the current completion status. See [`PHASE_1_FINAL_REPORT.md`](./PHASE_1_FINAL_REPORT.md) for the current Phase 1 implementation, changes, and verification limits.

# ATLAS Analytics — Phase 1 Baseline Implementation Audit

**Audit Date:** November 5, 2026  
**Auditor:** Senior Software Architect, PostgreSQL Security Engineer, Next.js & Prisma Engineer  
**Project:** ATLAS — Multi-Tenant Product Analytics  
**Scope:** Phase 1 — Foundation & Tenancy

---

## 1. Executive Summary

This baseline audit evaluates the existing codebase of **ATLAS Analytics** against the Phase 1 Foundation & Tenancy specification. The application has implemented substantial frontend interfaces, basic NextAuth credential authentication, basic project creation, and event ingestion. Furthermore, an initial PostgreSQL Row-Level Security (RLS) migration was created on November 4, 2026.

However, several critical architectural, security, and functional gaps prevent Phase 1 from being fully compliant:
1. **RLS Policy Coverage Incomplete:** While `ENABLE` and `FORCE ROW LEVEL SECURITY` are present on existing tables, `OrganizationMember` lacks policies for adding invited members or modifying memberships. `Organization` lacks `UPDATE` and `DELETE` policies for owners. `AnalyticsEvent` lacks `UPDATE`/`DELETE` tenant policies.
2. **Missing Invitation System:** No `Invitation` model exists in the database schema, no invitation creation/acceptance endpoints exist, and no email delivery abstraction is implemented.
3. **No Active Organization Switching:** The backend hardcodes `findFirst({ orderBy: { createdAt: "asc" } })` for determining the user's organization. A user belonging to multiple organizations has no way to switch active tenants, creating critical IDOR risks if relying on unverified client state.
4. **Lack of Centralized Role-Based Access Control (RBAC):** Roles (`owner`, `admin`, `viewer`) exist only as loose strings without server-side permission gating. A `viewer` can currently invoke project creation and key generation endpoints.
5. **No Dedicated ApiKey Model:** API keys are tied directly to `Project.apiKeyHash` using SHA-256. There is no dedicated `ApiKey` entity supporting key naming, granular permissions, expiration, explicit revocation timestamp, and last-used tracking.
6. **TypeScript Strictness Incomplete:** `"noUncheckedIndexedAccess": true` is not enabled in `tsconfig.json`.
7. **No Real RLS Isolation Proof Test Suite:** No integration tests exist proving that `atlas_app` cannot read cross-tenant data without WHERE clauses or during concurrent requests.
8. **Missing Architectural Documentation:** The required ADRs (ADR-001 through ADR-008) have not yet been authored.

---

## 2. Existing Architecture & Implementation Review

### 2.1 Technology Stack & Versions
- **Framework:** Next.js 16.4.3 (App Router with Webpack)
- **Runtime:** React 19.3.0
- **Language:** TypeScript 5.x (strict enabled, `noUncheckedIndexedAccess` disabled)
- **ORM:** Prisma 7.10.1 with `@prisma/adapter-pg`
- **Database:** PostgreSQL (with Row-Level Security and two distinct database roles: `postgres` and `atlas_app`)
- **Authentication:** NextAuth.js v5.0.0-beta.32 (JWT strategy)
- **Styling:** Tailwind CSS v4

### 2.2 Database Roles & Connection Architecture
- `postgres`: Superuser with `BYPASSRLS` used solely for schema migrations (`DATABASE_URL_MIGRATION`).
- `atlas_app`: Non-superuser, non-BYPASSRLS role with `FORCE ROW LEVEL SECURITY` enforced across tenant tables (`DATABASE_URL_APP`).
- `prismaOps`: Internal admin client utilizing `DATABASE_URL_OPS`.

### 2.3 Current Prisma Schema Entities
- `User`: Email, password hash (bcrypt), name.
- `Organization`: Name, slug, ownerId, eventQuota.
- `OrganizationMember`: userId, organizationId, role (`owner` default).
- `OrganizationUsage`: organizationId, periodStart, eventCount.
- `Project`: organizationId, name, slug, websiteUrl, apiKeyHash, apiKeyPrefix.
- `AnalyticsEvent`: projectId, eventName, userId, sessionId, properties (JSON), device, browser, country.
- `IngestionIdempotencyKey`: projectId, key, payloadHash, response, expiresAt.
- `IngestionErrorLog`: projectId, errorCode, statusCode, endpoint.

---

## 3. Gap Analysis Against Phase 1 Master Prompt

| Requirement Area | Current Status | Deficiencies & Risks Identified | Required Action |
| :--- | :--- | :--- | :--- |
| **RLS Tenant Isolation** | PARTIAL | `OrganizationMember` insert policy only allows initial owner during registration. No policy for accepting invitations. Missing UPDATE/DELETE on `AnalyticsEvent`. | Add comprehensive policies for all operations; ensure transaction-local session variables. |
| **RLS Isolation Proof Tests** | MISSING | No integration test connects via `atlas_app` to verify `SELECT * FROM "AnalyticsEvent"` returns zero foreign rows. | Create `tests/integration/rls-tenant-isolation.test.ts`. |
| **Connection Pooling & Safety** | PARTIAL | `withTenantContext` uses `tx.$queryRaw` with `set_config(..., true)`, which is correct for transactions, but lacked strong typing for queries escaping context. | Audit all database callers; document PgBouncer transaction-mode guarantees. |
| **Organization Invitations** | NOT IMPLEMENTED | No `Invitation` table. No token generation/hashing. No invitation API routes. | Create `Invitation` model, migration, crypto token generation, Zod validation, and acceptance flow. |
| **Active Organization Switching** | NOT IMPLEMENTED | `getCurrentOrganization()` picks first org by date. UI displays static dropdown or single org. | Implement server-verified active org context, `/api/organization/switch`, `/api/organization/list`, and cookie-hint fallback. |
| **Role-Based Access Control** | NOT IMPLEMENTED | No centralized permissions definition. No check preventing viewers from writing to projects or generating keys. | Create `lib/permissions.ts`, enforce on all mutate endpoints; add final-owner protection. |
| **Dedicated API Key Lifecycle** | PARTIAL (Legacy) | `Project.apiKeyHash` exists, but no dedicated `ApiKey` model with expiration, revocation timestamp, and last-used tracking. | Create `ApiKey` model; support one-time plaintext reveal; update ingestion to verify `ApiKey` first with legacy fallback. |
| **TypeScript Hardening** | PARTIAL | `"noUncheckedIndexedAccess": true` missing in `tsconfig.json`. | Enable `"noUncheckedIndexedAccess": true`; fix all indexing edge-cases. |
| **ADR Documentation** | NOT IMPLEMENTED | `docs/decisions/` does not exist. | Author ADR-001 through ADR-008. |

---

## 4. Security Risk Assessment

1. **IDOR via Organization Context:** Currently, if a route accepts an `organizationId` from client parameters or cookies without validating `OrganizationMember` against the authenticated session, cross-tenant data could be manipulated.
2. **Viewer Privilege Escalation:** Because route handlers check only `session.user.id` and not `membership.role`, any user with `viewer` role can create/delete projects or regenerate ingestion keys.
3. **Unprotected API Key Generation:** API keys generated via project routes are displayed without full lifecycle management (no expiration date, no manual revocation timestamp).
4. **Member Removal Lockout:** Without final owner protection, an organization owner could remove themselves or be demoted, leaving an orphaned tenant organization.

---

## 5. Phase 1 Implementation Plan

1. **Stage 2 — RLS & Database Security:**
   - Update Prisma schema with `Invitation` and `ApiKey` models.
   - Generate safe, non-destructive migration.
   - Implement PostgreSQL RLS policies covering all operations on `Organization`, `OrganizationMember`, `Project`, `AnalyticsEvent`, `ApiKey`, and `Invitation`.
   - Write and execute `tests/integration/rls-tenant-isolation.test.ts` connecting with `atlas_app`.

2. **Stage 3 — Organization Management & Invitations:**
   - Build `Invitation` cryptographic token generation & SHA-256 hash storage.
   - Build `/api/organization/invitations` (list, create, revoke, resend, accept).
   - Build development email delivery abstraction (`lib/email.ts`).
   - Implement active organization switching with server-side membership verification (`/api/organization/switch`, `/api/organization/list`).

3. **Stage 4 — Role-Based Access Control (RBAC):**
   - Create centralized RBAC matrix in `lib/permissions.ts`.
   - Enforce server-side checks across all routes (`requireOrgPermission`).
   - Add final owner demotion/removal protection.

4. **Stage 5 — Dedicated API Key Management:**
   - Create dedicated API key issuance (`atlas_live_<secret>`), secure hashing, expiration, and revocation.
   - Implement `/api/keys`, `/api/keys/[id]`, `/api/keys/[id]/revoke`.
   - Update event ingestion to support `ApiKey` verification with `lastUsedAt` updating and seamless legacy fallback.
   - Connect dashboard API Keys page to real database endpoints.

5. **Stage 6 — TypeScript & Zod Hardening:**
   - Enable `"noUncheckedIndexedAccess": true` in `tsconfig.json`.
   - Audit and strictly type all routes and server functions.

6. **Stage 7 — Testing & Verification:**
   - Unit tests for RBAC and invitation tokens.
   - Integration tests for RLS isolation, API key lifecycle, and organization switching.
   - Verify E2E suite passes 100%.

7. **Stage 8 — Architecture Decision Records:**
   - Author ADR-001 through ADR-008 in `docs/decisions/`.

8. **Stage 9 — Final Acceptance & Report:**
   - Compile `docs/PHASE_1_FINAL_REPORT.md` with complete evidence.

