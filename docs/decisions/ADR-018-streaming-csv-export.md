# ADR-018: High-Volume Streaming CSV Analytics Export Architecture

- **Status:** Accepted
- **Date:** 2026-11-12
- **Deciders:** Lead Architect, Security & Performance Engineer

## Context
Tenants need to export raw event telemetry and analytics reports to CSV for offline analysis, regulatory auditing, and data warehousing. Export requests may encompass tens of thousands of rows with arbitrary custom properties and timestamps.

## Problem
Buffering an entire export dataset (e.g. 50,000 events) into an in-memory array and converting it to a single large string via `.join("\r\n")` consumes substantial Node.js heap memory ($> 150\text{MB}$ per export request). Under concurrent exports, this triggers garbage collection thrashing or Out-Of-Memory (OOM) worker process crashes. Furthermore, unescaped CSV values introduce CSV injection vulnerabilities (Formula Injection / DDE).

## Options Considered
1. **Full Memory Buffering:** Query all rows via `findMany({ take: 50000 })`, concatenate to string, and return `new Response(csv)`.
   - *Pros:* Simple implementation.
   - *Cons:* High memory spikes, high TTFB (browser waits for all rows before download begins), OOM crash risk.
2. **Asynchronous Background Worker with Email Link:** Write CSV to disk or cloud object storage and email link to user.
   - *Pros:* Offloads web server.
   - *Cons:* Heavy architecture requiring S3/storage buckets, email provider, and background worker queues.
3. **Synchronous HTTP Streaming with Chunked Cursor Pagination (Selected):** Stream chunks immediately using `ReadableStream` with a fixed batch size (1,000 records) and keyset cursor pagination.

## Decision
Adopt Option 3.
- Streaming Response: `GET /api/analytics/events/export` immediately returns a `ReadableStream` with HTTP status 200, `Transfer-Encoding: chunked`, and `Content-Type: text/csv; charset=utf-8`.
- Keyset Cursor Pagination: Database queries retrieve records in batches of 1,000 using cursor `{ createdAt, id }` under the verified tenant context.
- Constant Heap Memory: Node.js memory footprint remains bounded at $O(1)$ ($\sim 2\text{MB}$ buffer) regardless of total exported records.
- Immediate Download Initiation: Browser begins downloading the file within milliseconds without waiting for the full dataset to serialize.
- CSV Injection Sanitization: Every field value starting with formula trigger characters (`=`, `+`, `-`, `@`) is prepended with a single quote (`'`) to disable formula execution in spreadsheet applications (Microsoft Excel, Google Sheets, LibreOffice).
- Filename Sanitization: Generated filenames are strictly sanitized to alphanumeric characters, preventing directory traversal or header injection:
  `atlas-events-<tenantSlug>-<YYYY-MM-DD>.csv`

## Consequences
- Constant, predictable memory usage during large export operations.
- Direct protection against spreadsheet formula injection attacks.

## Trade-offs
- The HTTP connection must remain open during streaming; client aborts cleanly terminate the underlying database cursor via stream controller cancellation.

## Testing Strategy
- Unit tests verifying CSV escaping and formula injection neutralization.
- End-to-end integration test in `scripts/test-e2e.mjs` verifying HTTP 200, valid CSV headers, and stream delivery without memory errors.

