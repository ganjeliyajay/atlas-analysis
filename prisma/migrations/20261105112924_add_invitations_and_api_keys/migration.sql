-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "invitations_organizationId_idx" ON "invitations"("organizationId");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "invitations_status_idx" ON "invitations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_organizationId_idx" ON "api_keys"("organizationId");

-- CreateIndex
CREATE INDEX "api_keys_projectId_idx" ON "api_keys"("projectId");

-- CreateIndex
CREATE INDEX "api_keys_keyPrefix_idx" ON "api_keys"("keyPrefix");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =========================================================
-- ATLAS ANALYTICS: PERMISSIONS & ROLE GRANTS
-- =========================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."invitations" TO atlas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."invitations" TO atlas_ops;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."api_keys" TO atlas_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."api_keys" TO atlas_ops;

-- =========================================================
-- ATLAS ANALYTICS: SECURITY HELPER FUNCTION
-- =========================================================

CREATE OR REPLACE FUNCTION public.current_user_is_org_admin_or_owner(
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
          AND membership."role" IN ('owner', 'admin')
    );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_org_admin_or_owner(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_org_admin_or_owner(TEXT) TO atlas_app;

-- =========================================================
-- ENABLE AND FORCE ROW LEVEL SECURITY ON NEW TABLES
-- =========================================================

ALTER TABLE public."invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."invitations" FORCE ROW LEVEL SECURITY;

ALTER TABLE public."api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."api_keys" FORCE ROW LEVEL SECURITY;

-- =========================================================
-- INVITATIONS RLS POLICIES
-- =========================================================

CREATE POLICY invitation_select_tenant
ON public."invitations"
FOR SELECT TO atlas_app
USING (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
    AND public.current_user_is_org_member("organizationId")
);

CREATE POLICY invitation_insert_tenant
ON public."invitations"
FOR INSERT TO atlas_app
WITH CHECK (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
    AND public.current_user_is_org_admin_or_owner("organizationId")
);

CREATE POLICY invitation_update_tenant
ON public."invitations"
FOR UPDATE TO atlas_app
USING (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
    AND public.current_user_is_org_admin_or_owner("organizationId")
)
WITH CHECK (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
    AND public.current_user_is_org_admin_or_owner("organizationId")
);

CREATE POLICY invitation_delete_tenant
ON public."invitations"
FOR DELETE TO atlas_app
USING (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
    AND public.current_user_is_org_admin_or_owner("organizationId")
);

-- =========================================================
-- API KEYS RLS POLICIES
-- =========================================================

CREATE POLICY api_key_select_tenant
ON public."api_keys"
FOR SELECT TO atlas_app
USING (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
    AND public.current_user_is_org_member("organizationId")
);

CREATE POLICY api_key_insert_tenant
ON public."api_keys"
FOR INSERT TO atlas_app
WITH CHECK (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
    AND public.current_user_is_org_admin_or_owner("organizationId")
);

CREATE POLICY api_key_update_tenant
ON public."api_keys"
FOR UPDATE TO atlas_app
USING (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
    AND public.current_user_is_org_admin_or_owner("organizationId")
)
WITH CHECK (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
    AND public.current_user_is_org_admin_or_owner("organizationId")
);

CREATE POLICY api_key_delete_tenant
ON public."api_keys"
FOR DELETE TO atlas_app
USING (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
    AND public.current_user_is_org_admin_or_owner("organizationId")
);

-- =========================================================
-- MISSING POLICIES FOR EXISTING TABLES
-- =========================================================

-- Organization update / delete for owners
CREATE POLICY organization_update_owner
ON public."Organization"
FOR UPDATE TO atlas_app
USING (public.current_user_owns_org("id"))
WITH CHECK (public.current_user_owns_org("id"));

CREATE POLICY organization_delete_owner
ON public."Organization"
FOR DELETE TO atlas_app
USING (public.current_user_owns_org("id"));

-- OrganizationMember insert / update / delete for admins
CREATE POLICY organization_member_insert_admin
ON public."OrganizationMember"
FOR INSERT TO atlas_app
WITH CHECK (
    public.current_user_is_org_admin_or_owner("organizationId")
);

CREATE POLICY organization_member_update_admin
ON public."OrganizationMember"
FOR UPDATE TO atlas_app
USING (public.current_user_is_org_admin_or_owner("organizationId"))
WITH CHECK (public.current_user_is_org_admin_or_owner("organizationId"));

CREATE POLICY organization_member_delete_admin_or_self
ON public."OrganizationMember"
FOR DELETE TO atlas_app
USING (
    "userId" = NULLIF(current_setting('app.user_id', true), '')
    OR public.current_user_is_org_admin_or_owner("organizationId")
);

-- AnalyticsEvent update / delete for tenant
CREATE POLICY analytics_event_update_tenant
ON public."AnalyticsEvent"
FOR UPDATE TO atlas_app
USING (public.current_tenant_owns_project("projectId"))
WITH CHECK (public.current_tenant_owns_project("projectId"));

CREATE POLICY analytics_event_delete_tenant
ON public."AnalyticsEvent"
FOR DELETE TO atlas_app
USING (public.current_tenant_owns_project("projectId"));
