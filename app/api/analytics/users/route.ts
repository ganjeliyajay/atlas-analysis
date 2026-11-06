
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  withTenantContext,
  withUserContext,
} from "@/lib/db-context";

const ACTIVE_WINDOW_DAYS = 30;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export const GET = auth(async function GET(request) {
  try {
    const userId = request.auth?.user?.id;

    if (!userId) {
      return jsonError("Unauthorized", 401);
    }

    // Resolve the user's organization.
    const membership = await withUserContext(userId, (tx) =>
      tx.organizationMember.findFirst({
        where: { userId },
        select: { organizationId: true },
        orderBy: { createdAt: "asc" },
      }),
    );

    if (!membership) {
      return jsonError("Organization not found", 404);
    }

    const { searchParams } = new URL(request.url);
    const rawProjectId = searchParams.get("projectId");
    const projectId = rawProjectId?.trim() || null;

    if (projectId && projectId.length > 200) {
      return jsonError("Invalid projectId", 400);
    }

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - ACTIVE_WINDOW_DAYS);

    return await withTenantContext(
      userId,
      membership.organizationId,
      async (tx) => {
        // Verify that the requested project belongs to this organization.
        if (projectId && projectId !== "All") {
          const project = await tx.project.findFirst({
            where: {
              id: projectId,
              organizationId: membership.organizationId,
            },
            select: { id: true },
          });

          if (!project) {
            return jsonError(
              "Project not found or access denied",
              404,
            );
          }
        }

        // Parameterized optional project filter.
        const projectFilter =
          projectId && projectId !== "All"
            ? Prisma.sql`AND e."projectId" = ${projectId}`
            : Prisma.empty;

        const allTimeProjectFilter =
          projectId && projectId !== "All"
            ? Prisma.sql`AND e."projectId" = ${projectId}`
            : Prisma.empty;

        type QueryResult = {
          data: {
            users: Array<{
              id: string;
              name: string;
              email: string;
              country: string;
              device: string;
              firstSeen: string;
              lastSeen: string;
              totalEvents: number;
              sessionsCount: number;
              status: "active" | "inactive";
              topPages: Array<{
                url: string;
                visits: number;
              }>;
              timeline: Array<{
                id: string;
                action: string;
                timestamp: string;
              }>;
              recentEvents: Array<{
                id: string;
                name: string;
                page: string;
                timestamp: string;
              }>;
            }>;
            dailyUsers: Array<{
              date: string;
              count: number;
            }>;
            totalUsers: number;
            newUsers: number;
            activeUsers: number;
            totalSessions: number;
            returningUsers: number;
          };
        };

        const result = await tx.$queryRaw<QueryResult[]>(
          Prisma.sql`
            WITH all_time_users AS (
              SELECT
                e."userId",
                MIN(e."createdAt") AS first_seen
              FROM "AnalyticsEvent" e
              WHERE
                e."userId" IS NOT NULL
                ${allTimeProjectFilter}
              GROUP BY e."userId"
            ),

            recent_events AS (
              SELECT
                e."id",
                e."userId",
                e."sessionId",
                e."eventName",
                e."pageUrl",
                e."country",
                e."device",
                e."createdAt"
              FROM "AnalyticsEvent" e
              WHERE
                e."userId" IS NOT NULL
                AND e."createdAt" >= ${startDate}
                AND e."createdAt" <= ${now}
                ${projectFilter}
            ),

            user_stats AS (
              SELECT
                "userId",
                COUNT(*)::int AS total_events,
                COUNT(DISTINCT "sessionId")::int AS sessions_count,
                MAX("createdAt") AS last_seen,
                (
                  ARRAY_AGG(
                    "country"
                    ORDER BY "createdAt" DESC
                  ) FILTER (WHERE "country" IS NOT NULL)
                )[1] AS country,
                (
                  ARRAY_AGG(
                    "device"
                    ORDER BY "createdAt" DESC
                  ) FILTER (WHERE "device" IS NOT NULL)
                )[1] AS device
              FROM recent_events
              GROUP BY "userId"
            ),

            ranked_pages AS (
              SELECT
                "userId",
                "pageUrl",
                COUNT(*)::int AS visits,
                ROW_NUMBER() OVER (
                  PARTITION BY "userId"
                  ORDER BY COUNT(*) DESC, "pageUrl" ASC
                ) AS page_rank
              FROM recent_events
              WHERE "pageUrl" IS NOT NULL
              GROUP BY "userId", "pageUrl"
            ),

            top_pages AS (
              SELECT
                "userId",
                JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'url', "pageUrl",
                    'visits', visits
                  )
                  ORDER BY page_rank
                ) AS pages
              FROM ranked_pages
              WHERE page_rank <= 5
              GROUP BY "userId"
            ),

            ranked_recent_events AS (
              SELECT
                "id",
                "userId",
                "eventName",
                "pageUrl",
                "createdAt",
                ROW_NUMBER() OVER (
                  PARTITION BY "userId"
                  ORDER BY "createdAt" DESC, "id" DESC
                ) AS event_rank
              FROM recent_events
            ),

            latest_events AS (
              SELECT
                "userId",
                JSONB_AGG(
                  JSONB_BUILD_OBJECT(
                    'id', "id",
                    'name', "eventName",
                    'page', COALESCE("pageUrl", '—'),
                    'timestamp', "createdAt"
                  )
                  ORDER BY "createdAt" DESC
                ) AS events
              FROM ranked_recent_events
              WHERE event_rank <= 5
              GROUP BY "userId"
            ),

            daily_counts AS (
              SELECT
                DATE("createdAt" AT TIME ZONE 'UTC') AS activity_date,
                COUNT(DISTINCT "userId")::int AS user_count
              FROM recent_events
              GROUP BY DATE("createdAt" AT TIME ZONE 'UTC')
            ),

            daily_series AS (
              SELECT
                generate_series(
                  DATE_TRUNC('day', ${now}::timestamp) - INTERVAL '29 days',
                  DATE_TRUNC('day', ${now}::timestamp),
                  INTERVAL '1 day'
                )::date AS activity_date
            ),

            formatted_users AS (
              SELECT
                s."userId" AS id,
                s.total_events,
                s.sessions_count,
                s.last_seen,
                COALESCE(s.country, 'Unknown') AS country,
                COALESCE(s.device, 'Unknown') AS device,
                a.first_seen,
                COALESCE(p.pages, '[]'::jsonb) AS top_pages,
                COALESCE(l.events, '[]'::jsonb) AS recent_events
              FROM user_stats s
              INNER JOIN all_time_users a
                ON a."userId" = s."userId"
              LEFT JOIN top_pages p
                ON p."userId" = s."userId"
              LEFT JOIN latest_events l
                ON l."userId" = s."userId"
            )

            SELECT JSONB_BUILD_OBJECT(
              'users',
              COALESCE(
                (
                  SELECT JSONB_AGG(
                    JSONB_BUILD_OBJECT(
                      'id', u.id,
                      'name', 'Visitor ' || LEFT(u.id, 8),
                      'email', u.id,
                      'country', u.country,
                      'device', u.device,
                      'firstSeen', u.first_seen,
                      'lastSeen', u.last_seen,
                      'totalEvents', u.total_events,
                      'sessionsCount', u.sessions_count,
                      'status', 'active',
                      'topPages', u.top_pages,
                      'timeline', JSONB_BUILD_ARRAY(
                        JSONB_BUILD_OBJECT(
                          'id', u.id || '-first',
                          'action', 'First seen',
                          'timestamp', u.first_seen
                        ),
                        JSONB_BUILD_OBJECT(
                          'id', u.id || '-last',
                          'action', 'Last activity',
                          'timestamp', u.last_seen
                        )
                      ),
                      'recentEvents', u.recent_events
                    )
                    ORDER BY u.last_seen DESC
                  )
                  FROM formatted_users u
                ),
                '[]'::jsonb
              ),

              'dailyUsers',
              COALESCE(
                (
                  SELECT JSONB_AGG(
                    JSONB_BUILD_OBJECT(
                      'date', TO_CHAR(d.activity_date, 'YYYY-MM-DD'),
                      'count', COALESCE(c.user_count, 0)
                    )
                    ORDER BY d.activity_date
                  )
                  FROM daily_series d
                  LEFT JOIN daily_counts c
                    ON c.activity_date = d.activity_date
                ),
                '[]'::jsonb
              ),

              'totalUsers',
              (
                SELECT COUNT(*)::int
                FROM all_time_users
              ),

              'newUsers',
              (
                SELECT COUNT(*)::int
                FROM all_time_users
                WHERE first_seen >= ${startDate}
              ),

              'activeUsers',
              (
                SELECT COUNT(*)::int
                FROM user_stats
              ),

              'returningUsers',
              (
                SELECT COUNT(*)::int
                FROM formatted_users
                WHERE first_seen < ${startDate}
              ),

              'totalSessions',
              (
                SELECT COUNT(DISTINCT "sessionId")::int
                FROM recent_events
                WHERE "sessionId" IS NOT NULL
              )
            ) AS data
          `,
        );

        const data = result[0]?.data;

        if (!data) {
          throw new Error("Users analytics query returned no data");
        }

        return NextResponse.json({
          success: true,
          data: {
            ...data,
            range: "30d",
          },
        });
      },
    );
  } catch (error) {
    console.error("Users Analytics API Error:", error);

    return NextResponse.json(
      { error: "Failed to fetch users analytics" },
      { status: 500 },
    );
  }
});
