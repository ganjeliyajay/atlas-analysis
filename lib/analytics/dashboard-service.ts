import { withTenantContext } from "@/lib/db-context";
import { getActiveOrganizationForUser } from "@/lib/organization";
import { formatUtcNaiveTimestamp, normalizeUtcNaiveTimestamp } from "@/lib/analytics/date-utils";
import { Prisma } from "@/lib/generated/prisma/client";
import { DateRangeOption } from "@/types/analytics";

export type Range = "today" | "7d" | "30d" | "90d" | "custom";

export function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Date must use YYYY-MM-DD format");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError("Date is not a valid calendar date");
  }

  return parsed;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function getRangeStart(range: Range): Date {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

  switch (range) {
    case "today":
      start.setUTCHours(0, 0, 0, 0);
      break;
    case "7d":
      start.setUTCDate(start.getUTCDate() - 6);
      break;
    case "30d":
      start.setUTCDate(start.getUTCDate() - 29);
      break;
    case "90d":
      start.setUTCDate(start.getUTCDate() - 89);
      break;
    case "custom":
      start.setUTCDate(start.getUTCDate() - 29);
      break;
  }

  return start;
}

export function getPreviousRangeStart(startDate: Date, range: Range): Date {
  const previousStart = new Date(startDate);

  switch (range) {
    case "today":
      previousStart.setUTCHours(previousStart.getUTCHours() - 24);
      break;
    case "7d":
      previousStart.setUTCDate(previousStart.getUTCDate() - 7);
      break;
    case "30d":
      previousStart.setUTCDate(previousStart.getUTCDate() - 30);
      break;
    case "90d":
      previousStart.setUTCDate(previousStart.getUTCDate() - 90);
      break;
    case "custom":
      previousStart.setUTCDate(previousStart.getUTCDate() - 30);
      break;
  }

  return previousStart;
}

export function getPercentageChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
}

export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
}

export type DashboardDataResult = {
  range: DateRangeOption;
  filters: {
    projectId: string;
    eventName: string;
    userId: string;
    startDate: string;
    endDate: string;
  };
  kpis: {
    totalEvents: number;
    activeUsers: number;
    dau: number;
    wau: number;
    mau: number;
  };
  changes: {
    totalEvents: number | null;
    activeUsers: number | null;
  };
  topEvents: {
    name: string;
    count: number;
    percentage: number;
  }[];
  eventsOverTime: {
    date: string;
    eventVolume: number;
  }[];
  activeUsersOverTime: {
    date: string;
    activeUsers: number;
  }[];
  recentEvents: {
    id: string;
    name: string;
    userId: string | null;
    projectName: string;
    timestamp: string;
    relativeTime: string;
  }[];
};

export function emptyAnalytics(
  range: Range,
  projectId = "All",
  eventName = "",
  userId = "",
  startDate = getRangeStart(range),
  endDate = new Date(),
): DashboardDataResult {

  return {
    range: range as DateRangeOption,
    filters: {
      projectId,
      eventName,
      userId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    kpis: {
      totalEvents: 0,
      activeUsers: 0,
      dau: 0,
      wau: 0,
      mau: 0,
    },
    changes: {
      totalEvents: null,
      activeUsers: null,
    },
    topEvents: [],
    eventsOverTime: [],
    activeUsersOverTime: [],
    recentEvents: [],
  };
}

export type DashboardServiceParams = {
  authUserId: string;
  range?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  projectId?: string | null;
  eventName?: string | null;
  userId?: string | null;
};

export async function getDashboardData(
  params: DashboardServiceParams
): Promise<{ status: 200; data: DashboardDataResult } | { status: 400 | 404; error: string }> {
  const { authUserId } = params;

  const membership = await getActiveOrganizationForUser(authUserId);

  if (!membership) {
    return { status: 404, error: "Organization not found" };
  }

  const rangeParam = params.range || "30d";
  if (!["today", "7d", "30d", "90d", "custom"].includes(rangeParam)) {
    return { status: 400, error: "Invalid date range" };
  }

  const customStartDate = params.startDate?.trim() || "";
  const customEndDate = params.endDate?.trim() || "";
  if (Boolean(customStartDate) !== Boolean(customEndDate)) {
    return { status: 400, error: "Both startDate and endDate are required" };
  }

  const hasCustomDateRange = Boolean(customStartDate && customEndDate);
  if (rangeParam === "custom" && !hasCustomDateRange) {
    return { status: 400, error: "Custom date range requires startDate and endDate" };
  }

  const range: Range = hasCustomDateRange ? "custom" : rangeParam as Range;
  let customStart: Date | null = null;
  let customEndExclusive: Date | null = null;
  if (hasCustomDateRange) {
    try {
      const parsedStart = parseDateOnly(customStartDate);
      const parsedEndExclusive = addDays(parseDateOnly(customEndDate), 1);
      if (parsedStart.getTime() >= parsedEndExclusive.getTime()) {
        return { status: 400, error: "startDate must be on or before endDate" };
      }
      customStart = parsedStart;
      customEndExclusive = parsedEndExclusive;
    } catch (error) {
      return {
        status: 400,
        error: error instanceof Error ? error.message : "Invalid date range",
      };
    }
  }

  const requestedProjectId = params.projectId || "All";
  const eventName = (params.eventName || "").trim().slice(0, 200);
  const filterUserId = (params.userId || "").trim().slice(0, 200);

  const result = await withTenantContext(
    authUserId,
    membership.organizationId,
    async (tx) => {
      const organizationProjects = await tx.project.findMany({
        where: { organizationId: membership.organizationId },
        select: { id: true, name: true },
      });

      if (organizationProjects.length === 0) {
        const emptyNow = new Date();
        const emptyStart = customStart ?? getRangeStart(range);
        const emptyEnd = customEndExclusive ?? (range === "today"
          ? emptyNow
          : new Date(Date.UTC(
              emptyNow.getUTCFullYear(),
              emptyNow.getUTCMonth(),
              emptyNow.getUTCDate() + 1,
            )));

        return {
          status: 200 as const,
          data: emptyAnalytics(
            range,
            requestedProjectId,
            eventName,
            filterUserId,
            emptyStart,
            new Date(emptyEnd.getTime() - 1),
          ),
        };
      }

      let projectIds = organizationProjects.map((p) => p.id);
      if (requestedProjectId && requestedProjectId !== "All") {
        const selectedProject = organizationProjects.find((p) => p.id === requestedProjectId);
        if (!selectedProject) {
          return { status: 404 as const, error: "Project not found" };
        }
        projectIds = [selectedProject.id];
      }

      const now = new Date();
      const startDate = customStart ?? getRangeStart(range);
      const todayNextUtcMidnight = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0, 0
      ));
      const endDateExclusive = customEndExclusive ?? (range === "today" ? now : todayNextUtcMidnight);
      const currentDuration = endDateExclusive.getTime() - startDate.getTime();

      const previousStartDate = hasCustomDateRange
        ? new Date(startDate.getTime() - currentDuration)
        : range === "today"
          ? new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
          : getPreviousRangeStart(startDate, range);

      const previousEndDateExclusive =
        range === "today" && !hasCustomDateRange
          ? new Date(previousStartDate.getTime() + currentDuration)
          : startDate;

      const currentWhere: Prisma.AnalyticsEventWhereInput = {
        projectId: { in: projectIds },
        createdAt: { gte: startDate, lt: endDateExclusive },
        ...(eventName ? { eventName: { contains: eventName, mode: "insensitive" } } : {}),
        ...(filterUserId ? { userId: { contains: filterUserId, mode: "insensitive" } } : {}),
      };

      const previousWhere: Prisma.AnalyticsEventWhereInput = {
        projectId: { in: projectIds },
        createdAt: { gte: previousStartDate, lt: previousEndDateExclusive },
        ...(eventName ? { eventName: { contains: eventName, mode: "insensitive" } } : {}),
        ...(filterUserId ? { userId: { contains: filterUserId, mode: "insensitive" } } : {}),
      };

      const isWholeUtcDayRange = [startDate, endDateExclusive].every(
        (date) =>
          date.getUTCHours() === 0 &&
          date.getUTCMinutes() === 0 &&
          date.getUTCSeconds() === 0 &&
          date.getUTCMilliseconds() === 0
      );

      const useDailyRollups =
        !eventName &&
        !filterUserId &&
        requestedProjectId === "All" &&
        isWholeUtcDayRange &&
        endDateExclusive.getTime() - startDate.getTime() <= 91 * 24 * 60 * 60 * 1000;

      const eventNameSql = eventName
        ? Prisma.sql`AND "eventName" ILIKE ${`%${eventName}%`}`
        : Prisma.empty;
      const userIdSql = filterUserId
        ? Prisma.sql`AND "userId" ILIKE ${`%${filterUserId}%`}`
        : Prisma.empty;

      const utcTodayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const sevenDayStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDayStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const userMetricsStart = new Date(Math.min(previousStartDate.getTime(), thirtyDayStart.getTime()));

      const activeUserMetricsQuery = tx.$queryRaw<Array<{
        activeUsers: bigint;
        previousActiveUsers: bigint;
        dau: bigint;
        wau: bigint;
        mau: bigint;
      }>>`
        SELECT
          (COUNT(DISTINCT "userId") FILTER (
            WHERE "createdAt" >= ${startDate} AND "createdAt" < ${endDateExclusive}
          ))::bigint AS "activeUsers",
          (COUNT(DISTINCT "userId") FILTER (
            WHERE "createdAt" >= ${previousStartDate} AND "createdAt" < ${previousEndDateExclusive}
          ))::bigint AS "previousActiveUsers",
          (COUNT(DISTINCT "userId") FILTER (
            WHERE "createdAt" >= ${utcTodayStart}
          ))::bigint AS dau,
          (COUNT(DISTINCT "userId") FILTER (
            WHERE "createdAt" >= ${sevenDayStart}
          ))::bigint AS wau,
          (COUNT(DISTINCT "userId") FILTER (
            WHERE "createdAt" >= ${thirtyDayStart}
          ))::bigint AS mau
        FROM "AnalyticsEvent"
        WHERE "projectId" IN (${Prisma.join(projectIds)})
          AND "createdAt" >= ${userMetricsStart}
          AND "createdAt" < ${now}
          AND "userId" IS NOT NULL
          ${eventNameSql}
          ${userIdSql}
      `;

      const [
        totalEvents,
        previousTotalEvents,
        activeUserMetrics,
        groupedEvents,
        recentEvents,
        dailyEventCounts,
        dailyActiveUserCounts,
      ] = await Promise.all([
        tx.analyticsEvent.count({ where: currentWhere }),
        tx.analyticsEvent.count({ where: previousWhere }),
        activeUserMetricsQuery,
        tx.analyticsEvent.groupBy({
          by: ["eventName"],
          where: currentWhere,
          _count: { _all: true },
        }),
        tx.analyticsEvent.findMany({
          where: currentWhere,
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            eventName: true,
            userId: true,
            createdAt: true,
            project: { select: { name: true } },
          },
        }),
        useDailyRollups
          ? tx.$queryRaw<Array<{ day: string; count: bigint }>>`
              SELECT TO_CHAR("bucketStart", 'YYYY-MM-DD') AS day,
                     SUM("eventCount")::bigint AS count
              FROM event_daily_rollups
              WHERE "organizationId" = ${membership.organizationId}
                AND "eventName" = '__all__'
                AND "bucketStart" >= ${startDate}::date
                AND "bucketStart" < ${endDateExclusive}::date
              GROUP BY "bucketStart"
              ORDER BY day ASC
            `
          : tx.$queryRaw<Array<{ day: string; count: bigint }>>`
              SELECT
                TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS day,
                COUNT(*)::bigint AS count
              FROM "AnalyticsEvent"
              WHERE "projectId" IN (${Prisma.join(projectIds)})
                AND "createdAt" >= ${startDate}
                AND "createdAt" < ${endDateExclusive}
                ${eventNameSql}
                ${userIdSql}
              GROUP BY DATE_TRUNC('day', "createdAt")
              ORDER BY DATE_TRUNC('day', "createdAt") ASC
            `,
        useDailyRollups
          ? tx.$queryRaw<Array<{ day: string; count: bigint }>>`
              SELECT TO_CHAR("bucketStart", 'YYYY-MM-DD') AS day,
                     "uniqueUsers" AS count
              FROM event_daily_rollups
              WHERE "organizationId" = ${membership.organizationId}
                AND "eventName" = '__all__'
                AND "bucketStart" >= ${startDate}::date
                AND "bucketStart" < ${endDateExclusive}::date
              ORDER BY day ASC
            `
          : tx.$queryRaw<Array<{ day: string; count: bigint }>>`
              SELECT
                TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS day,
                COUNT(DISTINCT "userId")::bigint AS count
              FROM "AnalyticsEvent"
              WHERE "projectId" IN (${Prisma.join(projectIds)})
                AND "createdAt" >= ${startDate}
                AND "createdAt" < ${endDateExclusive}
                AND "userId" IS NOT NULL
                ${eventNameSql}
                ${userIdSql}
              GROUP BY DATE_TRUNC('day', "createdAt")
              ORDER BY DATE_TRUNC('day', "createdAt") ASC
            `,
      ]);

      const userMetrics = activeUserMetrics[0];
      const dau = Number(userMetrics?.dau ?? 0);
      const wau = Number(userMetrics?.wau ?? 0);
      const mau = Number(userMetrics?.mau ?? 0);
      const activeUsersCount = Number(userMetrics?.activeUsers ?? 0);
      const previousActiveUsersCount = Number(userMetrics?.previousActiveUsers ?? 0);

      const topEvents = groupedEvents
        .map((e) => ({
          name: e.eventName,
          count: e._count._all,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((e) => ({
          ...e,
          percentage: totalEvents > 0 ? Math.round((e.count / totalEvents) * 100) : 0,
        }));

      const eventsOverTime = dailyEventCounts.map((item) => ({
        date: item.day,
        eventVolume: Number(item.count),
      }));

      const activeUsersOverTime = dailyActiveUserCounts.map((item) => ({
        date: item.day,
        activeUsers: Number(item.count),
      }));

      const formattedRecentEvents = recentEvents.map((e) => ({
        id: e.id,
        name: e.eventName,
        userId: e.userId,
        projectName: e.project.name,
        timestamp: formatUtcNaiveTimestamp(e.createdAt),
        relativeTime: getRelativeTime(normalizeUtcNaiveTimestamp(e.createdAt)),
      }));

      return {
        status: 200 as const,
        data: {
          range: range as DateRangeOption,
          filters: {
            projectId: requestedProjectId,
            eventName,
            userId: filterUserId,
            startDate: startDate.toISOString(),
            endDate: new Date(endDateExclusive.getTime() - 1).toISOString(),
          },
          kpis: {
            totalEvents,
            activeUsers: activeUsersCount,
            dau,
            wau,
            mau,
          },
          changes: {
            totalEvents: getPercentageChange(totalEvents, previousTotalEvents),
            activeUsers: getPercentageChange(activeUsersCount, previousActiveUsersCount),
          },
          topEvents,
          eventsOverTime,
          activeUsersOverTime,
          recentEvents: formattedRecentEvents,
        },
      };
    }
  );

  return result;
}

// ---------------------------------------------------------------------------
// Granular Data Fetching for Dashboard Streaming SSR (Suspense Boundaries)
// ---------------------------------------------------------------------------

type ScopeSuccess = {
  membership: NonNullable<Awaited<ReturnType<typeof getActiveOrganizationForUser>>>;
  range: Range;
  customStart: Date | null;
  customEndExclusive: Date | null;
  hasCustomDateRange: boolean;
  requestedProjectId: string;
  eventName: string;
  filterUserId: string;
};

type BoundsResult =
  | { empty: true; projectNotFound?: false }
  | { projectNotFound: true; empty?: false }
  | {
      empty: false;
      projectNotFound: false;
      projectIds: string[];
      now: Date;
      startDate: Date;
      endDateExclusive: Date;
      previousStartDate: Date;
      previousEndDateExclusive: Date;
      currentWhere: Prisma.AnalyticsEventWhereInput;
      previousWhere: Prisma.AnalyticsEventWhereInput;
      useDailyRollups: boolean;
      eventNameSql: Prisma.Sql;
      userIdSql: Prisma.Sql;
    };

async function resolveScope(params: DashboardServiceParams): Promise<
  | { ok: true; scope: ScopeSuccess }
  | { ok: false; error: { status: 400 | 404; error: string } }
> {
  const { authUserId } = params;
  const membership = await getActiveOrganizationForUser(authUserId);
  if (!membership) {
    return { ok: false, error: { status: 404, error: "Organization not found" } };
  }

  const rangeParam = params.range || "30d";
  if (!["today", "7d", "30d", "90d", "custom"].includes(rangeParam)) {
    return { ok: false, error: { status: 400, error: "Invalid date range" } };
  }

  const customStartDate = params.startDate?.trim() || "";
  const customEndDate = params.endDate?.trim() || "";
  if (Boolean(customStartDate) !== Boolean(customEndDate)) {
    return { ok: false, error: { status: 400, error: "Both startDate and endDate are required" } };
  }

  const hasCustomDateRange = Boolean(customStartDate && customEndDate);
  if (rangeParam === "custom" && !hasCustomDateRange) {
    return { ok: false, error: { status: 400, error: "Custom date range requires startDate and endDate" } };
  }

  const range: Range = hasCustomDateRange ? "custom" : (rangeParam as Range);
  let customStart: Date | null = null;
  let customEndExclusive: Date | null = null;
  if (hasCustomDateRange) {
    try {
      const parsedStart = parseDateOnly(customStartDate);
      const parsedEndExclusive = addDays(parseDateOnly(customEndDate), 1);
      if (parsedStart.getTime() >= parsedEndExclusive.getTime()) {
        return { ok: false, error: { status: 400, error: "startDate must be on or before endDate" } };
      }
      customStart = parsedStart;
      customEndExclusive = parsedEndExclusive;
    } catch (error) {
      return {
        ok: false,
        error: {
          status: 400,
          error: error instanceof Error ? error.message : "Invalid date range",
        },
      };
    }
  }

  const requestedProjectId = params.projectId || "All";
  const eventName = (params.eventName || "").trim().slice(0, 200);
  const filterUserId = (params.userId || "").trim().slice(0, 200);

  return {
    ok: true,
    scope: {
      membership,
      range,
      customStart,
      customEndExclusive,
      hasCustomDateRange,
      requestedProjectId,
      eventName,
      filterUserId,
    },
  };
}

function computeBounds(
  scope: ScopeSuccess,
  organizationProjects: Array<{ id: string; name: string }>
): BoundsResult {
  if (organizationProjects.length === 0) {
    return { empty: true };
  }

  let projectIds = organizationProjects.map((p) => p.id);
  if (scope.requestedProjectId && scope.requestedProjectId !== "All") {
    const selectedProject = organizationProjects.find((p) => p.id === scope.requestedProjectId);
    if (!selectedProject) {
      return { projectNotFound: true };
    }
    projectIds = [selectedProject.id];
  }

  const now = new Date();
  const startDate = scope.customStart ?? getRangeStart(scope.range);
  const todayNextUtcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
  );
  const endDateExclusive = scope.customEndExclusive ?? (scope.range === "today" ? now : todayNextUtcMidnight);
  const currentDuration = endDateExclusive.getTime() - startDate.getTime();

  const previousStartDate = scope.hasCustomDateRange
    ? new Date(startDate.getTime() - currentDuration)
    : scope.range === "today"
      ? new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
      : getPreviousRangeStart(startDate, scope.range);

  const previousEndDateExclusive =
    scope.range === "today" && !scope.hasCustomDateRange
      ? new Date(previousStartDate.getTime() + currentDuration)
      : startDate;

  const currentWhere: Prisma.AnalyticsEventWhereInput = {
    projectId: { in: projectIds },
    createdAt: { gte: startDate, lt: endDateExclusive },
    ...(scope.eventName ? { eventName: { contains: scope.eventName, mode: "insensitive" } } : {}),
    ...(scope.filterUserId ? { userId: { contains: scope.filterUserId, mode: "insensitive" } } : {}),
  };

  const previousWhere: Prisma.AnalyticsEventWhereInput = {
    projectId: { in: projectIds },
    createdAt: { gte: previousStartDate, lt: previousEndDateExclusive },
    ...(scope.eventName ? { eventName: { contains: scope.eventName, mode: "insensitive" } } : {}),
    ...(scope.filterUserId ? { userId: { contains: scope.filterUserId, mode: "insensitive" } } : {}),
  };

  const isWholeUtcDayRange = [startDate, endDateExclusive].every(
    (date) =>
      date.getUTCHours() === 0 &&
      date.getUTCMinutes() === 0 &&
      date.getUTCSeconds() === 0 &&
      date.getUTCMilliseconds() === 0
  );

  const useDailyRollups =
    !scope.eventName &&
    !scope.filterUserId &&
    scope.requestedProjectId === "All" &&
    isWholeUtcDayRange &&
    endDateExclusive.getTime() - startDate.getTime() <= 91 * 24 * 60 * 60 * 1000;

  const eventNameSql = scope.eventName
    ? Prisma.sql`AND "eventName" ILIKE ${`%${scope.eventName}%`}`
    : Prisma.empty;
  const userIdSql = scope.filterUserId
    ? Prisma.sql`AND "userId" ILIKE ${`%${scope.filterUserId}%`}`
    : Prisma.empty;

  return {
    empty: false,
    projectNotFound: false,
    projectIds,
    now,
    startDate,
    endDateExclusive,
    previousStartDate,
    previousEndDateExclusive,
    currentWhere,
    previousWhere,
    useDailyRollups,
    eventNameSql,
    userIdSql,
  };
}

export async function getDashboardKpiData(params: DashboardServiceParams): Promise<
  | {
      status: 200;
      data: {
        kpis: DashboardDataResult["kpis"];
        changes: DashboardDataResult["changes"];
      };
    }
  | { status: 400 | 404; error: string }
> {
  const scopeRes = await resolveScope(params);
  if (!scopeRes.ok) return scopeRes.error;
  const { scope } = scopeRes;

  return withTenantContext(params.authUserId, scope.membership.organizationId, async (tx) => {
    const organizationProjects = await tx.project.findMany({
      where: { organizationId: scope.membership.organizationId },
      select: { id: true, name: true },
    });

    const bounds = computeBounds(scope, organizationProjects);
    if ("projectNotFound" in bounds && bounds.projectNotFound) {
      return { status: 404 as const, error: "Project not found" };
    }
    if (bounds.empty) {
      return {
        status: 200 as const,
        data: {
          kpis: { totalEvents: 0, activeUsers: 0, dau: 0, wau: 0, mau: 0 },
          changes: { totalEvents: null, activeUsers: null },
        },
      };
    }

    const {
      projectIds,
      startDate,
      endDateExclusive,
      previousStartDate,
      previousEndDateExclusive,
      currentWhere,
      previousWhere,
      eventNameSql,
      userIdSql,
      now,
    } = bounds;

    const utcTodayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const sevenDayStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDayStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const userMetricsStart = new Date(Math.min(previousStartDate.getTime(), thirtyDayStart.getTime()));

    const [totalEvents, previousTotalEvents, activeUserMetrics] = await Promise.all([
      tx.analyticsEvent.count({ where: currentWhere }),
      tx.analyticsEvent.count({ where: previousWhere }),
      tx.$queryRaw<
        Array<{
          activeUsers: bigint;
          previousActiveUsers: bigint;
          dau: bigint;
          wau: bigint;
          mau: bigint;
        }>
      >`
        SELECT
          (COUNT(DISTINCT "userId") FILTER (
            WHERE "createdAt" >= ${startDate} AND "createdAt" < ${endDateExclusive}
          ))::bigint AS "activeUsers",
          (COUNT(DISTINCT "userId") FILTER (
            WHERE "createdAt" >= ${previousStartDate} AND "createdAt" < ${previousEndDateExclusive}
          ))::bigint AS "previousActiveUsers",
          (COUNT(DISTINCT "userId") FILTER (
            WHERE "createdAt" >= ${utcTodayStart}
          ))::bigint AS dau,
          (COUNT(DISTINCT "userId") FILTER (
            WHERE "createdAt" >= ${sevenDayStart}
          ))::bigint AS wau,
          (COUNT(DISTINCT "userId") FILTER (
            WHERE "createdAt" >= ${thirtyDayStart}
          ))::bigint AS mau
        FROM "AnalyticsEvent"
        WHERE "projectId" IN (${Prisma.join(projectIds)})
          AND "createdAt" >= ${userMetricsStart}
          AND "createdAt" < ${now}
          AND "userId" IS NOT NULL
          ${eventNameSql}
          ${userIdSql}
      `,
    ]);

    const userMetrics = activeUserMetrics[0];
    const dau = Number(userMetrics?.dau ?? 0);
    const wau = Number(userMetrics?.wau ?? 0);
    const mau = Number(userMetrics?.mau ?? 0);
    const activeUsersCount = Number(userMetrics?.activeUsers ?? 0);
    const previousActiveUsersCount = Number(userMetrics?.previousActiveUsers ?? 0);

    return {
      status: 200 as const,
      data: {
        kpis: {
          totalEvents,
          activeUsers: activeUsersCount,
          dau,
          wau,
          mau,
        },
        changes: {
          totalEvents: getPercentageChange(totalEvents, previousTotalEvents),
          activeUsers: getPercentageChange(activeUsersCount, previousActiveUsersCount),
        },
      },
    };
  });
}

export async function getDashboardChartData(params: DashboardServiceParams): Promise<
  | {
      status: 200;
      data: {
        eventsOverTime: DashboardDataResult["eventsOverTime"];
        activeUsersOverTime: DashboardDataResult["activeUsersOverTime"];
      };
    }
  | { status: 400 | 404; error: string }
> {
  const scopeRes = await resolveScope(params);
  if (!scopeRes.ok) return scopeRes.error;
  const { scope } = scopeRes;

  return withTenantContext(params.authUserId, scope.membership.organizationId, async (tx) => {
    const organizationProjects = await tx.project.findMany({
      where: { organizationId: scope.membership.organizationId },
      select: { id: true, name: true },
    });

    const bounds = computeBounds(scope, organizationProjects);
    if ("projectNotFound" in bounds && bounds.projectNotFound) {
      return { status: 404 as const, error: "Project not found" };
    }
    if (bounds.empty) {
      return {
        status: 200 as const,
        data: { eventsOverTime: [], activeUsersOverTime: [] },
      };
    }

    const {
      projectIds,
      startDate,
      endDateExclusive,
      useDailyRollups,
      eventNameSql,
      userIdSql,
    } = bounds;

    const [dailyEventCounts, dailyActiveUserCounts] = await Promise.all([
      useDailyRollups
        ? tx.$queryRaw<Array<{ day: string; count: bigint }>>`
            SELECT TO_CHAR("bucketStart", 'YYYY-MM-DD') AS day,
                   SUM("eventCount")::bigint AS count
            FROM event_daily_rollups
            WHERE "organizationId" = ${scope.membership.organizationId}
              AND "eventName" = '__all__'
              AND "bucketStart" >= ${startDate}::date
              AND "bucketStart" < ${endDateExclusive}::date
            GROUP BY "bucketStart"
            ORDER BY day ASC
          `
        : tx.$queryRaw<Array<{ day: string; count: bigint }>>`
            SELECT
              TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS day,
              COUNT(*)::bigint AS count
            FROM "AnalyticsEvent"
            WHERE "projectId" IN (${Prisma.join(projectIds)})
              AND "createdAt" >= ${startDate}
              AND "createdAt" < ${endDateExclusive}
              ${eventNameSql}
              ${userIdSql}
            GROUP BY DATE_TRUNC('day', "createdAt")
            ORDER BY DATE_TRUNC('day', "createdAt") ASC
          `,
      useDailyRollups
        ? tx.$queryRaw<Array<{ day: string; count: bigint }>>`
            SELECT TO_CHAR("bucketStart", 'YYYY-MM-DD') AS day,
                   "uniqueUsers" AS count
            FROM event_daily_rollups
            WHERE "organizationId" = ${scope.membership.organizationId}
              AND "eventName" = '__all__'
              AND "bucketStart" >= ${startDate}::date
              AND "bucketStart" < ${endDateExclusive}::date
            ORDER BY day ASC
          `
        : tx.$queryRaw<Array<{ day: string; count: bigint }>>`
            SELECT
              TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS day,
              COUNT(DISTINCT "userId")::bigint AS count
            FROM "AnalyticsEvent"
            WHERE "projectId" IN (${Prisma.join(projectIds)})
              AND "createdAt" >= ${startDate}
              AND "createdAt" < ${endDateExclusive}
              AND "userId" IS NOT NULL
              ${eventNameSql}
              ${userIdSql}
            GROUP BY DATE_TRUNC('day', "createdAt")
            ORDER BY DATE_TRUNC('day', "createdAt") ASC
          `,
    ]);

    return {
      status: 200 as const,
      data: {
        eventsOverTime: dailyEventCounts.map((item) => ({
          date: item.day,
          eventVolume: Number(item.count),
        })),
        activeUsersOverTime: dailyActiveUserCounts.map((item) => ({
          date: item.day,
          activeUsers: Number(item.count),
        })),
      },
    };
  });
}

export async function getDashboardTopEventsData(params: DashboardServiceParams): Promise<
  | {
      status: 200;
      data: {
        topEvents: DashboardDataResult["topEvents"];
      };
    }
  | { status: 400 | 404; error: string }
> {
  const scopeRes = await resolveScope(params);
  if (!scopeRes.ok) return scopeRes.error;
  const { scope } = scopeRes;

  return withTenantContext(params.authUserId, scope.membership.organizationId, async (tx) => {
    const organizationProjects = await tx.project.findMany({
      where: { organizationId: scope.membership.organizationId },
      select: { id: true, name: true },
    });

    const bounds = computeBounds(scope, organizationProjects);
    if ("projectNotFound" in bounds && bounds.projectNotFound) {
      return { status: 404 as const, error: "Project not found" };
    }
    if (bounds.empty) {
      return { status: 200 as const, data: { topEvents: [] } };
    }

    const { currentWhere } = bounds;
    const [totalEvents, groupedEvents] = await Promise.all([
      tx.analyticsEvent.count({ where: currentWhere }),
      tx.analyticsEvent.groupBy({
        by: ["eventName"],
        where: currentWhere,
        _count: { _all: true },
      }),
    ]);

    const topEvents = groupedEvents
      .map((e) => ({
        name: e.eventName,
        count: e._count._all,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((e) => ({
        ...e,
        percentage: totalEvents > 0 ? Math.round((e.count / totalEvents) * 100) : 0,
      }));

    return {
      status: 200 as const,
      data: { topEvents },
    };
  });
}

export async function getDashboardRecentEventsData(params: DashboardServiceParams): Promise<
  | {
      status: 200;
      data: {
        recentEvents: DashboardDataResult["recentEvents"];
      };
    }
  | { status: 400 | 404; error: string }
> {
  const scopeRes = await resolveScope(params);
  if (!scopeRes.ok) return scopeRes.error;
  const { scope } = scopeRes;

  return withTenantContext(params.authUserId, scope.membership.organizationId, async (tx) => {
    const organizationProjects = await tx.project.findMany({
      where: { organizationId: scope.membership.organizationId },
      select: { id: true, name: true },
    });

    const bounds = computeBounds(scope, organizationProjects);
    if ("projectNotFound" in bounds && bounds.projectNotFound) {
      return { status: 404 as const, error: "Project not found" };
    }
    if (bounds.empty) {
      return { status: 200 as const, data: { recentEvents: [] } };
    }

    const { currentWhere } = bounds;
    const recentEvents = await tx.analyticsEvent.findMany({
      where: currentWhere,
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        eventName: true,
        userId: true,
        createdAt: true,
        project: { select: { name: true } },
      },
    });

    const formattedRecentEvents = recentEvents.map((e) => ({
      id: e.id,
      name: e.eventName,
      userId: e.userId,
      projectName: e.project.name,
      timestamp: formatUtcNaiveTimestamp(e.createdAt),
      relativeTime: getRelativeTime(normalizeUtcNaiveTimestamp(e.createdAt)),
    }));

    return {
      status: 200 as const,
      data: { recentEvents: formattedRecentEvents },
    };
  });
}

