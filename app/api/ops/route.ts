import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prismaOps } from "@/lib/prisma-ops";
import { formatUtcNaiveTimestamp } from "@/lib/analytics/date-utils";
import { Prisma } from "@/lib/generated/prisma/client";
import { z } from "zod";

const opsQuerySchema = z.object({
  search: z.string().max(100).default(""),
  status: z.enum(["All", "active", "suspended", "all"]).default("All"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  range: z.enum(["today", "7d", "30d", "90d"]).default("30d"),
});

export const GET = auth(async function GET(request) {
  try {
    const session = request.auth;

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (session.user.role !== "superadmin") {
      return NextResponse.json(
        { error: "Forbidden: Superadmin privileges required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const rawQuery: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      rawQuery[key] = val;
    });

    const parsedQuery = opsQuerySchema.safeParse(rawQuery);
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: parsedQuery.error.issues[0]?.message || "Invalid query parameters" },
        { status: 400 }
      );
    }

    const { search, status: rawStatusFilter, page, limit, range } = parsedQuery.data;
    const statusFilter = rawStatusFilter.toLowerCase() === "all" ? "All" : rawStatusFilter.toLowerCase();

    const now = new Date();
    const startDate = new Date(now);

    if (range === "7d") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (range === "90d") {
      startDate.setDate(startDate.getDate() - 90);
    } else if (range === "today") {
      startDate.setHours(startDate.getHours() - 24);
    } else {
      startDate.setDate(startDate.getDate() - 30);
    }

    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    const searchFilter: Prisma.OrganizationWhereInput = search
      ? {
          OR: [
            {
              name: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              slug: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              owner: {
                email: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          ],
        }
      : {};

    const statusWhere: Prisma.OrganizationWhereInput =
      statusFilter !== "All"
        ? { status: statusFilter }
        : {};

    const organizationWhere: Prisma.OrganizationWhereInput = {
      ...searchFilter,
      ...statusWhere,
    };

    const [
      totalOrganizations,
      activeOrganizations,
      suspendedOrganizations,
      totalUsers,
      totalProjects,
      totalEvents,
      organizations,
      totalMatchingOrganizations,
    ] = await Promise.all([
      prismaOps.organization.count(),

      prismaOps.organization.count({
        where: { status: "active" },
      }),

      prismaOps.organization.count({
        where: { status: "suspended" },
      }),

      prismaOps.user.count(),

      prismaOps.project.count(),

      prismaOps.analyticsEvent.count({
        where: {
          createdAt: {
            gte: startDate,
          },
        },
      }),

      prismaOps.organization.findMany({
        where: organizationWhere,
        orderBy: {
          createdAt: "desc",
        },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          eventQuota: true,
          suspendedAt: true,
          suspendedReason: true,
          createdAt: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              projects: true,
              members: true,
            },
          },
          projects: {
            select: {
              id: true,
            },
          },
        },
      }),

      prismaOps.organization.count({
        where: organizationWhere,
      }),
    ]);

    const orgIds = organizations.map((org) => org.id);

    // Exact calendar-month usage matching ingestion rate limit enforcement
    const currentMonthUsages = orgIds.length
      ? await prismaOps.organizationUsage.findMany({
          where: {
            organizationId: { in: orgIds },
            periodStart: currentMonthStart,
          },
          select: {
            organizationId: true,
            eventCount: true,
          },
        })
      : [];

    const usageMap = new Map(
      currentMonthUsages.map((usage) => [usage.organizationId, usage.eventCount])
    );

    const rows = organizations.map((organization) => {
      const currentMonthUsage = Number(usageMap.get(organization.id) ?? 0);
      const monthlyQuota = Number(organization.eventQuota);
      const remainingEvents = Math.max(0, monthlyQuota - currentMonthUsage);
      const usagePercentage =
        monthlyQuota > 0
          ? Number(((currentMonthUsage / monthlyQuota) * 100).toFixed(1))
          : 0;

      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        status: organization.status ?? "active",
        eventQuota: organization.eventQuota,
        monthlyQuota,
        currentMonthUsage,
        remainingEvents,
        usagePercentage,
        resetDate: nextMonthStart.toISOString(),
        suspendedAt: organization.suspendedAt ? formatUtcNaiveTimestamp(organization.suspendedAt) : null,
        suspendedReason: organization.suspendedReason ?? null,
        ownerName: organization.owner.name,
        ownerEmail: organization.owner.email,
        projectsCount: organization._count.projects,
        membersCount: organization._count.members,
        eventVolume: currentMonthUsage,
        createdAt: formatUtcNaiveTimestamp(organization.createdAt),
      };
    });

    return NextResponse.json({
      range,
      generatedAt: now.toISOString(),

      system: {
        status: "operational",
        database: "connected",
      },

      metrics: {
        totalOrganizations,
        activeOrganizations,
        suspendedOrganizations,
        totalUsers,
        totalProjects,
        totalEvents,
      },

      organizations: rows,

      pagination: {
        page,
        limit,
        total: totalMatchingOrganizations,
        totalPages: Math.max(
          1,
          Math.ceil(totalMatchingOrganizations / limit)
        ),
      },
    });
  } catch (error) {
    console.error("Ops Console API error:", error);

    return NextResponse.json(
      { error: "Failed to load platform operations data" },
      { status: 500 }
    );
  }
});
