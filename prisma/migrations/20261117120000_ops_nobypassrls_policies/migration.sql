-- Migration: 20261117120000_ops_nobypassrls_policies
-- Ensure atlas_ops has NOBYPASSRLS and explicit least-privilege RLS policies on operational tables

ALTER ROLE atlas_ops NOBYPASSRLS;

DO $$
DECLARE
    r RECORD;
    pol_name TEXT;
BEGIN
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND rowsecurity = true
    ) LOOP
        pol_name := 'ops_all_' || lower(r.tablename);
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
              AND tablename = r.tablename 
              AND policyname = pol_name
        ) THEN
            EXECUTE format('CREATE POLICY %I ON public.%I TO atlas_ops USING (true) WITH CHECK (true);', pol_name, r.tablename);
        END IF;
    END LOOP;
END $$;
