# ADR-015: Tenant-Scoped Cache Isolation and Invalidation Strategy

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** Lead Architect, Security Engineer, Frontend Infrastructure Team

## Context
In a multi-tenant analytics SaaS platform, caching is critical for dashboard responsiveness and reducing database load. However, in shared infrastructure, caching introduces the severe risk of cross-tenant data leakage if cache keys are global or ambiguous, as well as cache poisoning or foreign tenant invalidation attacks.

## Problem
If Tenant A's event ingestion triggers cache invalidation on global tags, Tenant B's analytics cache could be invalidated prematurely (cache churn denial of service). Worse, if cache keys omit tenant identifiers, Tenant A could be served cached KPI metrics belonging to Tenant B.

## Options Considered
1. **No Application Caching:** Rely solely on PostgreSQL query execution and rollups.
   - *Pros:* Zero cache leakage risk.
   - *Cons:* Redundant queries for identical dashboard page views.
2. **Global Shared Cache with Generic Keys:** Cache keys formatted as `dashboard:metrics:30d`.
   - *Pros:* Simple.
   - *Cons:* Catastrophic multi-tenant security vulnerability (cross-tenant data leakage).
3. **Strictly Namespaced Tenant Caching with Scoped Tags (Selected):** Every cache entry, key, and revalidation tag is prefixed with the verified tenant identifier (`tenant:{organizationId}:...`).

## Decision
Adopt Option 3.
- Key Invariant: All cache keys must follow the strict format:
  `tenant:<organizationId>:proj:<projectId>:range:<rangeStart>_<rangeEnd>:<metric>`
- Revalidation Tags: Next.js cache tags are strictly tenant-scoped (`tags: [`tenant-${organizationId}`, `org-${organizationId}-rollups`]`).
- Revalidation Boundaries: When new events are ingested for Tenant A, only Tenant A's cache tags are invalidated. Ingestion never touches Tenant B's cache keys.
- HTTP Headers: Sensitive dashboard endpoints return `Cache-Control: private, no-cache, no-store, must-revalidate` to prevent intermediate corporate proxy caches from storing tenant analytics.

## Consequences
- 100% cryptographic and architectural isolation between tenants in all cache layers.
- Ingestion burst in one tenant has zero cache invalidation impact on other tenants.

## Trade-offs
- Cache keys are longer and require passing verified tenant context into cache retrieval layers.

## Testing Strategy
- Code review asserting that no cache key or tag can be instantiated without an authenticated, verified `organizationId`.
- Integration tests ensuring Tenant A API requests never hit or return Tenant B cached results.

