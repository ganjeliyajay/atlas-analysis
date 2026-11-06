
-- Secure, atomic organization ownership transfer.

CREATE OR REPLACE FUNCTION public.transfer_organization_ownership(
    target_org_id TEXT,
    target_user_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    actor_user_id TEXT;
    current_owner_id TEXT;
    owner_membership_count INTEGER;
    affected_rows INTEGER;
BEGIN
    actor_user_id := NULLIF(
        current_setting('app.user_id', true),
        ''
    );

    IF actor_user_id IS NULL THEN
        RAISE EXCEPTION 'User context is required'
            USING ERRCODE = '42501';
    END IF;

    IF NULLIF(current_setting('app.tenant_id', true), '')
       IS DISTINCT FROM target_org_id THEN
        RAISE EXCEPTION 'Tenant context mismatch'
            USING ERRCODE = '42501';
    END IF;

    IF target_org_id IS NULL OR target_org_id = ''
       OR target_user_id IS NULL OR target_user_id = '' THEN
        RAISE EXCEPTION 'Organization and target user are required'
            USING ERRCODE = '22023';
    END IF;

    IF actor_user_id = target_user_id THEN
        RAISE EXCEPTION 'Cannot transfer ownership to yourself'
            USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(target_org_id, 0)
    );

    SELECT organization."ownerId"
    INTO current_owner_id
    FROM public."Organization" AS organization
    WHERE organization."id" = target_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Organization not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF current_owner_id IS DISTINCT FROM actor_user_id THEN
        RAISE EXCEPTION 'Only the current organization owner can transfer ownership'
            USING ERRCODE = '42501';
    END IF;

    SELECT COUNT(*)
    INTO owner_membership_count
    FROM public."OrganizationMember" AS membership
    WHERE membership."organizationId" = target_org_id
      AND membership."role" = 'owner';

    IF owner_membership_count <> 1 THEN
        RAISE EXCEPTION 'Organization must have exactly one owner membership'
            USING ERRCODE = '23514';
    END IF;

    PERFORM 1
    FROM public."OrganizationMember" AS membership
    WHERE membership."organizationId" = target_org_id
      AND membership."userId" = current_owner_id
      AND membership."role" = 'owner'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Current owner membership is inconsistent'
            USING ERRCODE = '23514';
    END IF;

    PERFORM 1
    FROM public."OrganizationMember" AS membership
    WHERE membership."organizationId" = target_org_id
      AND membership."userId" = target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target user is not an organization member'
            USING ERRCODE = '23503';
    END IF;

    UPDATE public."OrganizationMember"
    SET "role" = 'admin'
    WHERE "organizationId" = target_org_id
      AND "userId" = current_owner_id
      AND "role" = 'owner';

    GET DIAGNOSTICS affected_rows = ROW_COUNT;

    IF affected_rows <> 1 THEN
        RAISE EXCEPTION 'Could not update previous owner membership'
            USING ERRCODE = '23514';
    END IF;

    UPDATE public."OrganizationMember"
    SET "role" = 'owner'
    WHERE "organizationId" = target_org_id
      AND "userId" = target_user_id;

    GET DIAGNOSTICS affected_rows = ROW_COUNT;

    IF affected_rows <> 1 THEN
        RAISE EXCEPTION 'Could not promote target owner'
            USING ERRCODE = '23514';
    END IF;

    UPDATE public."Organization"
    SET "ownerId" = target_user_id
    WHERE "id" = target_org_id
      AND "ownerId" = current_owner_id;

    GET DIAGNOSTICS affected_rows = ROW_COUNT;

    IF affected_rows <> 1 THEN
        RAISE EXCEPTION 'Could not update canonical organization owner'
            USING ERRCODE = '23514';
    END IF;
END;
$function$;

ALTER FUNCTION public.transfer_organization_ownership(TEXT, TEXT)
OWNER TO postgres;

REVOKE ALL ON FUNCTION public.transfer_organization_ownership(TEXT, TEXT)
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.transfer_organization_ownership(TEXT, TEXT)
FROM atlas_ops;

GRANT EXECUTE ON FUNCTION public.transfer_organization_ownership(TEXT, TEXT)
TO atlas_app;
