-- Add explicit reporting timezone column to Organization
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- Hardened Security Definer functions with restricted search_path, explicit table schemas, and input validation
CREATE OR REPLACE FUNCTION lookup_api_key_for_ingestion(p_prefix text, p_legacy_prefix text)
RETURNS TABLE (
    id text,
    "organizationId" text,
    "projectId" text,
    "keyPrefix" text,
    "keyHash" text,
    "revokedAt" timestamp(3),
    "expiresAt" timestamp(3),
    "eventQuota" integer,
    status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT 
        k.id,
        k."organizationId",
        k."projectId",
        k."keyPrefix",
        k."keyHash",
        k."revokedAt",
        k."expiresAt",
        o."eventQuota",
        o.status
    FROM public."api_keys" k
    JOIN public."Organization" o ON o.id = k."organizationId"
    WHERE (p_prefix IS NOT NULL AND length(trim(p_prefix)) >= 12 AND k."keyPrefix" = p_prefix)
       OR (p_legacy_prefix IS NOT NULL AND length(trim(p_legacy_prefix)) >= 12 AND k."keyPrefix" = p_legacy_prefix);
$$;

CREATE OR REPLACE FUNCTION lookup_legacy_project_for_ingestion(p_hash text)
RETURNS TABLE (
    id text,
    "organizationId" text,
    "eventQuota" integer,
    status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT 
        p.id,
        p."organizationId",
        o."eventQuota",
        o.status
    FROM public."Project" p
    JOIN public."Organization" o ON o.id = p."organizationId"
    WHERE p_hash IS NOT NULL AND length(trim(p_hash)) >= 16 AND p."apiKeyHash" = p_hash;
$$;

-- Revoke all default execution permissions from PUBLIC
REVOKE ALL ON FUNCTION lookup_api_key_for_ingestion(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION lookup_legacy_project_for_ingestion(text) FROM PUBLIC;

-- Explicitly grant execution only to required application and ops roles
GRANT EXECUTE ON FUNCTION lookup_api_key_for_ingestion(text, text) TO atlas_app, atlas_ops;
GRANT EXECUTE ON FUNCTION lookup_legacy_project_for_ingestion(text) TO atlas_app, atlas_ops;

-- Audit logs security: enforce append-only for atlas_app, manage-only for atlas_ops, zero for PUBLIC
REVOKE ALL ON "audit_logs" FROM PUBLIC;
REVOKE ALL ON "audit_logs" FROM atlas_app;
GRANT INSERT ON "audit_logs" TO atlas_app;
GRANT ALL ON "audit_logs" TO atlas_ops;

