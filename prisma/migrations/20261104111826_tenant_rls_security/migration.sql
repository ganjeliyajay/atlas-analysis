
-- =========================================================
-- ATLAS ANALYTICS: TENANT RLS SECURITY HELPERS
-- =========================================================

-- 1. Verify that the current user belongs to an organization.
CREATE OR REPLACE FUNCTION public.current_user_is_org_member(
    target_org_id TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public."OrganizationMember" AS membership
        WHERE membership."organizationId" = target_org_id
          AND membership."userId" =
              NULLIF(current_setting('app.user_id', true), '')
    );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_org_member(TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_is_org_member(TEXT)
TO atlas_app;


-- 2. Verify that a project belongs to the active tenant.
CREATE OR REPLACE FUNCTION public.current_tenant_owns_project(
    target_project_id TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public."Project" AS project
        WHERE project."id" = target_project_id
          AND project."organizationId" =
              NULLIF(current_setting('app.tenant_id', true), '')
    );
$$;

REVOKE ALL ON FUNCTION public.current_tenant_owns_project(TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_tenant_owns_project(TEXT)
TO atlas_app;


-- 3. Verify that the current user owns the organization.
CREATE OR REPLACE FUNCTION public.current_user_owns_org(
    target_org_id TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public."Organization" AS organization
        WHERE organization."id" = target_org_id
          AND organization."ownerId" =
              NULLIF(current_setting('app.user_id', true), '')
    );
$$;

REVOKE ALL ON FUNCTION public.current_user_owns_org(TEXT)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_owns_org(TEXT)
TO atlas_app;


-- =========================================================
-- ORGANIZATION RLS POLICIES
-- =========================================================

-- Members can read their organizations.
-- The owner can also read the organization during registration.
CREATE POLICY organization_select_member_or_owner
ON public."Organization"
FOR SELECT
TO atlas_app
USING (
    "ownerId" = NULLIF(current_setting('app.user_id', true), '')
    OR public.current_user_is_org_member("id")
);

-- Users can create organizations only as their own.
CREATE POLICY organization_insert_owner
ON public."Organization"
FOR INSERT
TO atlas_app
WITH CHECK (
    "ownerId" = NULLIF(current_setting('app.user_id', true), '')
);


-- =========================================================
-- ORGANIZATION MEMBER RLS POLICIES
-- =========================================================

-- Users can read their own membership and memberships
-- belonging to organizations they are members of.
CREATE POLICY organization_member_select
ON public."OrganizationMember"
FOR SELECT
TO atlas_app
USING (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    OR public.current_user_is_org_member("organizationId")
);

-- Allow registration to create the initial owner membership only.
CREATE POLICY organization_member_insert_initial_owner
ON public."OrganizationMember"
FOR INSERT
TO atlas_app
WITH CHECK (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "role" = 'owner'
    AND public.current_user_owns_org("organizationId")
);


-- =========================================================
-- PROJECT RLS POLICIES
-- =========================================================

CREATE POLICY project_select_tenant
ON public."Project"
FOR SELECT TO atlas_app
USING (
    "organizationId" =
    NULLIF(current_setting('app.tenant_id', true), '')
);

CREATE POLICY project_insert_tenant
ON public."Project"
FOR INSERT TO atlas_app
WITH CHECK (
    "organizationId" =
    NULLIF(current_setting('app.tenant_id', true), '')
);

CREATE POLICY project_update_tenant
ON public."Project"
FOR UPDATE TO atlas_app
USING (
    "organizationId" =
    NULLIF(current_setting('app.tenant_id', true), '')
)
WITH CHECK (
    "organizationId" =
    NULLIF(current_setting('app.tenant_id', true), '')
);

CREATE POLICY project_delete_tenant
ON public."Project"
FOR DELETE TO atlas_app
USING (
    "organizationId" =
    NULLIF(current_setting('app.tenant_id', true), '')
);


-- =========================================================
-- INGESTION: ORGANIZATION ACCESS
-- =========================================================

CREATE POLICY organization_select_ingestion_tenant
ON public."Organization"
FOR SELECT TO atlas_app
USING (
    "id" = NULLIF(current_setting('app.tenant_id', true), '')
);


-- =========================================================
-- ANALYTICS EVENT POLICIES
-- =========================================================

CREATE POLICY analytics_event_select_tenant
ON public."AnalyticsEvent"
FOR SELECT TO atlas_app
USING (public.current_tenant_owns_project("projectId"));

CREATE POLICY analytics_event_insert_tenant
ON public."AnalyticsEvent"
FOR INSERT TO atlas_app
WITH CHECK (public.current_tenant_owns_project("projectId"));


-- =========================================================
-- ORGANIZATION USAGE POLICIES
-- =========================================================

CREATE POLICY organization_usage_select_tenant
ON public."OrganizationUsage"
FOR SELECT TO atlas_app
USING (
    "organizationId" =
    NULLIF(current_setting('app.tenant_id', true), '')
);

CREATE POLICY organization_usage_insert_tenant
ON public."OrganizationUsage"
FOR INSERT TO atlas_app
WITH CHECK (
    "organizationId" =
    NULLIF(current_setting('app.tenant_id', true), '')
);

CREATE POLICY organization_usage_update_tenant
ON public."OrganizationUsage"
FOR UPDATE TO atlas_app
USING (
    "organizationId" =
    NULLIF(current_setting('app.tenant_id', true), '')
)
WITH CHECK (
    "organizationId" =
    NULLIF(current_setting('app.tenant_id', true), '')
);


-- =========================================================
-- IDEMPOTENCY POLICIES
-- =========================================================

CREATE POLICY ingestion_idempotency_select_tenant
ON public.ingestion_idempotency_keys
FOR SELECT TO atlas_app
USING (public.current_tenant_owns_project("projectId"));

CREATE POLICY ingestion_idempotency_insert_tenant
ON public.ingestion_idempotency_keys
FOR INSERT TO atlas_app
WITH CHECK (public.current_tenant_owns_project("projectId"));

CREATE POLICY ingestion_idempotency_update_tenant
ON public.ingestion_idempotency_keys
FOR UPDATE TO atlas_app
USING (public.current_tenant_owns_project("projectId"))
WITH CHECK (public.current_tenant_owns_project("projectId"));

CREATE POLICY ingestion_idempotency_delete_tenant
ON public.ingestion_idempotency_keys
FOR DELETE TO atlas_app
USING (public.current_tenant_owns_project("projectId"));


-- =========================================================
-- INGESTION ERROR LOG POLICIES
-- =========================================================

CREATE POLICY ingestion_error_log_insert_tenant
ON public.ingestion_error_logs
FOR INSERT TO atlas_app
WITH CHECK (
    "projectId" IS NOT NULL
    AND public.current_tenant_owns_project("projectId")
);



-- =========================================================
-- ENABLE AND FORCE ROW LEVEL SECURITY
-- =========================================================

ALTER TABLE public."Organization"
ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Organization"
FORCE ROW LEVEL SECURITY;

ALTER TABLE public."OrganizationMember"
ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OrganizationMember"
FORCE ROW LEVEL SECURITY;

ALTER TABLE public."Project"
ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Project"
FORCE ROW LEVEL SECURITY;

ALTER TABLE public."AnalyticsEvent"
ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AnalyticsEvent"
FORCE ROW LEVEL SECURITY;

ALTER TABLE public."OrganizationUsage"
ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OrganizationUsage"
FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ingestion_idempotency_keys
ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_idempotency_keys
FORCE ROW LEVEL SECURITY;

ALTER TABLE public.ingestion_error_logs
ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_error_logs
FORCE ROW LEVEL SECURITY;