
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prismaOps } from "@/lib/prisma-ops";
import { Prisma } from "@/lib/generated/prisma/client";

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
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    const search = (searchParams.get("search") ?? "").trim();

    const page = Math.max(
      1,
      Number.parseInt(searchParams.get("page") ?? "1", 10) || 1
    );

    const limit = Math.min(
      50,
      Math.max(
        1,
        Number.parseInt(searchParams.get("limit") ?? "10", 10) || 10
      )
    );

    const range = searchParams.get("range") ?? "30d";

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

    const organizationWhere: Prisma.OrganizationWhereInput = search
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

    const [
      totalOrganizations,
      totalUsers,
      totalProjects,
      totalEvents,
      organizations,
      totalMatchingOrganizations,
    ] = await Promise.all([
      prismaOps.organization.count(),

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

    const organizationProjectIds = organizations.flatMap(
      (organization) =>
        organization.projects.map((project) => project.id)
    );

    const eventCountsByProject = organizationProjectIds.length
      ? await prismaOps.analyticsEvent.groupBy({
          by: ["projectId"],
          where: {
            projectId: {
              in: organizationProjectIds,
            },
            createdAt: {
              gte: startDate,
            },
          },
          _count: {
            _all: true,
          },
        })
      : [];

    const eventCountMap = new Map(
      eventCountsByProject.map((item) => [
        item.projectId,
        item._count._all,
      ])
    );

    const rows = organizations.map((organization) => {
      const eventVolume = organization.projects.reduce(
        (total, project) =>
          total + (eventCountMap.get(project.id) ?? 0),
        0
      );

      return {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        ownerName: organization.owner.name,
        ownerEmail: organization.owner.email,
        projectsCount: organization._count.projects,
        membersCount: organization._count.members,
        eventVolume,
        createdAt: organization.createdAt.toISOString(),
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
