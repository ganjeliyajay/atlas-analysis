-- CreateTable
CREATE TABLE "ingestion_idempotency_keys" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "response" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingestion_idempotency_keys_expiresAt_idx" ON "ingestion_idempotency_keys"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_idempotency_keys_projectId_key_key" ON "ingestion_idempotency_keys"("projectId", "key");

-- AddForeignKey
ALTER TABLE "ingestion_idempotency_keys" ADD CONSTRAINT "ingestion_idempotency_keys_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
