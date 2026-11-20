
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActiveOrganizationForUser } from "@/lib/organization";
import { withTenantContext } from "@/lib/db-context";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";

const pagesQuerySchema = z.object({
  projectId: z.string().max(100).optional().nullable(),
  device: z.string().max(50).default("all"),
  range: z.enum(["7d", "30d", "90d"]).default("30d"),
});

export const GET = auth(async function GET(request) {
  try {
    const userId = request.auth?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Step 1: Verify user's organization membership
    const membership = await getActiveOrganizationForUser(userId);

    if (!membership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    // Step 2: Execute analytics inside tenant context
    return await withTenantContext(
      userId,
      membership.organizationId,
      async (tx) => {
        const { searchParams } = new URL(request.url);
        const rawQuery: Record<string, string> = {};
        searchParams.forEach((val, key) => {
          rawQuery[key] = val;
        });

        const parsed = pagesQuerySchema.safeParse(rawQuery);
        if (!parsed.success) {
          return NextResponse.json(
            { error: parsed.error.issues[0]?.message || "Invalid query parameters" },
            { status: 400 }
          );
        }

        const { projectId, device, range } = parsed.data;

        const days = Number(range.replace("d", ""));
        const now = new Date();
        const todayUtcStart = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
        ));
        const startDate = new Date(todayUtcStart);
        startDate.setUTCDate(startDate.getUTCDate() - (days - 1));

        // Verify project belongs to current organization
        if (projectId && projectId !== "All") {
          const project = await tx.project.findFirst({
            where: {
              id: projectId,
              organizationId: membership.organizationId,
            },
            select: { id: true },
          });

          if (!project) {
            return NextResponse.json(
              { error: "Project not found or access denied" },
              { status: 404 }
            );
          }
        }

        const baseWhere = {
          createdAt: {
            gte: startDate,
            lte: now,
          },
          project: {
            organizationId: membership.organizationId,
          },
          ...(projectId && projectId !== "All"
            ? { projectId }
            : {}),
          ...(device !== "all"
            ? {
              device: {
                equals: device,
                mode: "insensitive" as const,
              },
            }
            : {}),
        };

        // Fetch page views with the UTC calendar date formatted in SQL. This
        // avoids converting timestamp-without-time-zone values through the
        // Node process timezone when building daily chart buckets.
        const pageViewConditions = [
          Prisma.sql`e."createdAt" >= ${startDate}`,
          Prisma.sql`e."createdAt" <= ${now}`,
          Prisma.sql`p."organizationId" = ${membership.organizationId}`,
          Prisma.sql`e."eventName" = 'page_view'`,
          Prisma.sql`e."pageUrl" IS NOT NULL`,
        ];
        if (projectId && projectId !== "All") {
          pageViewConditions.push(Prisma.sql`e."projectId" = ${projectId}`);
        }
        if (device !== "all") {
          pageViewConditions.push(Prisma.sql`e."device" ILIKE ${device}`);
        }

        const events = await tx.$queryRaw<Array<{
          pageUrl: string | null;
          userId: string | null;
          sessionId: string | null;
          device: string | null;
          dateKey: string;
        }>>(Prisma.sql`
          SELECT
            e."pageUrl",
            e."userId",
            e."sessionId",
            e."device",
            TO_CHAR(e."createdAt", 'YYYY-MM-DD') AS "dateKey"
          FROM "AnalyticsEvent" e
          INNER JOIN "Project" p ON p."id" = e."projectId"
          WHERE ${Prisma.join(pageViewConditions, " AND ")}
          ORDER BY e."createdAt" ASC
        `);

        // Fetch page exit events
        const pageExitEvents =
          await tx.analyticsEvent.findMany({
            where: {
              ...baseWhere,
              eventName: "page_exit",
              pageUrl: { not: null },
            },
            select: {
              pageUrl: true,
              sessionId: true,
              properties: true,
            },
          });

        const pageMap = new Map<
          string,
          {
            url: string;
            views: number;
            users: Set<string>;
            sessions: Set<string>;
            durations: number[];
          }
        >();

        const dailyMap = new Map<string, number>();
        const sessionPageViews = new Map<string, number>();

        // Aggregate page views
        for (const event of events) {
          const url = event.pageUrl?.trim();

          if (!url) continue;

          if (!pageMap.has(url)) {
            pageMap.set(url, {
              url,
              views: 0,
              users: new Set<string>(),
              sessions: new Set<string>(),
              durations: [],
            });
          }

          const page = pageMap.get(url)!;
          page.views += 1;

          if (event.userId) {
            page.users.add(event.userId);
          }

          if (event.sessionId) {
            page.sessions.add(event.sessionId);

            sessionPageViews.set(
              event.sessionId,
              (sessionPageViews.get(event.sessionId) || 0) + 1
            );
          }

          const dateKey = event.dateKey;

          dailyMap.set(
            dateKey,
            (dailyMap.get(dateKey) || 0) + 1
          );
        }

        // Aggregate page duration
        for (const event of pageExitEvents) {
          const url = event.pageUrl?.trim();

          if (!url) continue;

          const properties = event.properties;

          if (
            !properties ||
            typeof properties !== "object" ||
            Array.isArray(properties)
          ) {
            continue;
          }

          const durationSeconds = (
            properties as Record<string, unknown>
          ).durationSeconds;

          if (
            typeof durationSeconds !== "number" ||
            !Number.isFinite(durationSeconds) ||
            durationSeconds < 0
          ) {
            continue;
          }

          if (!pageMap.has(url)) {
            pageMap.set(url, {
              url,
              views: 0,
              users: new Set<string>(),
              sessions: new Set<string>(),
              durations: [],
            });
          }

          pageMap.get(url)!.durations.push(durationSeconds);
        }

        // Build page rows
        const pages = Array.from(pageMap.values())
          .map((page) => {
            const averageTimeOnPage =
              page.durations.length > 0
                ? Math.round(
                  page.durations.reduce(
                    (sum, duration) => sum + duration,
                    0
                  ) / page.durations.length
                )
                : 0;

            return {
              url: page.url,
              title: page.url,
              views: page.views,
              uniqueUsers: page.users.size,
              sessions: page.sessions.size,
              averageTimeOnPage,
            };
          })
          .sort((a, b) => b.views - a.views);

        // Daily chart data
        const dailyEvents: {
          date: string;
          count: number;
        }[] = [];

        for (let i = days - 1; i >= 0; i--) {
          const date = new Date(todayUtcStart);
          date.setUTCDate(date.getUTCDate() - i);

          const dateKey = date.toISOString().slice(0, 10);

          dailyEvents.push({
            date: dateKey,
            count: dailyMap.get(dateKey) || 0,
          });
        }

        const totalPageViews = events.length;

        const totalSessions = new Set(
          events
            .map((event) => event.sessionId)
            .filter(
              (sessionId): sessionId is string =>
                Boolean(sessionId)
            )
        ).size;

        const uniqueVisitors = new Set(
          events
            .map((event) => event.userId)
            .filter(
              (id): id is string => Boolean(id)
            )
        ).size;

        const bouncedSessions = Array.from(
          sessionPageViews.values()
        ).filter((views) => views === 1).length;

        const bounceRate =
          totalSessions > 0
            ? Number(
              (
                (bouncedSessions / totalSessions) *
                100
              ).toFixed(2)
            )
            : 0;

        // Overall average time on page
        const allDurations = pageExitEvents
          .map((event) => {
            const properties = event.properties;

            if (
              !properties ||
              typeof properties !== "object" ||
              Array.isArray(properties)
            ) {
              return null;
            }

            const duration = (
              properties as Record<string, unknown>
            ).durationSeconds;

            return typeof duration === "number" &&
              Number.isFinite(duration) &&
              duration >= 0
              ? duration
              : null;
          })
          .filter(
            (duration): duration is number =>
              duration !== null
          );

        const averageTimeOnPage =
          allDurations.length > 0
            ? Math.round(
              allDurations.reduce(
                (sum, duration) => sum + duration,
                0
              ) / allDurations.length
            )
            : 0;

        return NextResponse.json({
          success: true,
          data: {
            pages,
            dailyEvents,
            totalPageViews,
            uniqueVisitors,
            totalPages: pages.length,
            totalSessions,
            bouncedSessions,
            bounceRate,
            averageTimeOnPage,
            range,
            device,
            projectId: projectId || "All",
          },
        });
      }
    );
  } catch (error) {
    console.error("Pages Analytics API Error:", error);

    return NextResponse.json(
      { error: "Failed to fetch pages analytics" },
      { status: 500 }
    );
  }
});
