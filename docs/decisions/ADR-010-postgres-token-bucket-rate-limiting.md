# ADR-010: PostgreSQL Token Bucket Rate Limiting for Multi-Tenant Ingestion

- **Status:** Accepted
- **Date:** 2026-11-06 (Updated 2026-11-12)
- **Deciders:** Lead Architect, Infrastructure & Security Team

## Context
Public ingestion APIs are vulnerable to accidental bursts, DDOS attacks, and runaway script loops from tenants. Rate limiting must enforce fair-share limits per API key and tenant, support burst capacity, refill smoothly over time, and provide standard HTTP 429 semantics with machine-readable headers.

## Problem
In-memory rate limiters (e.g. Node memory maps) fail in clustered and multi-instance serverless deployments because tokens are not shared across workers. Deploying external clusters like Redis introduces additional hosting costs and operational failure modes for small teams.

## Options Considered
1. **Node.js In-Memory Token Bucket:** Local memory state in each web worker.
   - *Pros:* Zero latency.
   - *Cons:* Ineffective across horizontal workers; restart clears state.
2. **Distributed Redis Rate Limiter:** External Redis using Lua scripts for sliding windows.
   - *Pros:* High throughput.
   - *Cons:* Additional paid infrastructure, cross-system failure vulnerability.
3. **PostgreSQL Token Bucket Table (Selected):** `ingestion_token_buckets` table storing `(organizationId, keyHash, tokens, lastRefillAt)` updated atomically via PostgreSQL row locking (`FOR UPDATE`).

## Decision
Adopt Option 3.
- Rate Limit Parameters: Capacity of 10,000 tokens per API key with a continuous refill rate of 200 tokens/second ($12,000\text{ tokens/minute}$).
- Token Consumption: 1 token is consumed per validated event in a batch request (a 100-event batch consumes 100 tokens).
- Refill Logic: Calculated mathematically at transaction time: $\text{new\_tokens} = \min(\text{capacity}, \text{current\_tokens} + \Delta t \times \text{refill\_rate})$.
- Concurrency Safety: Atomic row update prevents double-spending across concurrent parallel connections.
- HTTP Responses: HTTP 429 Too Many Requests returns JSON with `error: "rate_limit_exceeded"` and standard headers:
  - `Retry-After: <seconds>`
  - `X-RateLimit-Limit: 10000`
  - `X-RateLimit-Remaining: <remaining>`
  - `X-RateLimit-Reset: <timestamp>`

## Consequences
- Reliable multi-worker coordination without external infrastructure.
- Row-level lock duration is $< 2\text{ms}$ per request, minimizing contention on high-throughput workloads.

## Trade-offs
- Slight write overhead on PostgreSQL for rate limit tracking. This is mitigated by indexed lookup on `(organizationId, keyHash)`.

## Testing Strategy
- Automated concurrent execution test in `tests/integration/ingestion-token-bucket.test.ts` asserting atomic token deductions across parallel workers without race conditions or negative token counts.
