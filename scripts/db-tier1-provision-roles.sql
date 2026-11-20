-- ============================================================================
-- ATLAS ANALYTICS: TIER 1 DBA ROLE PROVISIONING SCRIPT
-- Execute as PostgreSQL Master / DBA (DATABASE_URL_MIGRATION)
-- Idempotent and safe to execute multiple times.
-- ============================================================================

DO $$
BEGIN
  -- 1. Provision atlas_migrator (Schema DDL owner & migration runner)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_migrator') THEN
    CREATE ROLE atlas_migrator WITH LOGIN
      PASSWORD '${MIGRATOR_PASSWORD}'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSE
    ALTER ROLE atlas_migrator WITH
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;

  -- 2. Provision atlas_app (Runtime application connection)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_app') THEN
    CREATE ROLE atlas_app WITH LOGIN
      PASSWORD '${APP_PASSWORD}'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSE
    ALTER ROLE atlas_app WITH
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;

  -- 3. Provision atlas_ops (Operations / Superadmin console connection)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_ops') THEN
    CREATE ROLE atlas_ops WITH LOGIN
      PASSWORD '${OPS_PASSWORD}'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSE
    ALTER ROLE atlas_ops WITH
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;

  -- 4. Provision atlas_function_owner (Dedicated non-login owner for SECURITY DEFINER routines)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'atlas_function_owner') THEN
    CREATE ROLE atlas_function_owner WITH NOLOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  ELSE
    ALTER ROLE atlas_function_owner WITH NOLOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;

  -- Attempt to grant BYPASSRLS to atlas_function_owner if supported by managed provider
  BEGIN
    ALTER ROLE atlas_function_owner BYPASSRLS;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Managed PostgreSQL provider does not permit ALTER ROLE ... BYPASSRLS. Function owner will execute without explicit BYPASSRLS flag.';
  END;

  -- Configure UTC session timezones
  BEGIN
    ALTER ROLE atlas_app SET timezone = 'UTC';
    ALTER ROLE atlas_ops SET timezone = 'UTC';
    ALTER ROLE atlas_migrator SET timezone = 'UTC';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Role timezone configuration skipped due to provider permissions.';
  END;
END $$;

-- Database connection privileges
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO atlas_migrator, atlas_app, atlas_ops;', current_database());
END $$;

-- Public schema ownership and base privileges
ALTER SCHEMA public OWNER TO atlas_migrator;
GRANT ALL ON SCHEMA public TO atlas_migrator;
GRANT USAGE ON SCHEMA public TO atlas_app, atlas_ops, atlas_function_owner;
