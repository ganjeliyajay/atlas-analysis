-- Phase 1 RLS hardening helper functions.
-- SECURITY DEFINER is intentional: policy predicates must inspect canonical
-- ownership without recursively invoking OrganizationMember RLS.

CREATE OR REPLACE FUNCTION public.is_canonical_org_owner_membership(
    target_org_id TEXT,
    target_user_id TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public."Organization" AS organization
        WHERE organization."id" = target_org_id
          AND organization."ownerId" = target_user_id
    );
$function$;

REVOKE ALL ON FUNCTION public.is_canonical_org_owner_membership(TEXT, TEXT)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_canonical_org_owner_membership(TEXT, TEXT)
TO atlas_app;


-- Normal membership role changes are performed through this narrowly scoped
-- SECURITY DEFINER function. It validates actor, tenant, target, and role.
-- Ownership transfers remain exclusively handled by transfer_organization_ownership.
CREATE OR REPLACE FUNCTION public.update_organization_member_role(
    target_org_id TEXT,
    target_membership_id TEXT,
    requested_role TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    actor_user_id TEXT;
    actor_role TEXT;
    target_user_id TEXT;
    canonical_owner_id TEXT;
    affected_rows INTEGER;
BEGIN
    actor_user_id := NULLIF(current_setting('app.user_id', true), '');

    IF actor_user_id IS NULL THEN
        RAISE EXCEPTION 'User context is required'
            USING ERRCODE = '42501';
    END IF;

    IF NULLIF(current_setting('app.tenant_id', true), '')
       IS DISTINCT FROM target_org_id THEN
        RAISE EXCEPTION 'Tenant context mismatch'
            USING ERRCODE = '42501';
    END IF;

    IF requested_role NOT IN ('admin', 'member', 'viewer') THEN
        RAISE EXCEPTION 'Invalid role assignment'
            USING ERRCODE = '22023';
    END IF;

    SELECT membership."role"
    INTO actor_role
    FROM public."OrganizationMember" AS membership
    WHERE membership."organizationId" = target_org_id
      AND membership."userId" = actor_user_id;

    IF actor_role IS NULL OR actor_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Insufficient organization permissions'
            USING ERRCODE = '42501';
    END IF;

    SELECT membership."userId"
    INTO target_user_id
    FROM public."OrganizationMember" AS membership
    WHERE membership."id" = target_membership_id
      AND membership."organizationId" = target_org_id
    FOR UPDATE;

    IF target_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT organization."ownerId"
    INTO canonical_owner_id
    FROM public."Organization" AS organization
    WHERE organization."id" = target_org_id
    FOR UPDATE;

    IF canonical_owner_id IS NULL THEN
        RAISE EXCEPTION 'Organization not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF target_user_id = canonical_owner_id THEN
        RAISE EXCEPTION 'Transfer ownership before changing the canonical owner role'
            USING ERRCODE = '42501';
    END IF;

    IF actor_role = 'admin'
       AND requested_role NOT IN ('member', 'viewer') THEN
        RAISE EXCEPTION 'Admins may only assign member or viewer roles'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public."OrganizationMember"
    SET "role" = requested_role
    WHERE "id" = target_membership_id
      AND "organizationId" = target_org_id
      AND "userId" <> canonical_owner_id;

    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RETURN affected_rows = 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_organization_member_role(TEXT, TEXT, TEXT)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_organization_member_role(TEXT, TEXT, TEXT)
FROM atlas_ops;
GRANT EXECUTE ON FUNCTION public.update_organization_member_role(TEXT, TEXT, TEXT)
TO atlas_app;

-- Phase 1 hardening: protect the canonical owner from membership-policy bypasses.
-- Existing permissive policies are replaced with equivalent tenant-scoped policies
-- whose checks cannot be bypassed by direct SQL issued as atlas_app.

DROP POLICY IF EXISTS organization_member_insert_admin
ON public."OrganizationMember";
CREATE POLICY organization_member_insert_admin
ON public."OrganizationMember"
FOR INSERT TO atlas_app
WITH CHECK (
    public.current_user_is_org_admin_or_owner("organizationId")
    AND "role" <> 'owner'
    AND (
        "role" <> 'admin'
        OR public.current_user_owns_org("organizationId")
    )
);

DROP POLICY IF EXISTS organization_member_update_admin
ON public."OrganizationMember";
CREATE POLICY organization_member_update_admin
ON public."OrganizationMember"
FOR UPDATE TO atlas_app
USING (
    public.current_user_is_org_admin_or_owner("organizationId")
    AND (
        NOT public.is_canonical_org_owner_membership("organizationId", "userId")
        OR public.current_user_owns_org("organizationId")
    )
)
WITH CHECK (
    public.current_user_is_org_admin_or_owner("organizationId")
    AND (
        (
            public.is_canonical_org_owner_membership("organizationId", "userId")
            AND "role" = 'owner'
        )
        OR (
            NOT public.is_canonical_org_owner_membership("organizationId", "userId")
            AND "role" <> 'owner'
            AND (
                "role" <> 'admin'
                OR public.current_user_owns_org("organizationId")
            )
        )
    )
);

DROP POLICY IF EXISTS organization_member_delete_admin_or_self
ON public."OrganizationMember";
CREATE POLICY organization_member_delete_admin_or_self
ON public."OrganizationMember"
FOR DELETE TO atlas_app
USING (
    (
        "userId" = NULLIF(current_setting('app.user_id', true), '')
        OR public.current_user_is_org_admin_or_owner("organizationId")
    )
    AND NOT public.is_canonical_org_owner_membership("organizationId", "userId")
);

-- Usage rows are tenant-owned for every supported operation.
DROP POLICY IF EXISTS organization_usage_delete_tenant
ON public."OrganizationUsage";
CREATE POLICY organization_usage_delete_tenant
ON public."OrganizationUsage"
FOR DELETE TO atlas_app
USING (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
);

-- Ingestion error logs are append-only for the application role.
-- SELECT is allowed only for the tenant that owns the referenced project.
DROP POLICY IF EXISTS ingestion_error_log_select_tenant
ON public.ingestion_error_logs;
CREATE POLICY ingestion_error_log_select_tenant
ON public.ingestion_error_logs
FOR SELECT TO atlas_app
USING (
    "projectId" IS NOT NULL
    AND public.current_tenant_owns_project("projectId")
);

-- Explicitly document that this table is append-only for atlas_app:
-- no UPDATE/DELETE policies are intentionally provided.


DROP POLICY IF EXISTS invitation_insert_tenant
ON public."invitations";
CREATE POLICY invitation_insert_tenant
ON public."invitations"
FOR INSERT TO atlas_app
WITH CHECK (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
    AND public.current_user_is_org_admin_or_owner("organizationId")
    AND (
        "role" <> 'admin'
        OR public.current_user_owns_org("organizationId")
    )
);
