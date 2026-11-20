#!/usr/bin/env node
/**
 * ATLAS ANALYTICS: STAGING TARGET PRE-FLIGHT IDENTITY & SAFETY GUARD
 * Strict read-only verification of database identity, major version (16 or 17 only),
 * host allowlist, production pattern rejection, and native superuser privilege.
 * 
 * Safety Guarantee: ZERO database mutations. Fail-closed on any ambiguity.
 * 
 * Exit Codes:
 *   0: Pre-flight identity verification PASSED (certified PostgreSQL 16/17 staging target).
 *   1: Configuration error (missing required arguments or environment parameters).
 *   2: FORBIDDEN production pattern detected in host, database, or connection settings.
 *   3: Host NOT allowlisted.
 *   4: Database identity mismatch (database name does not match expected staging identity).
 *   5: Connected role lacks native superuser privileges.
 *   6: Incompatible PostgreSQL major version (strictly rejects PG < 16 or PG >= 18).
 *   7: Connection failure or network error.
 */
import pg from 'pg';
const { Client } = pg;

// Certified Staging Host Allowlist (exact matches required)
const DEFAULT_ALLOWED_HOSTS = [
  'staging-pg16.internal',
  'staging-pg17.internal',
  '10.0.10.45',
  'staging-db.atlas.local'
];

// Production Host/Domain Patterns (Strict Rejection)
const FORBIDDEN_PROD_PATTERNS = [
  'prod',
  'production',
  'rds.amazonaws.com',
  'cloudsql',
  'neon.tech',
  'supabase.co',
  'cockroachlabs.cloud'
];

// Production Database Names (Strict Rejection unless explicit mock staging override)
const FORBIDDEN_PROD_DB_NAMES = [
  'atlas_analytics_prod',
  'atlas_analytics_production',
  'production',
  'prod'
];

// Supported Major Engine Versions (Only 16 and 17)
const SUPPORTED_PG_MAJOR_VERSIONS = ['16', '17'];

async function main() {
  const targetHost = (process.env.PGHOST || process.argv[2] || '').trim();
  const targetPort = parseInt(process.env.PGPORT || process.argv[3] || '5432', 10);
  const targetDb = (process.env.PGDATABASE || 'atlas_analytics_staging').trim();
  const targetUser = (process.env.PGUSER || 'postgres').trim();
  const targetPw = process.env.PGPASSWORD || process.env.ATLAS_ADMIN_PASSWORD || '';
  
  // Staging Identity Configuration
  const expectedEnv = (process.env.EXPECTED_STAGING_ENV || '').trim();
  const expectedDb = (process.env.EXPECTED_STAGING_DB || targetDb).trim();
  const allowLocalhost = process.env.ALLOW_LOCALHOST_STAGING === 'true';

  console.log('=================================================================');
  console.log('ATLAS STAGING IDENTITY & SAFETY GUARD');
  console.log('=================================================================');
  console.log(`Target Host:       ${targetHost}:${targetPort}`);
  console.log(`Target Database:   ${targetDb}`);
  console.log(`Target User:       ${targetUser}`);
  console.log(`Expected Staging:  ${expectedDb} (env: ${expectedEnv || 'unspecified'})`);
  console.log('=================================================================');

  // 1. Validate Required Parameters
  if (!targetHost) {
    console.error('FATAL [Exit 1]: Target host not specified. Provide via PGHOST or command-line argument.');
    console.error('Usage: node scripts/deploy/verify-staging-target.mjs <target-host> [target-port]');
    process.exit(1);
  }

  // Explicit Staging Identity Check (Fail-Closed)
  if (!expectedEnv || expectedEnv.toLowerCase() !== 'staging') {
    console.error('FATAL [Exit 1]: Missing or invalid EXPECTED_STAGING_ENV environment variable.');
    console.error('Refusing to execute: EXPECTED_STAGING_ENV must be explicitly set to "staging" to confirm target intent.');
    process.exit(1);
  }

  const lowerHost = targetHost.toLowerCase();
  const lowerDb = targetDb.toLowerCase();

  // 2. Production Host & Domain Pattern Rejection (Exit 2)
  for (const pattern of FORBIDDEN_PROD_PATTERNS) {
    if (lowerHost.includes(pattern)) {
      console.error(`CRITICAL REJECTION [Exit 2]: Target host '${targetHost}' matches forbidden production pattern '${pattern}'!`);
      console.error('Aborting execution: Production or managed cloud database targets are strictly forbidden.');
      process.exit(2);
    }
  }

  // Production Database Name Rejection (Exit 2)
  for (const prodDb of FORBIDDEN_PROD_DB_NAMES) {
    if (lowerDb === prodDb) {
      console.error(`CRITICAL REJECTION [Exit 2]: Target database name '${targetDb}' matches protected production database name '${prodDb}'!`);
      process.exit(2);
    }
  }

  // 3. Exact Staging Host Allowlist Verification (Exit 3)
  const allowedHosts = [...DEFAULT_ALLOWED_HOSTS];
  if (allowLocalhost) {
    allowedHosts.push('localhost', '127.0.0.1', '::1');
  }

  const isHostAllowed = allowedHosts.some(allowed => lowerHost === allowed.toLowerCase());
  if (!isHostAllowed) {
    console.error(`CRITICAL REJECTION [Exit 3]: Target host '${targetHost}' is NOT in the certified staging allowlist!`);
    console.error('Allowed staging hosts are:');
    allowedHosts.forEach(h => console.error(`  - ${h}`));
    if (!allowLocalhost && (lowerHost === 'localhost' || lowerHost === '127.0.0.1')) {
      console.error('Notice: Localhost is disabled by default. Set ALLOW_LOCALHOST_STAGING=true for local staging tests.');
    }
    process.exit(3);
  }

  // 4. Exact Staging Database Identity Match (Exit 4)
  if (lowerDb !== expectedDb.toLowerCase()) {
    console.error(`CRITICAL REJECTION [Exit 4]: Database name mismatch!`);
    console.error(`  Connected Database: '${targetDb}'`);
    console.error(`  Expected Staging DB: '${expectedDb}'`);
    process.exit(4);
  }

  // If connected to 'atlas_analytics' (production default name), ensure explicit staging flag
  if (lowerDb === 'atlas_analytics' && !process.env.CONFIRM_ISOLATED_STAGING_DB) {
    console.error(`CRITICAL REJECTION [Exit 4]: Target database is named 'atlas_analytics', which matches production naming!`);
    console.error('To protect production, staging databases must be named with a staging suffix (e.g. atlas_analytics_staging),');
    console.error('or CONFIRM_ISOLATED_STAGING_DB=true must be explicitly passed.');
    process.exit(4);
  }

  // 5. Connect and Inspect Target Identity (Read-Only)
  console.log('[Pre-Flight] Connecting to target database for read-only identity inspection...');

  const client = new Client({
    host: targetHost,
    port: targetPort,
    database: targetDb,
    user: targetUser,
    password: targetPw,
    connectionTimeoutMillis: 5000
  });

  try {
    await client.connect();
    
    // Read-only inspection query
    const res = await client.query(`
      SELECT 
        current_database() AS db,
        current_user AS user,
        coalesce(inet_server_addr()::text, 'local') AS server_ip,
        (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser,
        version() AS pg_version,
        current_setting('server_version') AS server_version,
        current_setting('server_version_num')::integer AS server_version_num
    `);
    await client.end();

    const row = res.rows[0];
    const serverVersionNum = row.server_version_num;
    const serverVersionStr = row.server_version;
    const majorVersion = Math.floor(serverVersionNum / 10000).toString();

    console.log(`✓ Verified Database:      ${row.db}`);
    console.log(`✓ Verified User:          ${row.user}`);
    console.log(`✓ Connected Server IP:    ${row.server_ip}`);
    console.log(`✓ Native Superuser:       ${row.is_superuser}`);
    console.log(`✓ Engine Version String:  ${serverVersionStr}`);
    console.log(`✓ Major Version Number:   ${majorVersion} (num: ${serverVersionNum})`);

    // 6. Verify Native Superuser Privilege (Exit 5)
    if (!row.is_superuser) {
      console.error(`CRITICAL REJECTION [Exit 5]: User '${row.user}' is NOT a native PostgreSQL superuser!`);
      console.error('The ATLAS function-owner security model strictly requires native superuser access for Tier 1 provisioning.');
      process.exit(5);
    }

    // 7. Verify Supported Major Version (16 or 17 Only) (Exit 6)
    if (!SUPPORTED_PG_MAJOR_VERSIONS.includes(majorVersion)) {
      console.error(`CRITICAL REJECTION [Exit 6]: Incompatible PostgreSQL major version: ${majorVersion}!`);
      console.error(`The ATLAS self-hosted architecture is certified strictly for PostgreSQL 16 or 17.`);
      console.error(`Detected engine: ${serverVersionStr} (Major version: ${majorVersion}).`);
      console.error(`PostgreSQL ${majorVersion} instances (including PG 18) are strictly rejected.`);
      process.exit(6);
    }

    console.log('=================================================================');
    console.log('✓ PRE-FLIGHT VERIFICATION PASSED: Database identity and PostgreSQL 16/17 certified.');
    console.log('=================================================================');
    process.exit(0);

  } catch (err) {
    console.error('FATAL [Exit 7]: Database connection or read-only identity query failed:');
    console.error(`  Error message: ${err.message}`);
    process.exit(7);
  }
}

main();
