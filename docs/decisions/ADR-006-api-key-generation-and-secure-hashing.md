# ADR-006: API Key Generation and Secure Hashing

**Status:** Accepted  
**Date:** 2026-11-06  
**Deciders:** ATLAS Engineering Team

## Context

ATLAS API keys authenticate server-to-server ingestion. Keys must be generated with a CSPRNG, shown once, stored only as hashes, verifiable on each request, revocable, optionally expiring, and track `lastUsedAt`.

The Phase 1 brief explicitly requires Argon2 or scrypt. The implementation therefore uses Node.js built-in scrypt rather than introducing a native dependency.

## Options considered

### Option A: Argon2id

Argon2id is memory-hard and strong for password-derived secrets. It was not selected because it requires an additional native package and build/runtime compatibility work in this project.

### Option B: Salted scrypt — selected

Generate 32 random bytes (256 bits) with `crypto.randomBytes(32)`. The plaintext key is `atlas_live_<64 hex characters>`. Hash it with `crypto.scryptSync`, a random 16-byte salt, and a 64-byte derived key.

Stored format:

```text
scrypt$<32-character salt hex>$<128-character derived-key hex>
```

Each hash uses a unique salt. `crypto.timingSafeEqual` compares derived-key buffers.

Because salted scrypt is non-deterministic, ingestion looks up candidate keys by the indexed, non-secret first 23 characters (`keyPrefix`) and verifies each candidate with scrypt. The prefix is only a lookup hint and is never accepted as authentication.

### Option C: SHA-256

SHA-256 is deterministic and fast, but it does not satisfy the explicit Phase 1 hashing requirement. It remains supported only for legacy `Project.apiKeyHash` values already issued before this change. New dedicated keys never use SHA-256.

## Decision

Use salted scrypt for all new dedicated `ApiKey` records. Preserve legacy SHA-256 verification only for backwards compatibility. New project creation and key regeneration issue dedicated `ApiKey` records.

## Implementation

Implementation is in [`lib/api-keys.ts`](../../lib/api-keys.ts). The raw key is returned once by the create/regenerate endpoint. Only the scrypt encoding, key prefix, expiry, revocation, and last-use metadata are stored.

| Field | Purpose |
|---|---|
| `keyHash` | Salted scrypt encoding; unique index |
| `keyPrefix` | First 23 characters; indexed candidate lookup only |
| `expiresAt` | Optional expiration |
| `revokedAt` | Explicit revocation timestamp |
| `lastUsedAt` | Updated after successful authentication |

## Security properties

| Property | Mechanism |
|---|---|
| Unguessable | 256-bit CSPRNG secret |
| At-rest protection | Salted scrypt hash; plaintext is not stored |
| Timing resistance | `crypto.timingSafeEqual` |
| One-time reveal | Raw key returned only in creation/regeneration response |
| Revocation | `revokedAt` checked before accepting a key |
| Expiration | `expiresAt` checked before accepting a key |
| Last-used tracking | Updated after successful authentication |

## Trade-offs and limitations

Scrypt adds CPU cost to ingestion authentication. The indexed prefix narrows candidate records before the expensive verification step. Prefix collisions are handled by verifying every matching candidate. A future key-format version can change scrypt parameters without invalidating the parser for existing records.

Legacy SHA-256 project keys remain accepted until they are rotated or retired. This compatibility path must not be used for new key issuance.

## Tests

`tests/unit/api-keys.test.ts` covers random key generation, salted hash uniqueness, successful and failed verification, legacy verification, and malformed stored hashes. `tests/integration/api-keys.test.ts` verifies persistence, one-time response disclosure, role permissions, expiration, and revocation.
