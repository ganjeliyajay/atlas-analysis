import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTier1Provisioning() {
  const connectionUrl = process.env.DATABASE_URL_MIGRATION || process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;

  if (!connectionUrl) {
    console.error('[TIER 1 ERROR] DATABASE_URL_MIGRATION is required to execute Tier 1 DBA provisioning.');
    process.exit(1);
  }

  const client = new Client({ connectionString: connectionUrl });
  await client.connect();

  console.log('================================================================');
  console.log('ATLAS ANALYTICS: TIER 1 DBA ROLE PROVISIONING');
  console.log('================================================================');

  const sqlTemplatePath = path.join(__dirname, 'db-tier1-provision-roles.sql');
  let sql = fs.readFileSync(sqlTemplatePath, 'utf8');

  const migratorPw = process.env.ATLAS_MIGRATOR_PASSWORD || 'atlas_migrator_default_pw_2026';
  const appPw = process.env.ATLAS_APP_PASSWORD || 'atlas_app_default_pw_2026';
  const opsPw = process.env.ATLAS_OPS_PASSWORD || 'atlas_ops_default_pw_2026';

  sql = sql
    .replace('${MIGRATOR_PASSWORD}', migratorPw.replace(/'/g, "''"))
    .replace('${APP_PASSWORD}', appPw.replace(/'/g, "''"))
    .replace('${OPS_PASSWORD}', opsPw.replace(/'/g, "''"));

  await client.query(sql);

  console.log('✓ Tier 1 DBA provisioning completed successfully.');
  console.log('  Roles provisioned: atlas_migrator, atlas_app, atlas_ops, atlas_function_owner.');
  console.log('  Schema public owner: atlas_migrator.');

  await client.end();
}

runTier1Provisioning().catch(err => {
  console.error('[TIER 1 FATAL ERROR]:', err);
  process.exit(1);
});
