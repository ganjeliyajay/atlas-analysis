import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

async function audit() {
  const client = new Client({ connectionString: process.env.DATABASE_URL_MIGRATION });
  await client.connect();

  console.log("=== TABLES & RLS ===");
  const tables = await client.query(`
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, u.usename as owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_user u ON u.usesysid = c.relowner
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname;
  `);
  console.table(tables.rows);

  console.log("\n=== POLICIES ===");
  const policies = await client.query(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `);
  console.table(policies.rows.map(p => ({
    table: p.tablename,
    policy: p.policyname,
    cmd: p.cmd,
    roles: p.roles,
  })));

  console.log("\n=== ATLAS_APP GRANTS ===");
  const grants = await client.query(`
    SELECT table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE grantee = 'atlas_app'
    ORDER BY table_name, privilege_type;
  `);
  console.table(grants.rows);

  await client.end();
}

audit().catch(console.error);

