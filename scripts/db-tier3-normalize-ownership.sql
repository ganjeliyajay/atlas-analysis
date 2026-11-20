-- ============================================================================
-- ATLAS ANALYTICS: TIER 3 POST-MIGRATION OWNERSHIP & PRIVILEGE NORMALIZATION
-- Execute as PostgreSQL Master / DBA (DATABASE_URL_MIGRATION)
-- Idempotent and safe to execute after every Prisma deployment.
-- ============================================================================

-- 1. Reassign 100% of public application tables to atlas_migrator
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT LIKE 'pg_%'
    ) LOOP
        EXECUTE format('ALTER TABLE public.%I OWNER TO atlas_migrator;', r.tablename);
    END LOOP;
END $$;

-- 2. Reassign sequences in public schema to atlas_migrator
DO $$
DECLARE
    s RECORD;
BEGIN
    FOR s IN (
        SELECT c.relname AS seqname
        FROM pg_class c
        WHERE c.relkind = 'S'
          AND c.relnamespace = 'public'::regnamespace
    ) LOOP
        EXECUTE format('ALTER SEQUENCE public.%I OWNER TO atlas_migrator;', s.seqname);
    END LOOP;
END $$;

-- 3. Minimum required table privileges for atlas_function_owner
GRANT SELECT ON public."api_keys", public."Organization", public."Project", public."OrganizationMember", public.ingestion_token_buckets TO atlas_function_owner;
GRANT UPDATE ("ownerId") ON public."Organization" TO atlas_function_owner;
GRANT UPDATE ("role") ON public."OrganizationMember" TO atlas_function_owner;

-- 4. Reassign ALL 9 SECURITY DEFINER functions to atlas_function_owner
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'lookup_api_key_for_ingestion' AND pronamespace = 'public'::regnamespace) THEN
    ALTER FUNCTION public.lookup_api_key_for_ingestion(TEXT, TEXT) OWNER TO atlas_function_owner;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'lookup_legacy_project_for_ingestion' AND pronamespace = 'public'::regnamespace) THEN
    ALTER FUNCTION public.lookup_legacy_project_for_ingestion(TEXT) OWNER TO atlas_function_owner;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'transfer_organization_ownership' AND pronamespace = 'public'::regnamespace) THEN
    ALTER FUNCTION public.transfer_organization_ownership(TEXT, TEXT) OWNER TO atlas_function_owner;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_organization_member_role' AND pronamespace = 'public'::regnamespace) THEN
    ALTER FUNCTION public.update_organization_member_role(TEXT, TEXT, TEXT) OWNER TO atlas_function_owner;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'current_user_owns_org' AND pronamespace = 'public'::regnamespace) THEN
    ALTER FUNCTION public.current_user_owns_org(TEXT) OWNER TO atlas_function_owner;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'current_user_is_org_member' AND pronamespace = 'public'::regnamespace) THEN
    ALTER FUNCTION public.current_user_is_org_member(TEXT) OWNER TO atlas_function_owner;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'current_tenant_owns_project' AND pronamespace = 'public'::regnamespace) THEN
    ALTER FUNCTION public.current_tenant_owns_project(TEXT) OWNER TO atlas_function_owner;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'current_user_is_org_admin_or_owner' AND pronamespace = 'public'::regnamespace) THEN
    ALTER FUNCTION public.current_user_is_org_admin_or_owner(TEXT) OWNER TO atlas_function_owner;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_canonical_org_owner_membership' AND pronamespace = 'public'::regnamespace) THEN
    ALTER FUNCTION public.is_canonical_org_owner_membership(TEXT, TEXT) OWNER TO atlas_function_owner;
  END IF;

  -- 5. consume_ingestion_tokens is SECURITY INVOKER; assign to atlas_migrator
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'consume_ingestion_tokens' AND pronamespace = 'public'::regnamespace) THEN
    ALTER FUNCTION public.consume_ingestion_tokens(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC) OWNER TO atlas_migrator;
  END IF;
END $$;

-- 6. Table & Sequence grants for runtime roles
GRANT ALL ON SCHEMA public TO atlas_migrator;
GRANT USAGE ON SCHEMA public TO atlas_app, atlas_ops, atlas_function_owner;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO atlas_app;
REVOKE ALL ON "audit_logs" FROM atlas_app;
GRANT INSERT ON "audit_logs" TO atlas_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO atlas_app, atlas_ops;

-- 7. atlas_ops True Least Privilege
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM atlas_ops;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO atlas_ops;
GRANT UPDATE ("status", "suspendedAt", "suspendedReason", "eventQuota", "updatedAt") ON "Organization" TO atlas_ops;
GRANT UPDATE ("tokens", "lastRefillAt", "updatedAt") ON "ingestion_token_buckets" TO atlas_ops;
GRANT INSERT, UPDATE, DELETE ON "event_hourly_rollups", "event_daily_rollups" TO atlas_ops;
GRANT INSERT ON "OrganizationMember" TO atlas_ops;

-- 8. Routine execution permissions
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM atlas_ops;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'lookup_api_key_for_ingestion' AND pronamespace = 'public'::regnamespace) THEN
    GRANT EXECUTE ON FUNCTION public.lookup_api_key_for_ingestion(TEXT, TEXT) TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'lookup_legacy_project_for_ingestion' AND pronamespace = 'public'::regnamespace) THEN
    GRANT EXECUTE ON FUNCTION public.lookup_legacy_project_for_ingestion(TEXT) TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'transfer_organization_ownership' AND pronamespace = 'public'::regnamespace) THEN
    GRANT EXECUTE ON FUNCTION public.transfer_organization_ownership(TEXT, TEXT) TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_organization_member_role' AND pronamespace = 'public'::regnamespace) THEN
    GRANT EXECUTE ON FUNCTION public.update_organization_member_role(TEXT, TEXT, TEXT) TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'current_user_owns_org' AND pronamespace = 'public'::regnamespace) THEN
    GRANT EXECUTE ON FUNCTION public.current_user_owns_org(TEXT) TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'current_user_is_org_member' AND pronamespace = 'public'::regnamespace) THEN
    GRANT EXECUTE ON FUNCTION public.current_user_is_org_member(TEXT) TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'current_tenant_owns_project' AND pronamespace = 'public'::regnamespace) THEN
    GRANT EXECUTE ON FUNCTION public.current_tenant_owns_project(TEXT) TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'current_user_is_org_admin_or_owner' AND pronamespace = 'public'::regnamespace) THEN
    GRANT EXECUTE ON FUNCTION public.current_user_is_org_admin_or_owner(TEXT) TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_canonical_org_owner_membership' AND pronamespace = 'public'::regnamespace) THEN
    GRANT EXECUTE ON FUNCTION public.is_canonical_org_owner_membership(TEXT, TEXT) TO atlas_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'consume_ingestion_tokens' AND pronamespace = 'public'::regnamespace) THEN
    GRANT EXECUTE ON FUNCTION public.consume_ingestion_tokens(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC) TO atlas_app;
  END IF;
END $$;

-- 9. Future default privileges for tables created by atlas_migrator
ALTER DEFAULT PRIVILEGES FOR ROLE atlas_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app;

ALTER DEFAULT PRIVILEGES FOR ROLE atlas_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO atlas_ops;

ALTER DEFAULT PRIVILEGES FOR ROLE atlas_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO atlas_app, atlas_ops;
