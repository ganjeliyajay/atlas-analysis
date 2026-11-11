
import { prismaOps } from "@/lib/prisma-ops";

export interface RollupResult {
  hourlyBucketsRebuilt: number;
  dailyBucketsRebuilt: number;
  hourlyFrom: string;
  dailyFrom: string;
}

/**
 * Rebuilds a bounded, overlapping window so late-arriving events
 * are included.
 *
 * Delete + insert happens in one transaction, making reruns
 * deterministic.
 *
 * Bucket timezone is UTC.
 * Hourly rollups cover the last 72 hours.
 * Daily rollups cover the last 90 days.
 */
export async function rebuildEventRollups(
  now = new Date(),
): Promise<RollupResult> {
  const hourlyFrom = new Date(now);
  hourlyFrom.setUTCHours(
    hourlyFrom.getUTCHours() - 72,
    0,
    0,
    0,
  );

  const dailyFrom = new Date(now);
  dailyFrom.setUTCDate(dailyFrom.getUTCDate() - 90);
  dailyFrom.setUTCHours(0, 0, 0, 0);

  const result = await prismaOps.$transaction(
    async (tx) => {
      // Prevent overlapping rollup jobs.
      // PostgreSQL transaction-level advisory lock.
      await tx.$queryRaw<{ lock_acquired: number }[]>`
        WITH lock_result AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(
            0,
            hashtext('atlas_event_rollups')
          )
        )
        SELECT 1::int AS lock_acquired
        FROM lock_result
      `;

      // ==========================================
      // HOURLY ROLLUPS
      // ==========================================

      await tx.$executeRaw`
        DELETE FROM event_hourly_rollups
        WHERE "bucketStart" >= ${hourlyFrom}
      `;

      await tx.$executeRaw`
        INSERT INTO event_hourly_rollups (
          "organizationId",
          "bucketStart",
          "eventName",
          "eventCount",
          "uniqueUsers",
          "uniqueSessions",
          "updatedAt"
        )
        SELECT
          p."organizationId",
          date_trunc('hour', e."createdAt"),
          e."eventName",
          COUNT(*)::bigint,
          COUNT(DISTINCT e."userId")::bigint,
          COUNT(DISTINCT e."sessionId")::bigint,
          NOW()
        FROM "AnalyticsEvent" e
        JOIN "Project" p
          ON p."id" = e."projectId"
        WHERE e."createdAt" >= ${hourlyFrom}
        GROUP BY
          p."organizationId",
          date_trunc('hour', e."createdAt"),
          e."eventName"

        UNION ALL

        SELECT
          p."organizationId",
          date_trunc('hour', e."createdAt"),
          '__all__',
          COUNT(*)::bigint,
          COUNT(DISTINCT e."userId")::bigint,
          COUNT(DISTINCT e."sessionId")::bigint,
          NOW()
        FROM "AnalyticsEvent" e
        JOIN "Project" p
          ON p."id" = e."projectId"
        WHERE e."createdAt" >= ${hourlyFrom}
        GROUP BY
          p."organizationId",
          date_trunc('hour', e."createdAt")
      `;

      // ==========================================
      // DAILY ROLLUPS
      // ==========================================

      await tx.$executeRaw`
        DELETE FROM event_daily_rollups
        WHERE "bucketStart" >= ${dailyFrom}::date
      `;

      await tx.$executeRaw`
        INSERT INTO event_daily_rollups (
          "organizationId",
          "bucketStart",
          "eventName",
          "eventCount",
          "uniqueUsers",
          "uniqueSessions",
          "updatedAt"
        )
        SELECT
          p."organizationId",
          date_trunc('day', e."createdAt")::date,
          e."eventName",
          COUNT(*)::bigint,
          COUNT(DISTINCT e."userId")::bigint,
          COUNT(DISTINCT e."sessionId")::bigint,
          NOW()
        FROM "AnalyticsEvent" e
        JOIN "Project" p
          ON p."id" = e."projectId"
        WHERE e."createdAt" >= ${dailyFrom}
        GROUP BY
          p."organizationId",
          date_trunc('day', e."createdAt")::date,
          e."eventName"

        UNION ALL

        SELECT
          p."organizationId",
          date_trunc('day', e."createdAt")::date,
          '__all__',
          COUNT(*)::bigint,
          COUNT(DISTINCT e."userId")::bigint,
          COUNT(DISTINCT e."sessionId")::bigint,
          NOW()
        FROM "AnalyticsEvent" e
        JOIN "Project" p
          ON p."id" = e."projectId"
        WHERE e."createdAt" >= ${dailyFrom}
        GROUP BY
          p."organizationId",
          date_trunc('day', e."createdAt")::date
      `;

      // ==========================================
      // COUNT REBUILT BUCKETS
      // ==========================================

      const hourly = await tx.$queryRaw<
        { count: bigint }[]
      >`
        SELECT COUNT(*)::bigint AS count
        FROM event_hourly_rollups
        WHERE "bucketStart" >= ${hourlyFrom}
      `;

      const daily = await tx.$queryRaw<
        { count: bigint }[]
      >`
        SELECT COUNT(*)::bigint AS count
        FROM event_daily_rollups
        WHERE "bucketStart" >= ${dailyFrom}::date
      `;

      return {
        hourlyBucketsRebuilt: Number(
          hourly[0]?.count ?? 0,
        ),
        dailyBucketsRebuilt: Number(
          daily[0]?.count ?? 0,
        ),
      };
    },
    {
      maxWait: 10_000,
      timeout: 300_000,
    },
  );

  return {
    ...result,
    hourlyFrom: hourlyFrom.toISOString(),
    dailyFrom: dailyFrom.toISOString(),
  };
}
