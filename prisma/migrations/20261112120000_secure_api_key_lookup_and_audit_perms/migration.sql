-- Revoke unrestricted permissions on audit_logs from ordinary app role
REVOKE ALL ON "audit_logs" FROM atlas_app;
GRANT INSERT ON "audit_logs" TO atlas_app;
GRANT ALL ON "audit_logs" TO atlas_ops;

-- Function: Securely resolve API key for ingestion without granting atlas_app global table access
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
SET search_path = public
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
    FROM "api_keys" k
    JOIN "Organization" o ON o.id = k."organizationId"
    WHERE k."keyPrefix" IN (p_prefix, p_legacy_prefix);
$$;

-- Function: Securely resolve legacy project apiKeyHash for ingestion
CREATE OR REPLACE FUNCTION lookup_legacy_project_for_ingestion(p_hash text)
RETURNS TABLE (
    id text,
    "organizationId" text,
    "eventQuota" integer,
    status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        p.id,
        p."organizationId",
        o."eventQuota",
        o.status
    FROM "Project" p
    JOIN "Organization" o ON o.id = p."organizationId"
    WHERE p."apiKeyHash" = p_hash;
$$;

GRANT EXECUTE ON FUNCTION lookup_api_key_for_ingestion(text, text) TO atlas_app, atlas_ops;
GRANT EXECUTE ON FUNCTION lookup_legacy_project_for_ingestion(text) TO atlas_app, atlas_ops;
