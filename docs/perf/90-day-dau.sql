-- Set the organization id in psql before running:
--   \set organization_id 'YOUR_ORGANIZATION_ID'
-- Run after seed and rollup:
EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT TEXT)
SELECT "bucketStart", "uniqueUsers" AS dau
FROM event_daily_rollups
WHERE "organizationId" = :'organization_id'
  AND "eventName" = '__all__'
  AND "bucketStart" >= (CURRENT_DATE - INTERVAL '89 days')::date
  AND "bucketStart" < (CURRENT_DATE + INTERVAL '1 day')::date
ORDER BY "bucketStart";
