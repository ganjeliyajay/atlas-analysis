# ADR-008: Invitation and Active Organization Management

**Status:** Accepted  
**Date:** 2026-11-05  
**Deciders:** ATLAS Engineering Team

---

## Context

ATLAS must support two related features:

1. **Organization Invitations:** An `owner` or `admin` can invite new users by email. Invitees receive a link with a token; clicking it creates their membership.
2. **Active Organization Switching:** A user may belong to multiple organizations. The UI must track which organization is currently "active" without allowing the cookie value to override server-side membership verification (which would be an Insecure Direct Object Reference / IDOR vulnerability).

---

## Decision Drivers

**Invitations:**
- Token must be unguessable and verifiable without storing plaintext.
- Tokens must expire.
- Invitee may not yet have an account; the accept flow must handle new user registration.
- The accept endpoint cannot use `withTenantContext(orgId)` because the invitee has no membership yet — they have no RLS-visible rows.

**Active Organization:**
- Multi-org users need a way to signal which org they want to work in.
- The server must verify membership regardless of what the client sends — no IDOR via cookie manipulation.
- The UX must remain seamless (no full re-authentication required to switch orgs).

---

## Considered Options for Invitation Tokens

### Option A: Magic Links (Email Contains Full Session)
Generate a short-lived JWT or signed token that grants direct session access, included in the invitation link.

**Rejected:**
- Magic links for invitation acceptance create a conflation between authentication and authorization that is hard to reason about.
- If an email is forwarded, the magic link grants session access to an unintended recipient.
- Revocation requires tracking token state anyway, making magic links no simpler than opaque tokens.

### Option B: Signed JWTs
Create a JWT containing `{ orgId, email, role, exp }` signed with `AUTH_SECRET`. No DB lookup needed to verify.

**Rejected:**
- JWTs cannot be revoked before expiry without maintaining a blocklist (which reintroduces DB lookup).
- An admin who wishes to cancel an invitation cannot do so without a blocklist.
- DB-backed tokens are simpler to manage for a low-frequency operation like invitation accept.

### Option C: Opaque Tokens with DB Lookup ✅ (Chosen)
Generate 48 random bytes (`crypto.randomBytes(48)`) encoded as hex (96 hex chars). Store SHA-256 hash of the token in the DB. Send the plaintext token to the invitee via email URL parameter. On accept, hash the received token and look up the matching `Invitation` record.

---

## Decision for Invitations

**Option C — Opaque 48-byte CSPRNG token (96 hex chars), SHA-256 hash stored in DB, 7-day expiry.**

---

## Decision for Active Organization

**HTTP-only cookie as a "hint" only — server always verifies membership in the database before trusting the value.**

---

## Implementation Details

### Invitation Token Generation

```typescript
// In the invitation creation route:
const tokenPlaintext = crypto.randomBytes(48).toString("hex"); // 384-bit entropy
const tokenHash = crypto.createHash("sha256").update(tokenPlaintext).digest("hex");

await prisma.invitation.create({
  data: {
    organizationId,
    email: inviteeEmail,
    role: assignedRole,
    tokenHash,                              // only the hash is stored
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    invitedById: session.user.id,
    status: "pending",
  },
});

// tokenPlaintext is embedded in the invitation email URL:
// https://app.atlas.io/invitations/accept?token=<tokenPlaintext>
```

### `Invitation` Prisma Model

```prisma
model Invitation {
  id             String   @id @default(uuid())
  organizationId String
  email          String
  role           String   @default("viewer")
  tokenHash      String   @unique       // SHA-256 hash — NEVER the plaintext
  expiresAt      DateTime
  status         String   @default("pending")  // pending | accepted | revoked
  invitedById    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(...)
  invitedBy    User         @relation("InvitedByUser", ...)

  @@index([organizationId])
  @@index([email])
  @@index([status])
  @@map("invitations")
}
```

### Invitation Accept Flow — Why `prismaOps` (Not `withTenantContext`)

The invitation accept endpoint (`POST /api/invitations/accept`) must:
1. Look up the `Invitation` by token hash.
2. Create an `OrganizationMember` record for the invitee.
3. Mark the invitation as `accepted`.

The invitee **does not yet have a membership** in the organization. If we used `withTenantContext(orgId)` with `atlas_app`, the RLS policy on `invitations` (which requires `organizationId = current_setting('app.tenant_id', true)`) would correctly filter out the invitation — but the INSERT into `OrganizationMember` for a new member would also be blocked by the INSERT policy (which requires the member's org to match the tenant context AND be a valid existing member).

**Decision:** The accept endpoint uses `prismaOps` — a Prisma client connected as a privileged `ops` role that can bypass tenant-scoped RLS for this specific administrative operation. This is:
- **Intentional:** Documented here and in inline code comments.
- **Scoped:** Only the accept endpoint uses `prismaOps`; all other invitation management uses `withTenantContext`.
- **Safe:** The token hash lookup provides the authorization gate; `prismaOps` is used only after the token is validated (correct hash, not expired, status = `pending`).

### Active Organization Cookie Design

```typescript
// Cookie name
export const ACTIVE_ORG_COOKIE_NAME = "atlas_active_org_id";

// Written when user switches organization:
cookies().set(ACTIVE_ORG_COOKIE_NAME, selectedOrgId, {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
});

// Read in getCurrentOrganization():
const preferredOrgId = cookieStore.get(ACTIVE_ORG_COOKIE_NAME)?.value;
```

**Cookie-as-hint, server-always-verifies pattern** (in `lib/organization.ts`):

```typescript
export async function getActiveOrganization(
  userId: string,
  preferredOrgId?: string
): Promise<OrganizationContext | null> {
  return withUserContext(userId, async (tx) => {
    // 1. If cookie hint is present, verify membership in DB
    if (preferredOrgId?.trim()) {
      const membership = await tx.organizationMember.findUnique({
        where: { userId_organizationId: { userId, organizationId: preferredOrgId.trim() } },
        include: { organization: true },
      });
      if (membership) return { /* ... */ }; // Cookie was valid — use it
    }

    // 2. Fall back to user's oldest organization (always DB-verified)
    const defaultMembership = await tx.organizationMember.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { organization: true },
    });
    return defaultMembership ? { /* ... */ } : null;
  });
}
```

**Why this prevents IDOR:**
- An attacker who sets the cookie to an `orgId` they are not a member of will fail the `findUnique` lookup (no membership row found).
- The server falls back to the attacker's own organization — they never gain access to the target organization's data.
- Cookie manipulation is silently rejected; no error response that leaks org existence.

---

## Security Summary

| Concern | Mechanism |
|---------|-----------|
| Invitation token unguessability | 48-byte CSPRNG (384-bit entropy) |
| Plaintext token not stored | SHA-256 hash only persisted |
| Token expiry | 7-day `expiresAt`; checked before accept |
| Token revocation | Admin can set `status = "revoked"` |
| Accept endpoint privilege | `prismaOps` intentionally; documented; gated by token validation |
| Active org IDOR | Cookie is hint only; server verifies DB membership on every request |
| Cookie tampering | HTTP-only; `SameSite: lax`; rejected silently if membership lookup fails |

---

## Consequences

- The invitation `tokenHash` column has a unique index — duplicate token hashes are impossible (and if SHA-256 collision occurs — 2^128 resistance — the insertion will fail safely).
- Invitation `status` transitions are: `pending → accepted` or `pending → revoked`.
- Resending an invitation generates a new token (old token hash is replaced), invalidating any previously sent link.
- `prismaOps` usage is restricted to the accept endpoint and other documented privileged operations. Its usage must be reviewed in any new code.
- RLS integration tests (Test 11) confirm that `invitations` are tenant-isolated: Tenant A cannot see Tenant B's invitations via the `atlas_app` role.
