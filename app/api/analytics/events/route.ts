import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        // 1. Get user's organization
        const membership = await prisma.organizationMember.findFirst({
            where: {
                userId: session.user.id,
            },
            select: {
                organizationId: true,
            },
            orderBy: {
                createdAt: "asc",
            },
        });

        if (!membership) {
            return NextResponse.json(
                { error: "Organization not found" },
                { status: 404 }
            );
        }

        // 2. Get query parameters
        const { searchParams } = new URL(request.url);

        const projectId = searchParams.get("projectId");
        const range = searchParams.get("range") || "7d";

        const page = Math.max(
            1,
            Number.parseInt(searchParams.get("page") || "1", 10) || 1
        );

        const limit = Math.min(
            100,
            Math.max(
                1,
                Number.parseInt(searchParams.get("limit") || "10", 10) || 10
            )
        );

        const skip = (page - 1) * limit;

        // 3. Calculate date range
        const now = new Date();
        const startDate = new Date(now);

        switch (range) {
            case "today":
                startDate.setHours(0, 0, 0, 0);
                break;

            case "30d":
                startDate.setDate(now.getDate() - 30);
                break;

            case "90d":
                startDate.setDate(now.getDate() - 90);
                break;

            case "7d":
            default:
                startDate.setDate(now.getDate() - 7);
                break;
        }

        // 4. Build database filter
        const where = {
            project: {
                organizationId: membership.organizationId,
            },
            createdAt: {
                gte: startDate,
                lte: now,
            },
            ...(projectId ? { projectId } : {}),
        };

        // 5. Fetch analytics events
        const events = await prisma.analyticsEvent.findMany({
            where,
            orderBy: {
                createdAt: "desc",
            },
            skip,
            take: limit,
            select: {
                id: true,
                eventName: true,
                userId: true,
                sessionId: true,
                properties: true,
                pageUrl: true,
                country: true,
                device: true,
                browser: true,
                createdAt: true,
                projectId: true,
            },
        });

        // 6. Count total events
        const totalEvents = await prisma.analyticsEvent.count({
            where,
        });

        // 7. Count unique users
        const uniqueUsers = await prisma.analyticsEvent.findMany({
            where: {
                ...where,
                userId: {
                    not: null,
                },
            },
            distinct: ["userId"],
            select: {
                userId: true,
            },
        });

        // 8. Count unique event names
        const uniqueEventNames = await prisma.analyticsEvent.findMany({
            where,
            distinct: ["eventName"],
            select: {
                eventName: true,
            },
        });

        // 9. Get daily event volume
        const dailyEvents = projectId
            ? await prisma.$queryRaw<
                Array<{ date: Date; count: bigint }>
            >`
                  SELECT
                      DATE_TRUNC('day', "createdAt") AS date,
                      COUNT(*)::bigint AS count
                  FROM "AnalyticsEvent"
                  WHERE
                      "createdAt" >= ${startDate}
                      AND "createdAt" <= ${now}
                      AND "projectId" = ${projectId}
                      AND "projectId" IN (
                          SELECT "id"
                          FROM "Project"
                          WHERE "organizationId" = ${membership.organizationId}
                      )
                  GROUP BY DATE_TRUNC('day', "createdAt")
                  ORDER BY date ASC
              `
            : await prisma.$queryRaw<
                Array<{ date: Date; count: bigint }>
            >`
                  SELECT
                      DATE_TRUNC('day', "createdAt") AS date,
                      COUNT(*)::bigint AS count
                  FROM "AnalyticsEvent"
                  WHERE
                      "createdAt" >= ${startDate}
                      AND "createdAt" <= ${now}
                      AND "projectId" IN (
                          SELECT "id"
                          FROM "Project"
                          WHERE "organizationId" = ${membership.organizationId}
                      )
                  GROUP BY DATE_TRUNC('day', "createdAt")
                  ORDER BY date ASC
              `;

        // 10. Convert BigInt counts to numbers
        const formattedDailyEvents = dailyEvents.map((item) => ({
            date: item.date.toISOString().slice(0, 10),
            count: Number(item.count),
        }));

        // 11. Return analytics data
        return NextResponse.json({
            success: true,
            data: {
                events,
                totalEvents,
                activeUsers: uniqueUsers.length,
                uniqueEventNames: uniqueEventNames.length,
                dailyEvents: formattedDailyEvents,
                range,
                pagination: {
                    page,
                    limit,
                    total: totalEvents,
                    totalPages: Math.ceil(totalEvents / limit),
                },
            },
        });
    } catch (error) {
        console.error("Analytics Events API Error:", error);

        return NextResponse.json(
            { error: "Failed to fetch analytics events" },
            { status: 500 }
        );
    }
}