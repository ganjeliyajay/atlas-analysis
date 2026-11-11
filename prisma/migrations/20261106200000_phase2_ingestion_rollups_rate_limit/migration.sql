-- Persistent tenant-scoped token buckets. A token represents one event.
CREATE TABLE "ingestion_token_buckets" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "tokens" NUMERIC(20,6) NOT NULL,
  "lastRefillAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ingestion_token_buckets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ingestion_token_buckets_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ingestion_token_buckets_organizationId_keyHash_key"
  ON "ingestion_token_buckets" ("organizationId", "keyHash");
CREATE INDEX "ingestion_token_buckets_updatedAt_idx"
  ON "ingestion_token_buckets" ("updatedAt");

ALTER TABLE "ingestion_token_buckets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingestion_token_buckets" FORCE ROW LEVEL SECURITY;
CREATE POLICY ingestion_token_buckets_tenant_policy
  ON "ingestion_token_buckets"
  FOR ALL TO atlas_app
  USING (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "ingestion_token_buckets" TO atlas_app;

-- SECURITY INVOKER keeps the tenant RLS policy in force. The function also
-- verifies the explicit organization argument against transaction-local context.
CREATE OR REPLACE FUNCTION public.consume_ingestion_tokens(
  p_organization_id TEXT,
  p_key_hash TEXT,
  p_capacity NUMERIC,
  p_refill_per_second NUMERIC,
  p_requested NUMERIC
)
RETURNS TABLE(allowed BOOLEAN, remaining NUMERIC, retry_after_seconds INTEGER)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now TIMESTAMP(3) := clock_timestamp()::TIMESTAMP(3);
  v_tokens NUMERIC;
  v_last TIMESTAMP(3);
  v_refilled NUMERIC;
  v_wait NUMERIC;
BEGIN
  IF p_organization_id IS NULL OR p_organization_id = ''
     OR p_key_hash IS NULL OR p_key_hash = ''
     OR p_capacity IS NULL OR p_capacity <= 0
     OR p_refill_per_second IS NULL OR p_refill_per_second <= 0
     OR p_requested IS NULL OR p_requested <= 0 OR p_requested > p_capacity THEN
    RAISE EXCEPTION 'Invalid token bucket parameters'
      USING ERRCODE = '22023';
  END IF;

  IF p_organization_id IS DISTINCT FROM
     NULLIF(current_setting('app.tenant_id', true), '') THEN
    RAISE EXCEPTION 'Tenant context mismatch'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ingestion_token_buckets
    ("id", "organizationId", "keyHash", "tokens", "lastRefillAt", "createdAt", "updatedAt")
  VALUES
    (gen_random_uuid()::TEXT, p_organization_id, p_key_hash,
     p_capacity, v_now, v_now, v_now)
  ON CONFLICT ("organizationId", "keyHash") DO NOTHING;

  SELECT b."tokens", b."lastRefillAt"
    INTO v_tokens, v_last
    FROM public.ingestion_token_buckets b
    WHERE b."organizationId" = p_organization_id
      AND b."keyHash" = p_key_hash
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rate limit bucket could not be created';
  END IF;

  v_refilled := LEAST(
    p_capacity,
    v_tokens + GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_last))) * p_refill_per_second
  );

  IF v_refilled >= p_requested THEN
    v_tokens := v_refilled - p_requested;
    allowed := TRUE;
    retry_after_seconds := 0;
  ELSE
    v_tokens := v_refilled;
    allowed := FALSE;
    v_wait := CEIL((p_requested - v_refilled) / p_refill_per_second);
    retry_after_seconds := GREATEST(1, v_wait::INTEGER);
  END IF;

  UPDATE public.ingestion_token_buckets
    SET "tokens" = v_tokens, "lastRefillAt" = v_now, "updatedAt" = v_now
    WHERE "organizationId" = p_organization_id
      AND "keyHash" = p_key_hash;

  remaining := v_tokens;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ingestion_tokens(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_ingestion_tokens(TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC)
  TO atlas_app;


-- Organization-level rollups keep DAU exact across all projects in a tenant.
CREATE TABLE event_hourly_rollups (
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "bucketStart" TIMESTAMP(6) NOT NULL,
  "eventName" TEXT NOT NULL,
  "eventCount" BIGINT NOT NULL,
  "uniqueUsers" BIGINT NOT NULL,
  "uniqueSessions" BIGINT NOT NULL,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("organizationId", "bucketStart", "eventName")
);
CREATE INDEX event_hourly_rollups_bucket_idx
  ON event_hourly_rollups ("bucketStart");

CREATE TABLE event_daily_rollups (
  "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "bucketStart" DATE NOT NULL,
  "eventName" TEXT NOT NULL,
  "eventCount" BIGINT NOT NULL,
  "uniqueUsers" BIGINT NOT NULL,
  "uniqueSessions" BIGINT NOT NULL,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("organizationId", "bucketStart", "eventName")
);
CREATE INDEX event_daily_rollups_bucket_idx
  ON event_daily_rollups ("bucketStart");
