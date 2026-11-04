-- CreateTable
CREATE TABLE "ingestion_error_logs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "errorCode" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'POST',
    "endpoint" TEXT NOT NULL DEFAULT '/api/events',
    "apiKeyHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingestion_error_logs_createdAt_idx" ON "ingestion_error_logs"("createdAt");

-- CreateIndex
CREATE INDEX "ingestion_error_logs_projectId_createdAt_idx" ON "ingestion_error_logs"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ingestion_error_logs_errorCode_createdAt_idx" ON "ingestion_error_logs"("errorCode", "createdAt");
