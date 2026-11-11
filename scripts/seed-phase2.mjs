import pg from "pg";

const { Pool } = pg;
const targetEvents = Number.parseInt(process.env.SEED_EVENT_COUNT ?? "5000000", 10);
const connectionString =
  process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Set DATABASE_URL_MIGRATION (migration/admin database role).");
}
if (!Number.isSafeInteger(targetEvents) || targetEvents < 5_000_000) {
  throw new Error("SEED_EVENT_COUNT must be an integer of at least 5,000,000.");
}

const pool = new Pool({
  connectionString,
  max: 2,
  application_name: "atlas-phase2-seed",
});

try {
  const client = await pool.connect();
  try {
    await client.query("SET TIME ZONE 'UTC'");
    await client.query("BEGIN");
    const owner = await client.query(
      'SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1',
    );
    if (!owner.rows[0]) {
      throw new Error("Create at least one owner account before running the seed.");
    }
    const ownerId = owner.rows[0].id;

    for (let tenant = 1; tenant <= 3; tenant += 1) {
      const suffix = String(tenant).padStart(2, "0");
      const organization = await client.query(
        `INSERT INTO "Organization"
          ("id", "name", "slug", "ownerId", "createdAt", "updatedAt", "eventQuota")
         VALUES (gen_random_uuid()::text, $1, $2, $3, NOW(), NOW(), 10000000)
         ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name"
         RETURNING id, "ownerId"`,
        [`ATLAS Seed Tenant ${suffix}`, `atlas-seed-tenant-${suffix}`, ownerId],
      );
      const organizationId = organization.rows[0].id;
      const organizationOwnerId = organization.rows[0].ownerId;

      await client.query(
        `INSERT INTO "OrganizationMember"
          ("id", "userId", "organizationId", "role", "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, 'owner', NOW())
         ON CONFLICT ("userId", "organizationId") DO NOTHING`,
        [organizationOwnerId, organizationId],
      );

      await client.query(
        `INSERT INTO "Project"
          ("id", "name", "slug", "environment", "organizationId", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, 'production', $3, NOW(), NOW())
         ON CONFLICT ("organizationId", "slug") DO NOTHING`,
        [`Seed Project ${suffix}`, `atlas-seed-project-${suffix}`, organizationId],
      );
    }

    await client.query("COMMIT");

    console.log(`Generating ${targetEvents.toLocaleString()} events across 3 tenants...`);
    const startedAt = Date.now();
    const inserted = await client.query(
      `INSERT INTO "AnalyticsEvent"
        ("id", "eventName", "userId", "sessionId", "properties", "pageUrl",
         "country", "device", "browser", "createdAt", "projectId")
       SELECT
         md5(g.n::text || clock_timestamp()::text || random()::text)::uuid::text,
         CASE (g.n % 8)
           WHEN 0 THEN 'page_view'
           WHEN 1 THEN 'button_clicked'
           WHEN 2 THEN 'signup_started'
           WHEN 3 THEN 'signup_completed'
           WHEN 4 THEN 'purchase'
           WHEN 5 THEN 'product_viewed'
           WHEN 6 THEN 'search_performed'
           ELSE 'session_started'
         END,
         'seed-user-' || (g.n % 50000)::text,
         'seed-session-' || (g.n % 100000)::text,
         jsonb_build_object(
           'seeded', true,
           'campaign', 'phase-2-benchmark',
           'value', (g.n % 1000),
           'sequence', g.n
         ),
         CASE (g.n % 5)
           WHEN 0 THEN '/pricing'
           WHEN 1 THEN '/signup'
           WHEN 2 THEN '/dashboard'
           WHEN 3 THEN '/products'
           ELSE '/'
         END,
         (ARRAY['IN','US','GB','DE','CA'])[(g.n % 5) + 1],
         (ARRAY['desktop','mobile','tablet'])[(g.n % 3) + 1],
         (ARRAY['Chrome','Safari','Firefox','Edge'])[(g.n % 4) + 1],
         NOW() - ((g.n % (91 * 24 * 60 * 60)) * INTERVAL '1 second'),
         p.id
       FROM generate_series(1, $1::bigint) AS g(n)
       CROSS JOIN LATERAL (
         SELECT id
         FROM "Project"
         WHERE slug IN ('atlas-seed-project-01','atlas-seed-project-02','atlas-seed-project-03')
         ORDER BY slug
         OFFSET ((g.n - 1) % 3)
         LIMIT 1
       ) p`,
      [targetEvents],
    );

    await client.query('ANALYZE "AnalyticsEvent"');
    console.log(
      `Inserted ${inserted.rowCount?.toLocaleString() ?? targetEvents.toLocaleString()} events in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
