-- The existing AnalyticsEvent.createdAt column is timestamp without time zone; store it as UTC.
ALTER ROLE atlas_app SET timezone = 'UTC';

-- Tenant-safe reads for rollups plus indexes supporting bounded raw-event aggregation.
ALTER TABLE event_hourly_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_hourly_rollups FORCE ROW LEVEL SECURITY;
CREATE POLICY event_hourly_rollups_tenant_policy ON event_hourly_rollups TO atlas_app
  USING (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

ALTER TABLE event_daily_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_daily_rollups FORCE ROW LEVEL SECURITY;
CREATE POLICY event_daily_rollups_tenant_policy ON event_daily_rollups TO atlas_app
  USING (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
  )
  WITH CHECK (
    "organizationId" = NULLIF(current_setting('app.tenant_id', true), '')
  );

CREATE INDEX "event_daily_rollups_organization_event_bucket_idx"
  ON event_daily_rollups ("organizationId", "eventName", "bucketStart")
  INCLUDE ("uniqueUsers", "eventCount");
CREATE INDEX "event_hourly_rollups_organization_event_bucket_idx"
  ON event_hourly_rollups ("organizationId", "eventName", "bucketStart")
  INCLUDE ("uniqueUsers", "eventCount");

-- Tenant application role may read rollups only; the scheduled job writes
-- through the operations connection.
GRANT SELECT ON event_hourly_rollups, event_daily_rollups TO atlas_app;
