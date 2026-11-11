# ADR-009: Event ingestion and batch writes

- **Status:** Accepted
- **Date:** 2026-11-06

## Context
The public ingestion endpoint must accept one event or a batch of up to 500, authenticate an API key, validate the payload before database writes, and return quickly without opening one database operation per event.

## Decision
The endpoint normalizes a single event, an array, or `{ "events": [...] }` into one Zod-validated batch. It authenticates the SHA-256 API-key digest, resolves the project and organization using the operations connection, and writes the batch with Prisma `createMany` inside one tenant-context transaction. Quota reservation and idempotency reservation share that transaction. The endpoint responds with HTTP 202 only after the transaction commits.

## Trade-offs
`createMany` is preferred over per-event inserts to reduce round trips. It does not return individual event rows, which is acceptable because ingestion only needs the accepted count. The API key lookup uses the ops connection because the public caller has no authenticated user session; all event writes still run with transaction-local `app.tenant_id`.
