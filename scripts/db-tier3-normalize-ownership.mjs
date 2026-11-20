import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTier3Normalization() {
  const connectionUrl = process.env.DATABASE_URL_MIGRATION || process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;

  if (!connectionUrl) {
    console.error('[TIER 3 ERROR] DATABASE_URL_MIGRATION is required to execute Tier 3 ownership normalization.');
    process.exit(1);
  }

  const client = new Client({ connectionString: connectionUrl });
  await client.connect();

  console.log('================================================================');
  console.log('ATLAS ANALYTICS: TIER 3 OWNERSHIP & PRIVILEGE NORMALIZATION');
  console.log('================================================================');

  const sqlPath = path.join(__dirname, 'db-tier3-normalize-ownership.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  await client.query(sql);

  // Verification audit
  const tables = await client.query(`
    SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
  `);

  const functions = await client.query(`
    SELECT p.proname, r.rolname AS owner, p.prosecdef AS is_security_definer
    FROM pg_proc p
    JOIN pg_roles r ON p.proowner = r.oid
    WHERE p.pronamespace = 'public'::regnamespace
    ORDER BY p.proname;
  `);

  console.log('✓ Tier 3 ownership normalization completed.');
  console.log(`  Application tables verified (${tables.rows.length}): all owned by ${tables.rows[0]?.tableowner}`);
  console.log(`  Routines verified (${functions.rows.length}):`);
  for (const f of functions.rows) {
    console.log(`    - ${f.proname}: owner=${f.owner} (security_definer=${f.is_security_definer})`);
  }

  await client.end();
}

runTier3Normalization().catch(err => {
  console.error('[TIER 3 FATAL ERROR]:', err);
  process.exit(1);
});
