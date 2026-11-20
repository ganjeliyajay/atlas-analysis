-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_projectId_eventName_userId_createdAt_idx" ON "AnalyticsEvent"("projectId", "eventName", "userId", "createdAt");
