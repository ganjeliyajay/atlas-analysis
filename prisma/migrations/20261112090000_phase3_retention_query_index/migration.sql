-- Build without blocking normal event ingestion writes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AnalyticsEvent_projectId_userId_createdAt_idx"
ON "AnalyticsEvent" ("projectId", "userId", "createdAt");
