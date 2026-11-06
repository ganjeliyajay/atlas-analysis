# ADR-007: Organization Roles and Authorization (RBAC)

**Status:** Accepted  
**Date:** 2026-11-05  
**Deciders:** ATLAS Engineering Team

---

## Context

ATLAS supports multiple members per organization, each with a role that determines what actions they may perform. Without centralized role-based access control, the Phase 1 baseline allowed any authenticated user (including `viewer` role) to call any mutating endpoint (create project, generate API keys, delete members) — a critical privilege escalation vulnerability.

We need an authorization model that is:
- **Correct:** Enforced server-side on every mutating request.
- **Auditable:** Easy for security reviewers to understand and verify.
- **Maintainable:** New actions can be added without touching each route handler.
- **Safe from lockout:** The last organization owner cannot remove themselves.

---

## Decision Drivers

- The brief's primary roles are `owner`, `admin`, and `viewer`. The existing `member` value is retained as a compatibility role for pre-existing memberships and is read-only for analytics; it cannot create projects, manage keys, or administer members.
- Authorization must be enforced at the **server-action / route-handler layer** — not in the UI alone.
- A single source of truth for "which role can do what" is preferable to ad-hoc permission checks scattered across routes.
- The system must prevent organizational orphaning: removing the sole owner must be blocked.

---

## Considered Options

### Option A: Access Control List (ACL) per Resource
Assign individual permissions per user per resource (e.g., user X has `project:write` on project Y).

**Rejected:**
- Excessive complexity for Phase 1 — no use case requires resource-level granularity yet.
- UI and backend must both maintain and display per-resource ACLs.
- Significantly harder to audit.

### Option B: Feature Flags
Use a feature-flag system to enable/disable actions per user.

**Rejected:**
- Feature flags are designed for gradual rollout, not security authorization.
- Not a recognized authorization primitive; would be confusing to maintain.

### Option C: Centralized RBAC Matrix in `lib/permissions.ts` ✅ (Chosen)
Define a constant `ROLE_PERMISSIONS` map that lists every allowed action per role. Export `hasPermission(role, action)` and `requireOrgPermission(userId, orgId, action)` as the single enforcement interface.

---

## Decision

**Option C — Three-role RBAC (owner / admin / viewer) with a centralized permissions matrix in `lib/permissions.ts`.**

---

## Implementation

Located in [`lib/permissions.ts`](../../lib/permissions.ts):

### Roles

| Role | Description |
|------|-------------|
| `owner` | Full control including org deletion and all member management |
| `admin` | Full operational control; cannot delete the organization |
| `viewer` | Read-only access to analytics and settings |

### Permissions Matrix

| Action | owner | admin | viewer |
|--------|-------|-------|--------|
| `org:update` | ✅ | ✅ | ❌ |
| `org:delete` | ✅ | ❌ | ❌ |
| `member:invite` | ✅ | ✅ | ❌ |
| `member:remove` | ✅ | ✅ | ❌ |
| `member:update_role` | ✅ | ✅ | ❌ |
| `project:create` | ✅ | ✅ | ❌ |
| `project:update` | ✅ | ✅ | ❌ |
| `project:delete` | ✅ | ✅ | ❌ |
| `api_key:create` | ✅ | ✅ | ❌ |
| `api_key:revoke` | ✅ | ✅ | ❌ |
| `analytics:read` | ✅ | ✅ | ✅ |
| `settings:read` | ✅ | ✅ | ✅ |

### Core Functions

```typescript
// Synchronous: check if a role has permission for an action
export function hasPermission(role: OrgRole | string, action: OrgAction): boolean

// Async: look up the calling user's role in the DB, check permission, return result or error
export async function requireOrgPermission(
  userId: string,
  organizationId: string,
  action: OrgAction
): Promise<{ allowed: boolean; role?: OrgRole; error?: string }>

// Async: prevent last-owner self-removal
export async function isSoleOwner(userId: string, organizationId: string): Promise<boolean>
```

### Usage in Route Handlers

```typescript
// In an API route handler (e.g., POST /api/projects):
const { allowed, error } = await requireOrgPermission(
  session.user.id,
  orgId,
  "project:create"
);

if (!allowed) {
  return NextResponse.json({ error }, { status: 403 });
}
// Proceed with project creation...
```

### Last-Owner Protection

`isSoleOwner(userId, orgId)` returns `true` if the given user is the only remaining member with the `owner` role in the organization. Route handlers for member removal and role demotion call this check before making changes:

```typescript
// Before removing a member or demoting a role:
if (await isSoleOwner(targetUserId, orgId)) {
  return NextResponse.json(
    { error: "Cannot remove or demote the sole owner of an organization." },
    { status: 409 }
  );
}
```

This prevents organizational orphaning — a state where no user can manage the organization.

---

## Trade-offs

| Trade-off | Decision |
|-----------|----------|
| Coarse-grained (role-level, not resource-level) | Acceptable for Phase 1; resource-level ACLs can be added in Phase 2 if needed |
| No attribute-based conditions (ABAC) | Not required for current feature set |
| `requireOrgPermission` makes a DB call | Necessary to fetch current role; can be cached per request in Phase 2 |
| TypeScript `OrgAction` union type | Prevents typos in action strings at compile time |

---

## Security Properties

- `requireOrgPermission` is the **single gated entry point** for all authorization decisions — no route handler performs its own ad-hoc role check.
- `getMemberRole` reads from the database on every call — no stale cached role can be exploited.
- Role strings are lowercased before lookup to prevent case-sensitivity bypass (`"OWNER"` vs `"owner"`).
- `isSoleOwner` prevents the TOCTOU race condition for self-removal by counting owners at the time of the removal request.

---

## Testing

`tests/unit/permissions.test.ts` validates:
- Every role-action combination in the matrix returns the correct `hasPermission` result.
- `requireOrgPermission` returns `allowed: false` with an error message for non-members.
- `requireOrgPermission` returns `allowed: false` with the role for under-privileged members.
- `isSoleOwner` correctly identifies the last owner.

---

## Consequences

- All existing and future route handlers that perform write operations **must** call `requireOrgPermission` before proceeding.
- Adding a new action requires: (1) adding it to the `OrgAction` union type, (2) adding it to the `ROLE_PERMISSIONS` map for the appropriate roles, (3) calling `requireOrgPermission` in the relevant route handler.
- UI-level permission hints (hiding buttons for unauthorized actions) should use the same `hasPermission` function with the user's current role — but server-side enforcement is authoritative.


## Database-level role assignment constraints

The application permission matrix is backed by RLS policies. An admin may invite/assign `viewer` and the compatibility `member` role, but only the canonical organization owner may issue an `admin` invitation or assign an `admin` membership. No direct `atlas_app` SQL path can create a second `owner` membership. Ownership changes must use the audited `transfer_organization_ownership` security-definer function, which updates the canonical `Organization.ownerId` and membership roles atomically.
