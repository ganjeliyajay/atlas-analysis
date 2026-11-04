import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const PERIOD_COUNT = 8;

type Period = "daily" | "weekly" | "monthly";
type Metric = "any_event" | "core_action";

type EventRecord = {
  userId: string | null;
  eventName: string;
  createdAt: Date;
};

function getUtcDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function getUtcWeek(date: Date) {
  const day = getUtcDay(date);
  const dayOfWeek = day.getUTCDay();

  // Monday is the first day of the week
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  day.setUTCDate(day.getUTCDate() - daysSinceMonday);

  return day;
}

function getUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function getBucketStart(date: Date, period: Period) {
  if (period === "daily") return getUtcDay(date);
  if (period === "weekly") return getUtcWeek(date);
  return getUtcMonth(date);
}

function addPeriods(date: Date, count: number, period: Period) {
  const result = new Date(date);

  if (period === "daily") {
    result.setUTCDate(result.getUTCDate() + count);
  } else if (period === "weekly") {
    result.setUTCDate(result.getUTCDate() + count * 7);
  } else {
    result.setUTCMonth(result.getUTCMonth() + count);
  }

  return result;
}

function formatBucket(date: Date, period: Period) {
  if (period === "monthly") {
    return `${date.getUTCFullYear()}-${String(
      date.getUTCMonth() + 1
    ).padStart(2, "0")}`;
  }

  return date.toISOString().slice(0, 10);
}

function isCoreActionEvent(eventName: string) {
  const passiveEvents = [
    "page_view",
    "screen_view",
    "session_start",
    "session_end",
    "heartbeat",
  ];

  return !passiveEvents.includes(eventName.toLowerCase());
}

function getMetricEvents(events: EventRecord[], metric: Metric) {
  if (metric === "any_event") {
    return events;
  }

  return events.filter((event) => isCoreActionEvent(event.eventName));
}

function calculateRetention(
  users: string[],
  userEvents: Map<string, Date[]>,
  periodStart: Date,
  periodEnd: Date
) {
  if (users.length === 0) return null;

  let retainedUsers = 0;

  for (const userId of users) {
    const events = userEvents.get(userId) ?? [];

    const hasActivity = events.some(
      (eventDate) => eventDate >= periodStart && eventDate < periodEnd
    );

    if (hasActivity) {
      retainedUsers++;
    }
  }

  return {
    retainedUsers,
    percentage: Number(((retainedUsers / users.length) * 100).toFixed(2)),
  };
}

export const GET = auth(async function GET(request) {
  try {
    const authUserId = request.auth?.user?.id;

    if (!authUserId) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { userId: authUserId },
      select: { organizationId: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, message: "Organization not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);

    const projectId = searchParams.get("projectId");
    const periodParam = searchParams.get("period") ?? "weekly";
    const metricParam = searchParams.get("metric") ?? "any_event";

    const period: Period =
      periodParam === "daily" ||
      periodParam === "weekly" ||
      periodParam === "monthly"
        ? periodParam
        : "weekly";

    const metric: Metric =
      metricParam === "core_action" ? "core_action" : "any_event";

    const now = new Date();

    const startParam = searchParams.get("startDate");
    const endParam = searchParams.get("endDate");

    const startDate = startParam
      ? new Date(startParam)
      : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const endDate = endParam ? new Date(endParam) : now;

    // If endDate is supplied as YYYY-MM-DD, include the full UTC day.
    if (endParam && /^\d{4}-\d{2}-\d{2}$/.test(endParam)) {
      endDate.setUTCHours(23, 59, 59, 999);
    }

    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      startDate > endDate
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid date range" },
        { status: 400 }
      );
    }

    // Verify project belongs to the user's organization.
    if (projectId && projectId !== "All") {
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          organizationId: membership.organizationId,
        },
        select: { id: true },
      });

      if (!project) {
        return NextResponse.json(
          { success: false, message: "Project not found" },
          { status: 404 }
        );
      }
    }

    const projectFilter = {
      project: {
        organizationId: membership.organizationId,
      },
      ...(projectId && projectId !== "All" ? { projectId } : {}),
    };

    /*
     * Fetch all historical identified events in the organization/project.
     *
     * Important:
     * We need historical events to determine each user's first activity.
     * The requested date range is applied to cohorts after first activity
     * has been calculated.
     */
    const rawEvents = await prisma.analyticsEvent.findMany({
      where: {
        ...projectFilter,
        userId: { not: null },
      },
      select: {
        userId: true,
        eventName: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const events = getMetricEvents(rawEvents, metric) as EventRecord[];

    // userId -> all event timestamps
    const userEvents = new Map<string, Date[]>();

    // userId -> first activity timestamp
    const firstSeen = new Map<string, Date>();

    for (const event of events) {
      if (!event.userId) continue;

      const timestamps = userEvents.get(event.userId) ?? [];
      timestamps.push(event.createdAt);
      userEvents.set(event.userId, timestamps);

      if (!firstSeen.has(event.userId)) {
        firstSeen.set(event.userId, event.createdAt);
      }
    }

    // Cohort users are users whose first activity falls within the range.
    const cohortUsers = new Map<string, string[]>();

    for (const [userId, firstActivity] of firstSeen.entries()) {
      if (firstActivity < startDate || firstActivity > endDate) {
        continue;
      }

      const bucket = getBucketStart(firstActivity, period);
      const bucketKey = formatBucket(bucket, period);

      const users = cohortUsers.get(bucketKey) ?? [];
      users.push(userId);

      cohortUsers.set(bucketKey, users);
    }

    const sortedCohorts = Array.from(cohortUsers.entries()).sort(
      ([a], [b]) => a.localeCompare(b)
    );

    const cohorts = sortedCohorts.map(([cohortDate, users]) => {
      const bucketStart = new Date(`${cohortDate}T00:00:00.000Z`);

      const periods: (number | null)[] = [];
      const retainedCounts: (number | null)[] = [];

      for (let index = 0; index < PERIOD_COUNT; index++) {
        const targetStart = addPeriods(bucketStart, index, period);
        const targetEnd = addPeriods(bucketStart, index + 1, period);

        // Period 0 is the cohort's first activity period.
        if (index === 0) {
          periods.push(100);
          retainedCounts.push(users.length);
          continue;
        }

        // Avoid showing incomplete periods as 0% retention.
        if (targetEnd > now) {
          periods.push(null);
          retainedCounts.push(null);
          continue;
        }

        const result = calculateRetention(
          users,
          userEvents,
          targetStart,
          targetEnd
        );

        periods.push(result?.percentage ?? 0);
        retainedCounts.push(result?.retainedUsers ?? 0);
      }

      return {
        cohortDate,
        totalUsers: users.length,
        periods,
        retainedCounts,
      };
    });

    // Calculate KPI retention for a specific period offset.
    function calculateKpi(offset: number) {
      const eligibleUsers: string[] = [];

      for (const [userId, firstActivity] of firstSeen.entries()) {
        if (firstActivity < startDate || firstActivity > endDate) {
          continue;
        }

        const cohortStart = getBucketStart(firstActivity, period);
        const targetEnd = addPeriods(cohortStart, offset + 1, period);

        // Only include fully completed target periods.
        if (targetEnd <= now) {
          eligibleUsers.push(userId);
        }
      }

      if (eligibleUsers.length === 0) return 0;

      let retainedUsers = 0;

      for (const userId of eligibleUsers) {
        const firstActivity = firstSeen.get(userId)!;
        const cohortStart = getBucketStart(firstActivity, period);

        const targetStart = addPeriods(cohortStart, offset, period);
        const targetEnd = addPeriods(cohortStart, offset + 1, period);

        const userActivity = userEvents.get(userId) ?? [];

        const returned = userActivity.some(
          (eventDate) =>
            eventDate >= targetStart && eventDate < targetEnd
        );

        if (returned) retainedUsers++;
      }

      return Number(
        ((retainedUsers / eligibleUsers.length) * 100).toFixed(2)
      );
    }

    // Aggregate the retention curve, weighted by cohort size.
    const retentionCurve = Array.from(
      { length: PERIOD_COUNT },
      (_, index) => {
        let totalUsers = 0;
        let retainedUsers = 0;

        for (const cohort of cohorts) {
          const count = cohort.retainedCounts[index];

          if (count === null || count === undefined) continue;

          totalUsers += cohort.totalUsers;
          retainedUsers += count;
        }

        const value =
          totalUsers === 0
            ? 0
            : Number(((retainedUsers / totalUsers) * 100).toFixed(2));

        return {
          label:
            period === "daily"
              ? `Day ${index}`
              : period === "weekly"
                ? `Week ${index}`
                : `Month ${index}`,
          date: index.toString(),
          value,
        };
      }
    );

    const averageCohortSize =
      cohorts.length === 0
        ? 0
        : Number(
            (
              cohorts.reduce((sum, cohort) => sum + cohort.totalUsers, 0) /
              cohorts.length
            ).toFixed(2)
          );

    return NextResponse.json({
      success: true,
      data: {
        kpis: {
          day1Retention: calculateKpi(1),
          week1Retention: calculateKpi(1),
          week4Retention: calculateKpi(4),
          averageCohortSize,
        },
        retentionCurve,
        cohorts,
        summary: {
          totalCohorts: cohorts.length,
          totalUsers: cohorts.reduce(
            (sum, cohort) => sum + cohort.totalUsers,
            0
          ),
          period,
          metric,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        metricDefinition:
          metric === "core_action"
            ? "Core Action excludes passive events such as page_view, screen_view, session_start, session_end, and heartbeat."
            : "Any Event includes all identified-user events.",
      },
    });
  } catch (error) {
    console.error("Retention analytics error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch retention analytics",
      },
      { status: 500 }
    );
  }
});