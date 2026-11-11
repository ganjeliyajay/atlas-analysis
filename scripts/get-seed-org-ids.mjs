
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_MIGRATION,
});

try {
  const result = await pool.query(`
    SELECT id, name, slug
    FROM "Organization"
    WHERE slug IN (
      'atlas-seed-tenant-01',
      'atlas-seed-tenant-02',
      'atlas-seed-tenant-03'
    )
    ORDER BY slug
  `);

  console.log("\n===== SEEDED ORGANIZATION IDS =====");

  for (const org of result.rows) {
    console.log(`${org.slug}: ${org.id}`);
  }

  console.log("===================================\n");
} finally {
  await pool.end();
}
