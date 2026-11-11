import pg from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL_APP;
const organizationId = process.argv[2];

if (!connectionString) {
  throw new Error("Set DATABASE_URL_APP.");
}
if (!organizationId) {
  throw new Error("Usage: npm run benchmark:dau -- <organization-id>");
}

const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(
    "SELECT set_config('app.tenant_id', $1, true)",
    [organizationId],
  );
  await client.query("SET LOCAL TIME ZONE 'UTC'");
  const result = await client.query(
    `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT TEXT)
     SELECT "bucketStart", "uniqueUsers" AS dau
     FROM event_daily_rollups
     WHERE "organizationId" = $1
       AND "eventName" = '__all__'
       AND "bucketStart" >= (CURRENT_DATE - INTERVAL '89 days')::date
       AND "bucketStart" < (CURRENT_DATE + INTERVAL '1 day')::date
     ORDER BY "bucketStart"`,
    [organizationId],
  );
  const output = result.rows.map((row) => row["QUERY PLAN"]).join("\n");
  const report = [
    `Generated at: ${new Date().toISOString()}`,
    `Organization ID: ${organizationId}`,
    "Query: 90-day DAU from daily rollups (UTC)",
    "",
    output,
    "",
  ].join("\n");
  const directory = resolve("docs/perf");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, "90-day-dau-explain.txt");
  await writeFile(path, report, "utf8");
  process.stdout.write(report);
  console.log(`\nSaved ${path}`);
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
