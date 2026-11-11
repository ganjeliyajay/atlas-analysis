import { withIngestionTenantContext } from "@/lib/db-context";

const DEFAULT_CAPACITY = 10_000;
const DEFAULT_REFILL_PER_SECOND = 200;

export interface RateLimitOptions {
  organizationId: string;
  key: string;
  requestedTokens?: number;
  capacity?: number;
  refillPerSecond?: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfterSeconds: number;
}

interface TokenBucketRow {
  allowed: boolean;
  remaining: string | number;
  retry_after_seconds: number;
}

/**
 * PostgreSQL token bucket scoped by the same transaction-local tenant context
 * as ingestion writes. One token is consumed per event in the validated batch.
 */
export async function checkRateLimit({
  organizationId,
  key,
  requestedTokens = 1,
  capacity = DEFAULT_CAPACITY,
  refillPerSecond = DEFAULT_REFILL_PER_SECOND,
}: RateLimitOptions): Promise<RateLimitResult> {
  if (
    !organizationId.trim() ||
    !key.trim() ||
    !Number.isInteger(requestedTokens) ||
    requestedTokens < 1
  ) {
    throw new Error("Invalid rate limit request");
  }

  const rows: TokenBucketRow[] = await withIngestionTenantContext(organizationId, (tx) =>
    tx.$queryRaw<TokenBucketRow[]>`
      SELECT *
      FROM consume_ingestion_tokens(
        ${organizationId},
        ${key},
        ${capacity},
        ${refillPerSecond},
        ${requestedTokens}
      )
    `,
  );

  const row = rows[0];
  if (!row) {
    throw new Error("Token bucket did not return a result");
  }

  const remaining = Number(row.remaining);
  const retryAfterSeconds = Number(row.retry_after_seconds);
  const reset = Math.ceil(Date.now() / 1000) +
    (row.allowed
      ? Math.ceil((capacity - remaining) / refillPerSecond)
      : retryAfterSeconds);

  return {
    success: row.allowed,
    limit: capacity,
    remaining: Math.max(0, Math.floor(remaining)),
    reset,
    retryAfterSeconds,
  };
}
