import { auth } from "@/auth";
import { getActiveOrganizationForUser } from "@/lib/organization";
import { withTenantContext } from "@/lib/db-context";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  buildRetentionCohorts,
  summarizeRetention,
} from "@/lib/analytics/retention-utils";
import { NextResponse } from "next/server";
import { z } from "zod";

const PERIOD_COUNT = 8;

type Period = "daily" | "weekly" | "monthly";
type Metric = "any_event" | "core_action";

type RetentionRow = {
  cohortStart: string;
  periodIndex: number;
  totalUsers: bigint;
  retainedUsers: bigint;
};

const retentionQuerySchema = z.object({
  projectId: z.string().max(100).default("All"),
  period: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  metric: z.enum(["any_event", "core_action"]).default("any_event"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must use YYYY-MM-DD format").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must use YYYY-MM-DD format").optional(),
}).refine(
  (data) => {
    if (Boolean(data.startDate) !== Boolean(data.endDate)) {
      return false;
    }
    return true;
  },
  {
    message: "Both startDate and endDate are required when specifying custom dates.",
    path: ["startDate"],
  }
);

function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Date must use YYYY-MM-DD format.");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError("Date is not a valid calendar date.");
  }

  return parsed;
}

function emptyRetention(period: Period, metric: Metric, startDate: Date, endDate: Date) {
  return {
    kpis: {
      period1Retention: 0,
      period2Retention: 0,
      period4Retention: 0,
      averageCohortSize: 0,
    },
    retentionCurve: Array.from({ length: PERIOD_COUNT }, (_, index) => ({
      label: period === "daily" ? `Day ${index}` : period === "weekly" ? `Week ${index}` : `Month ${index}`,
      date: String(index),
      value: 0,
    })),
    cohorts: [],
    summary: {
      totalCohorts: 0,
      totalUsers: 0,
      period,
      metric,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    metricDefinition: metric === "core_action"
      ? "Core Action excludes passive events such as page_view, screen_view, session_start, session_end, and heartbeat."
      : "Any Event includes all identified-user events.",
  };
}

export const GET = auth(async function GET(request) {
  try {
    const authUserId = request.auth?.user?.id;
    if (!authUserId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawQuery: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      rawQuery[key] = val;
    });

    const parsedQuery = retentionQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return NextResponse.json({
        success: false,
        message: parsedQuery.error.issues[0]?.message || "Invalid retention query parameters.",
      }, { status: 400 });
    }

    const { projectId, period, metric, startDate: startParam, endDate: endParam } = parsedQuery.data;

    const membership = await getActiveOrganizationForUser(authUserId);

    if (!membership) {
      return NextResponse.json({ success: false, message: "Organization not found" }, { status: 404 });
    }

    const now = new Date();
    let startDate: Date;
    let endExclusive: Date;
    try {
      startDate = startParam
        ? parseDateOnly(startParam)
        : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      endExclusive = endParam
        ? parseDateOnly(endParam)
        : now;
      if (endParam) endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    } catch (error) {
      return NextResponse.json({
        success: false,
        message: error instanceof Error ? error.message : "Invalid date range.",
      }, { status: 400 });
    }

    if (startDate >= endExclusive) {
      return NextResponse.json({ success: false, message: "startDate must be on or before endDate." }, { status: 400 });
    }

    return await withTenantContext(authUserId, membership.organizationId, async (tx) => {
      const projects = await tx.project.findMany({
        where: {
          organizationId: membership.organizationId,
          ...(projectId !== "All" ? { id: projectId } : {}),
        },
        select: { id: true },
      });
      const projectIds = projects.map((project) => project.id);

      if (projectId !== "All" && projectIds.length === 0) {
        return NextResponse.json({ success: false, message: "Project not found." }, { status: 404 });
      }

      if (projectIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: emptyRetention(period, metric, startDate, new Date(endExclusive.getTime() - 1)),
        });
      }

      const passiveEventFilter = metric === "core_action"
        ? Prisma.sql`AND "eventName" NOT IN ('page_view', 'screen_view', 'session_start', 'session_end', 'heartbeat')`
        : Prisma.empty;

      const truncUnit = period === "daily" ? "day" : period === "weekly" ? "week" : "month";

      // Canonical signup-based retention cohort pipeline
      const rows = await tx.$queryRaw<RetentionRow[]>(Prisma.sql`
        WITH scoped_events AS MATERIALIZED (
          SELECT
            "userId",
            "eventName",
            "createdAt" AS event_at
          FROM "AnalyticsEvent"
          WHERE "projectId" IN (${Prisma.join(projectIds)})
            AND "userId" IS NOT NULL
            ${passiveEventFilter}
        ),
        signup_activity AS (
          SELECT
            "userId",
            MIN(event_at) AS signup_at
          FROM scoped_events
          WHERE "eventName" IN ('signup_completed', 'signup', 'user_signup', 'registered', '$signup', 'sign_up')
          GROUP BY "userId"
        ),
        cohort_users AS (
          SELECT
            "userId",
            date_trunc(${truncUnit}, signup_at) AS cohort_start,
            signup_at
          FROM signup_activity
          WHERE signup_at >= ${startDate}::timestamp
            AND signup_at < ${endExclusive}::timestamp
        ),
        cohort_sizes AS (
          SELECT cohort_start, COUNT(*)::bigint AS total_users
          FROM cohort_users
          GROUP BY cohort_start
        ),
        period_activity AS (
          SELECT
            cu.cohort_start,
            CASE
              WHEN ${period} = 'daily' THEN
                (date_trunc('day', e.event_at)::date - cu.cohort_start::date)::int
              WHEN ${period} = 'weekly' THEN
                ((date_trunc('week', e.event_at)::date - cu.cohort_start::date) / 7)::int
              ELSE
                (
                  (EXTRACT(YEAR FROM date_trunc('month', e.event_at)) - EXTRACT(YEAR FROM cu.cohort_start)) * 12
                  + EXTRACT(MONTH FROM date_trunc('month', e.event_at))
                  - EXTRACT(MONTH FROM cu.cohort_start)
                )::int
            END AS period_index,
            COUNT(DISTINCT cu."userId")::bigint AS retained_users
          FROM cohort_users cu
          INNER JOIN scoped_events e ON e."userId" = cu."userId"
          WHERE e.event_at >= cu.signup_at
            AND e.event_at < CASE
              WHEN ${period} = 'daily' THEN cu.cohort_start + INTERVAL '8 days'
              WHEN ${period} = 'weekly' THEN cu.cohort_start + INTERVAL '56 days'
              ELSE cu.cohort_start + INTERVAL '8 months'
            END
          GROUP BY cu.cohort_start, period_index
        )
        SELECT
          grid.cohort_start::text AS "cohortStart",
          grid.period_index AS "periodIndex",
          grid.total_users AS "totalUsers",
          COALESCE(activity.retained_users, 0)::bigint AS "retainedUsers"
        FROM (
          SELECT
            sizes.cohort_start,
            sizes.total_users,
            generate_series(0, ${PERIOD_COUNT - 1}) AS period_index
          FROM cohort_sizes sizes
        ) grid
        LEFT JOIN period_activity activity
          ON activity.cohort_start = grid.cohort_start
          AND activity.period_index = grid.period_index
        ORDER BY grid.cohort_start ASC, grid.period_index ASC
      `);

      const cohortsWithCounts = buildRetentionCohorts(rows, period, now, PERIOD_COUNT);
      const aggregate = summarizeRetention(cohortsWithCounts, period, PERIOD_COUNT);
      const cohorts = cohortsWithCounts.map(({ cohortDate, totalUsers, periods }) => ({
        cohortDate,
        totalUsers,
        periods,
      }));

      return NextResponse.json({
        success: true,
        data: {
          kpis: {
            period1Retention: aggregate.period1Retention,
            period2Retention: aggregate.period2Retention,
            period4Retention: aggregate.period4Retention,
            averageCohortSize: aggregate.averageCohortSize,
          },
          retentionCurve: aggregate.retentionCurve,
          cohorts,
          summary: {
            totalCohorts: cohorts.length,
            totalUsers: aggregate.totalUsers,
            period,
            metric,
            startDate: startDate.toISOString(),
            endDate: new Date(endExclusive.getTime() - 1).toISOString(),
          },
          metricDefinition: metric === "core_action"
            ? "Core Action excludes passive events such as page_view, screen_view, session_start, session_end, and heartbeat."
            : "Any Event includes all identified-user events.",
        },
      });
    });
  } catch (error) {
    console.error("Retention analytics API error:", error);
    return NextResponse.json({ success: false, message: "Failed to calculate retention analytics" }, { status: 500 });
  }
});
