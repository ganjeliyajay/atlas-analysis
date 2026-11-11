# Performance evidence

The benchmark scripts in this directory are reproducible and write their actual results here.

1. Load at least 5,000,000 events with `npm run seed:phase2`.
2. Run the scheduled rollup endpoint.
3. Capture the query plan with `npm run benchmark:dau -- YOUR_ORGANIZATION_ID`. The script writes `90-day-dau-explain.txt`.
4. Run `npm run benchmark:ingest` and retain the JSON output for the 200 events/sec gate.

**Acceptance status:** the project source includes the seed, benchmark, and EXPLAIN capture workflows. The sub-300ms DAU and 200 events/sec gates are not marked as measured in this archive because they require the target PostgreSQL instance and seeded dataset. Commit the generated outputs after running them locally; do not substitute estimated timings.
