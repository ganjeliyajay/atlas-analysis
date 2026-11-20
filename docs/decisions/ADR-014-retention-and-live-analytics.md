# ADR-014: Cohort Retention Heatmap Calculations and Server-Sent Events (SSE) Live Feed

- **Status:** Accepted
- **Date:** 2026-11-06 (Updated 2026-11-12)
- **Deciders:** Lead Architect, Frontend & Analytics Team

## Context
User retention cohorts reveal whether a product's user base returns over subsequent weeks (Week 0 to Week N). Live event monitoring requires near-real-time streaming of new product events without client-driven polling loops that hammer database servers.

## Problem
Cohort analysis requires linking a user's initial signup week to all their subsequent weekly activity, which can result in massive Cartesian products. For live event feeds, short polling (e.g. `setInterval(fetch, 1000)`) creates severe connection churn, high CPU overhead, and connection pool starvation.

## Options Considered
1. **Client Polling:** Frontend polls every 2 seconds for live events.
   - *Pros:* Simple HTTP requests.
   - *Cons:* Wasteful requests when idle; latency lag; connection exhaustion.
2. **WebSocket Gateway:** Full-duplex WebSocket server.
   - *Pros:* Bi-directional messaging.
   - *Cons:* Overhead of bi-directional connection management, stateful connection servers, firewall/proxy issues.
3. **PostgreSQL Monday Cohorts & Server-Sent Events (SSE) with Composite Cursor (Selected):**

## Decision
Adopt Option 3.

### Cohort Retention Architecture
- Weekly Cohorts: Cohorts are grouped by UTC Monday (`DATE_TRUNC('week', ...)`).
- Week 0 Invariant: Every cohort begins with Week 0 retention of exactly 100% (the total unique users who registered/started in that week).
- Subsequent Periods: Week $K$ retention represents the percentage of Week 0 users who performed at least one event during $[K \times 7\text{ days}, (K+1) \times 7\text{ days})$ relative to the cohort start.
- Incomplete Periods: Periods in the future are returned as `null` rather than `0%` to prevent deceptive visualization.

### Server-Sent Events Architecture
- Protocol: HTTP/1.1 or HTTP/2 `text/event-stream` with `Cache-Control: no-cache, no-transform`.
- Authorization: Authenticated via Auth.js session; tenant context is enforced for every query chunk.
- Composite Cursor: The stream tracks `{ createdAt, id }` to eliminate duplicate or dropped events during high-volume bursts sharing identical timestamps.
- Heartbeats: Emits `: keepalive\n\n` comments every 3 seconds during idle periods to prevent intermediate proxies, firewalls, and load balancers from terminating quiet connections.
- Lifecycle & Cleanup: Listens to `request.signal.addEventListener('abort', ...)` to immediately terminate database polling and close server streams when the browser tab closes.

## Consequences
- Retention heatmap calculations run via indexed joins in $< 100\text{ms}$.
- Live streaming uses lightweight unidirectional HTTP streams with automatic browser reconnection support via standard `EventSource`.

## Trade-offs
- HTTP/1.1 connections in older browsers may have a 6-connection per host limit; modern HTTP/2 multiplexing removes this limit.

## Testing Strategy
- Unit tests in `lib/analytics/retention-utils.test.ts` testing Monday cohort grouping, weighted retention calculation, and incomplete period null values.
- SSE route verification via curl and integration testing in `scripts/test-e2e.mjs`.


### Live SSE Deployment Boundary

The current `LiveEventHub` is process-local. It is suitable for a single application instance; horizontally scaled or serverless deployments require a shared broker or PostgreSQL `LISTEN/NOTIFY` adapter for cross-instance fan-out. Database cursor replay covers reconnect gaps within the retained event history, but does not replace distributed pub/sub.
