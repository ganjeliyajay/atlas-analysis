# ATLAS Phase 2 — Ingestion and aggregation runbook

## Environment

- `DATABASE_URL_APP`: tenant-scoped application role (`atlas_app`).
- `DATABASE_URL_OPS`: restricted operational connection used for API-key resolution and scheduled rollups.
- `DATABASE_URL_MIGRATION`: schema-owner connection for migrations and benchmark seeding.
- `CRON_SECRET`: long random secret used by the scheduled rollup endpoint.
- `ATLAS_API_KEY`: a valid ingestion key for the local benchmark.

Never expose any of these values to the browser or commit `.env` files.

## Apply migrations and generate Prisma client

```bash
npm run db:deploy
npm run db:generate
```

Restart the application after deployment so new `atlas_app` connections pick up the UTC role setting.

## Seed at least five million events across three tenants

Create at least one owner account first, then run:

```bash
npm run seed:phase2
```

The script creates three dedicated seed organizations/projects and inserts 5,000,000 events spanning the previous 91 days. Override only to increase the dataset with `SEED_EVENT_COUNT`; values below five million are rejected. It uses `DATABASE_URL_MIGRATION` and should be run only against a development/benchmark database.

## Run the rollup job

Schedule `POST /api/cron/rollups` daily (and hourly if hourly charts are needed) with:

```http
Authorization: Bearer $CRON_SECRET
Content-Type: application/json

{}
```

The job rebuilds an overlapping 72-hour hourly window and 90-day daily window. It is safe to rerun. Configure the scheduler to retry failed requests.

## Verify 24-hour idempotency behavior

With the local application running and `ATLAS_API_KEY` set:

```bash
npm run test:ingest
```

The smoke test sends one event, retries the identical payload with the same idempotency key, then reuses that key with a changed payload. It expects `202`, a duplicate replay with no second insert, and `409` for the changed payload.

## Verify rollup rerun determinism

After the cron endpoint is configured and the rollup tables are populated:

```bash
npm run test:rollups
```

The script runs the job twice and compares checksums of all metric values in both rollup tables. `updatedAt` is intentionally excluded from the checksum.

## Verify ingestion throughput

Set `ATLAS_API_KEY`, then run:

```bash
npm run benchmark:ingest
```

The default workload sends 10,000 events in batches of 100 with 10 concurrent workers. The output reports accepted events/sec; a local run must sustain at least 200 events/sec with no failed batches to satisfy the Phase 2 gate.

## Capture the 90-day DAU query plan

Run the rollup job after seeding, then:

```bash
npm run benchmark:dau -- YOUR_ORGANIZATION_ID
```

The script writes the actual `EXPLAIN (ANALYZE, BUFFERS, WAL)` output to `docs/perf/90-day-dau-explain.txt`. Do not claim the sub-300ms gate until the measured execution time is below 300ms on the seeded dataset.

## Data model and correctness notes

- `AnalyticsEvent` remains the source of truth.
- Rollup buckets are UTC; daily rollups are not tenant-local calendar days.
- The `__all__` rollup row is the correct source for daily active users. Do not sum distinct users across event-name rows.
- Rebuilding uses delete/insert in a single transaction, so reruns do not double count.
- Token bucket capacity is 10,000 events and refills at 200 events/second. One token is consumed per validated event submitted in a batch.
