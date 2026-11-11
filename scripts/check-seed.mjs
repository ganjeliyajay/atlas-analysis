
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_MIGRATION,
});

try {
  const result = await pool.query(`
    SELECT
      o.slug AS tenant,
      COUNT(e.id)::text AS total_events,
      COUNT(DISTINCT e."userId")::text AS unique_users,
      MIN(e."createdAt") AS first_event,
      MAX(e."createdAt") AS last_event
    FROM "AnalyticsEvent" e
    JOIN "Project" p ON p.id = e."projectId"
    JOIN "Organization" o ON o.id = p."organizationId"
    WHERE p.slug IN (
      'atlas-seed-project-01',
      'atlas-seed-project-02',
      'atlas-seed-project-03'
    )
    GROUP BY o.slug
    ORDER BY o.slug
  `);

  console.log("\n===== ATLAS SEED VERIFICATION =====");

  for (const row of result.rows) {
    console.log({
      tenant: row.tenant,
      events: row.total_events,
      uniqueUsers: row.unique_users,
      firstEvent: row.first_event,
      lastEvent: row.last_event,
    });
  }

  const total = result.rows.reduce(
    (sum, row) => sum + BigInt(row.total_events),
    0n,
  );

  console.log("\nTotal seed-project events:", total.toString());
  console.log("Tenants found:", result.rows.length);
  console.log("==================================\n");
} catch (error) {
  console.error("Verification failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
