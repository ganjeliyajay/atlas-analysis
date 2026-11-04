import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";

const querySchema = z.object({
  projectId: z.string().trim().optional(),
  range: z.enum(["today", "7d", "30d", "90d"]).default("7d"),
  search: z.string().trim().max(200).optional(),
  eventName: z.string().trim().max(200).optional(),
  userId: z.string().trim().max(200).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

function parseDate(value: string, endOfDay = false): Date | null {
  // Date inputs send YYYY-MM-DD; parse them in local server timezone boundaries.
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = dateOnly
    ? new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}


export const GET = auth(async function GET(request) {
  try {
    const session = request.auth;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { userId: session.user.id },
      select: { organizationId: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      projectId: searchParams.get("projectId") || undefined,
      range: searchParams.get("range") || "7d",
      search: searchParams.get("search") || undefined,
      eventName: searchParams.get("eventName") || undefined,
      userId: searchParams.get("userId") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
      page: searchParams.get("page") || "1",
      limit: searchParams.get("limit") || "10",
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const {
      projectId,
      range,
      search,
      eventName,
      userId,
      startDate,
      endDate,
      page,
      limit,
    } = parsed.data;

    const now = new Date();
    const rangeStart = new Date(now);
    switch (range) {
      case "today":
        rangeStart.setHours(0, 0, 0, 0);
        break;
      case "30d":
        rangeStart.setDate(now.getDate() - 30);
        break;
      case "90d":
        rangeStart.setDate(now.getDate() - 90);
        break;
      case "7d":
      default:
        rangeStart.setDate(now.getDate() - 7);
        break;
    }

    const parsedStartDate = startDate ? parseDate(startDate) : rangeStart;
    const parsedEndDate = endDate ? parseDate(endDate, true) : now;
    if (
      !parsedStartDate ||
      !parsedEndDate ||
      parsedStartDate > parsedEndDate
    ) {
      return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
    }

    if (projectId && projectId !== "All") {
      const projectExists = await prisma.project.findFirst({
        where: { id: projectId, organizationId: membership.organizationId },
        select: { id: true },
      });
      if (!projectExists) {
        return NextResponse.json(
          { error: "Project not found or access denied" },
          { status: 404 },
        );
      }
    }

    const where = {
      project: { organizationId: membership.organizationId },
      createdAt: { gte: parsedStartDate, lte: parsedEndDate },
      ...(projectId && projectId !== "All" ? { projectId } : {}),
      ...(eventName
        ? { eventName: { equals: eventName, mode: "insensitive" as const } }
        : {}),
      ...(userId
        ? { userId: { contains: userId, mode: "insensitive" as const } }
        : {}),
      ...(search
        ? {
            OR: [
              { eventName: { contains: search, mode: "insensitive" as const } },
              { userId: { contains: search, mode: "insensitive" as const } },
              { id: { equals: search } },
            ],
          }
        : {}),
    };

    const skip = (page - 1) * limit;
    const [events, totalEvents, uniqueUsers, uniqueEventNames] = await Promise.all([
      prisma.analyticsEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
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
      }),
      prisma.analyticsEvent.count({ where }),
      prisma.analyticsEvent.findMany({
        where: {
          ...where,
          AND: [
            ...(userId
              ? [{ userId: { contains: userId, mode: "insensitive" as const } }]
              : []),
            { userId: { not: null } },
          ],
        },
        distinct: ["userId"],
        select: { userId: true },
      }),
      prisma.analyticsEvent.findMany({
        where,
        distinct: ["eventName"],
        select: { eventName: true },
      }),
    ]);

    // Daily chart is filtered by the same search/filter criteria and organization.
    const sqlConditions = [
      Prisma.sql`e."createdAt" >= ${parsedStartDate}`,
      Prisma.sql`e."createdAt" <= ${parsedEndDate}`,
      Prisma.sql`p."organizationId" = ${membership.organizationId}`,
    ];
    if (projectId && projectId !== "All") {
      sqlConditions.push(Prisma.sql`e."projectId" = ${projectId}`);
    }
    if (eventName) {
      sqlConditions.push(Prisma.sql`e."eventName" ILIKE ${eventName}`);
    }
    if (userId) {
      sqlConditions.push(Prisma.sql`e."userId" ILIKE ${`%${userId}%`}`);
    }
    if (search) {
      sqlConditions.push(Prisma.sql`(
        e."eventName" ILIKE ${`%${search}%`} OR
        e."userId" ILIKE ${`%${search}%`} OR
        e."id"::text ILIKE ${`%${search}%`}
      )`);
    }

    const dailyEvents = await prisma.$queryRaw<Array<{ date: Date; count: bigint }>>(
      Prisma.sql`
        SELECT DATE_TRUNC('day', e."createdAt") AS date, COUNT(*)::bigint AS count
        FROM "AnalyticsEvent" e
        INNER JOIN "Project" p ON p."id" = e."projectId"
        WHERE ${Prisma.join(sqlConditions, " AND ")}
        GROUP BY DATE_TRUNC('day', e."createdAt")
        ORDER BY date ASC
      `,
    );

    return NextResponse.json({
      success: true,
      data: {
        events,
        totalEvents,
        activeUsers: uniqueUsers.length,
        uniqueEventNames: uniqueEventNames.length,
        dailyEvents: dailyEvents.map((item) => ({
          date: item.date.toISOString().slice(0, 10),
          count: Number(item.count),
        })),
        range,
        pagination: {
          page,
          limit,
          total: totalEvents,
          totalPages: Math.max(1, Math.ceil(totalEvents / limit)),
        },
      },
    });
  } catch (error) {
    console.error("Analytics Events API Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics events" },
      { status: 500 },
    );
  }
});
