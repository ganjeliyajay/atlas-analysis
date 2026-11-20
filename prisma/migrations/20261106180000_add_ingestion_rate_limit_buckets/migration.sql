CREATE TABLE "ingestion_rate_limit_buckets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "tokens" DOUBLE PRECISION NOT NULL,
    "lastRefillAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_rate_limit_buckets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ingestion_rate_limit_buckets_organization_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "ingestion_rate_limit_buckets_tokens_check" CHECK (((tokens >= (0)::double precision) AND (tokens <= (120)::double precision)))
);

CREATE UNIQUE INDEX "ingestion_rate_limit_buckets_org_key" ON "ingestion_rate_limit_buckets"("organizationId", "keyHash");
CREATE INDEX "ingestion_rate_limit_buckets_updated_at" ON "ingestion_rate_limit_buckets"("updatedAt");

ALTER TABLE "ingestion_rate_limit_buckets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingestion_rate_limit_buckets" FORCE ROW LEVEL SECURITY;

CREATE POLICY "ingestion_rate_limit_select_tenant" ON "ingestion_rate_limit_buckets"
    FOR SELECT TO atlas_app
    USING ("organizationId" = NULLIF(current_setting('app.tenant_id', true), ''));

CREATE POLICY "ingestion_rate_limit_insert_tenant" ON "ingestion_rate_limit_buckets"
    FOR INSERT TO atlas_app
    WITH CHECK ("organizationId" = NULLIF(current_setting('app.tenant_id', true), ''));

CREATE POLICY "ingestion_rate_limit_update_tenant" ON "ingestion_rate_limit_buckets"
    FOR UPDATE TO atlas_app
    USING ("organizationId" = NULLIF(current_setting('app.tenant_id', true), ''))
    WITH CHECK ("organizationId" = NULLIF(current_setting('app.tenant_id', true), ''));

GRANT SELECT, INSERT, UPDATE ON "ingestion_rate_limit_buckets" TO atlas_app;
